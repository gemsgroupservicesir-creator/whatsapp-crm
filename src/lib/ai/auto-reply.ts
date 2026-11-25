import { supabaseAdmin } from './admin-client'
import { loadAiConfig } from './config'
import { buildConversationContext } from './context'
import { retrieveKnowledge } from './knowledge'
import { generateReply } from './generate'
import { buildSystemPrompt } from './defaults'
import { buildHandoffSummary } from './handoff'
import { logAiUsage } from './usage'
import { latestUserMessage } from './query'
import {
  engineSendText,
  loadAccountMetaCredentials,
} from '@/lib/flows/meta-send'
import { sendTypingIndicator } from '@/lib/whatsapp/meta-api'
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import {
  parseLeadNotes,
  serializeLeadNotes,
  formatNotesForAiContext,
  type LeadNote,
} from '@/lib/leads/notes'
import { matchesLeadAssignmentRule } from '@/lib/leads/meta-leads'
import { findMatchingCounsellingPlaybook } from '@/lib/counselling/engine'

interface DispatchArgs {
  /** Tenancy key — drives config, contact, and whatsapp_config lookups. */
  accountId: string
  conversationId: string
  contactId: string
  /** The account's WhatsApp config owner, used for the outbound send's
   *  audit columns (mirrors how the flow runner passes it through). */
  configOwnerUserId: string
  /** Meta's wamid of the customer message we're replying to. When set,
   *  a typing indicator (which also marks it read) is shown while the
   *  reply is generated. Optional so older callers keep working. */
  inboundMessageId?: string
}

/**
 * AI auto-reply for a freshly-arrived inbound message.
 *
 * Invoked from the WhatsApp webhook's `after()` block, only when no
 * deterministic flow consumed the message (flows win). Mirrors the flow
 * runner's contract: it owns its try/catch and NEVER throws — a failing
 * or slow LLM call must not affect the webhook's 200 to Meta.
 *
 * Eligibility gates (any → silent no-op):
 *   - AI off / auto-reply disabled for the account
 *   - a human agent is assigned (they own the thread)
 *   - auto-reply was disabled for this conversation (prior handoff)
 *   - the per-conversation reply cap is reached
 *   - there's nothing to reply to
 *
 * The 24h WhatsApp session window is inherently open here — we're
 * reacting to a customer message that just landed — so no separate
 * window check is needed.
 */
export async function dispatchInboundToAiReply(
  args: DispatchArgs,
): Promise<void> {
  const {
    accountId,
    conversationId,
    contactId,
    configOwnerUserId,
    inboundMessageId,
  } = args

  try {
    const db = supabaseAdmin()

    const config = await loadAiConfig(db, accountId)
    if (!config || !config.autoReplyEnabled) return

    // Check if this conversation belongs to a Meta campaign lead
    const { data: leadLog } = await db
      .from('meta_lead_logs')
      .select('id, full_name, college, course, city, campaign_name, form_name, ad_name, raw_data, assigned_to, ai_chat_enabled, notes')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const isCampaignLead = Boolean(leadLog && leadLog.ai_chat_enabled !== false)

    // Deterministic, user-configured responders win over the LLM for standard threads.
    // For campaign leads, AI auto-chat is explicitly enabled according to the campaign.
    if (!isCampaignLead) {
      const { data: autoResponders } = await db
        .from('automations')
        .select('id')
        .eq('account_id', accountId)
        .eq('is_active', true)
        .in('trigger_type', ['new_message_received', 'keyword_match'])
        .limit(1)
      if (autoResponders && autoResponders.length > 0) return
    }

    const { data: conv, error: convErr } = await db
      .from('conversations')
      .select('assigned_agent_id, ai_autoreply_disabled, ai_reply_count')
      .eq('id', conversationId)
      .maybeSingle()
    if (convErr || !conv) return

    // For non-campaign threads, an assigned human owns the thread.
    // For campaign leads, the AI acts as the counselor's digital assistant until explicitly paused ("Take over").
    if (!isCampaignLead && conv.assigned_agent_id) return
    if (conv.ai_autoreply_disabled) return // handed off / turned off here
    // Cheap early-out; the authoritative cap check is the atomic claim
    // below (this read can race a concurrent inbound).
    if (conv.ai_reply_count >= config.autoReplyMaxPerConversation) return

    const messages = await buildConversationContext(db, conversationId)
    if (messages.length === 0) return

    // Account-wide throttle on the shared BYO key. The per-conversation
    // cap bounds one thread; this bounds a burst across many threads (a
    // marketing blast landing 200 replies at once) so we never run the
    // owner's key past the provider's rate limit. Over the limit → skip
    // the auto-reply; the inbound still sits in the inbox for a human.
    const acctLimit = checkRateLimit(
      `ai-autoreply:${accountId}`,
      RATE_LIMITS.aiAutoReplyAccount,
    )
    if (!acctLimit.success) {
      console.warn(
        `[ai auto-reply] account ${accountId} hit the per-account rate limit — skipping this inbound.`,
      )
      return
    }

    // Every gate has passed — we're committed to attempting a reply, so
    // show the customer "typing…" (and mark their message read) while the
    // retrieval + LLM round trips run. Meta clears the indicator after
    // 25 s or when our reply lands, whichever is first, so there's
    // nothing to undo on the handoff / no-text path. Strictly
    // best-effort: a failed indicator must never cost us the reply.
    if (inboundMessageId) {
      await showTypingIndicator(db, accountId, inboundMessageId)
    }

    // Ground the reply in the account's knowledge base (best-effort).
    const knowledge = await retrieveKnowledge(
      db,
      accountId,
      config,
      latestUserMessage(messages),
    )

    // Build rich campaign & student context if this is a campaign lead
    let campaignContext = ''
    if (isCampaignLead && leadLog) {
      let campaignPrompt = ''
      let counselorName = ''

      // Fetch matching campaign rule prompt
      const { data: rules } = await db
        .from('lead_assignment_rules')
        .select('name, criteria_type, operator, match_value, ai_campaign_prompt')
        .eq('account_id', accountId)
        .eq('is_active', true)
        .order('priority', { ascending: true })

      if (rules) {
        for (const r of rules) {
          if (!r.ai_campaign_prompt) continue
          if (
            matchesLeadAssignmentRule(r, {
              campaignName: leadLog.campaign_name || undefined,
              formName: leadLog.form_name || undefined,
              college: leadLog.college || undefined,
              course: leadLog.course || undefined,
              adName: leadLog.ad_name || undefined,
              city: leadLog.city || undefined,
              rawFields: (leadLog.raw_data as Record<string, any>) || undefined,
            })
          ) {
            campaignPrompt = r.ai_campaign_prompt
            break
          }
        }
      }

      // Fetch counselor name
      const assignedUserId = conv.assigned_agent_id || leadLog.assigned_to
      if (assignedUserId) {
        const { data: prof } = await db
          .from('profiles')
          .select('full_name')
          .eq('user_id', assignedUserId)
          .maybeSingle()
        if (prof?.full_name) counselorName = prof.full_name
      }

      const parts: string[] = []
      parts.push(`STUDENT INQUIRY CONTEXT:`)
      parts.push(`- Student Name: ${leadLog.full_name || 'Student'}`)
      if (leadLog.course) parts.push(`- Course Interested: ${leadLog.course}`)
      if (leadLog.college) parts.push(`- Target Institution: ${leadLog.college}`)
      if (leadLog.city) parts.push(`- City/Location: ${leadLog.city}`)
      if (leadLog.campaign_name) parts.push(`- Marketing Campaign: ${leadLog.campaign_name}`)
      if (counselorName) parts.push(`- Dedicated Admission Counselor: ${counselorName}`)

      // Include all counselor and AI notes in the context so the AI gives accurate follow-ups!
      const notesContext = formatNotesForAiContext(leadLog.notes)
      if (notesContext) {
        parts.push(notesContext)
      }

      if (campaignPrompt) {
        parts.push(`\nCAMPAIGN ADMISSION GUIDELINES:\n${campaignPrompt}`)
      } else {
        parts.push(
          `\nADMISSION GUIDELINES:\nAct as an expert, warm, and helpful educational admission assistant. Answer the student's questions regarding courses, eligibility, fee structures, scholarships, and admission procedures. Offer to verify their eligibility or arrange a personal counseling consultation with Counselor ${
            counselorName || 'our admissions team'
          }.`
        )
      }
      campaignContext = `\n\n[CAMPAIGN LEAD CONTEXT]\n${parts.join('\n')}`
    }

    // Check if an automated Agent Counselling Playbook matches this inquiry's university, course, or message
    let counsellingContext = ''
    try {
      const matchedPlaybook = await findMatchingCounsellingPlaybook(db, accountId, {
        university: leadLog?.college,
        course: leadLog?.course,
        messageText: latestUserMessage(messages),
        requireAutoWhatsapp: true,
      })

      if (matchedPlaybook) {
        const pbPoints = matchedPlaybook.counsellingPoints
          .slice(0, 6)
          .map((pt) => `- ${pt.title}: ${pt.detail}`)
          .join('\n')
        const pbFaqs = matchedPlaybook.objectionHandlers
          .slice(0, 3)
          .map((o) => `Q: ${o.question}\nA: ${o.answer}`)
          .join('\n')

        counsellingContext = [
          `\n\n[VERIFIED AGENT COUNSELLING PLAYBOOK]`,
          `University: ${matchedPlaybook.universityName}`,
          `Course: ${matchedPlaybook.courseName}`,
          matchedPlaybook.websiteUrl ? `Official Website Link: ${matchedPlaybook.websiteUrl}` : '',
          `Overview: ${matchedPlaybook.universityOverview}`,
          pbPoints ? `Key Counselling Points:\n${pbPoints}` : '',
          pbFaqs ? `Common Student Q&A:\n${pbFaqs}` : '',
          `Suggested WhatsApp Style Guide:\n${matchedPlaybook.whatsappReplyDraft}`,
        ]
          .filter(Boolean)
          .join('\n')
      }
    } catch {
      // Non-fatal: continue with normal AI reply if playbook lookup unavailable
    }

    const systemPrompt = buildSystemPrompt({
      userPrompt: (config.systemPrompt || '') + campaignContext + counsellingContext,
      mode: 'auto_reply',
      knowledge,
    })

    const { text, handoff, usage } = await generateReply({
      config,
      systemPrompt,
      messages,
    })

    // Record token spend on the account's BYO key. Fire-and-forget so it
    // never adds latency to the customer-facing send: `logAiUsage`
    // swallows its own errors, so the floating promise can't reject.
    // Logged regardless of handoff — the provider call happened either
    // way.
    void logAiUsage(db, {
      accountId,
      conversationId,
      mode: 'auto_reply',
      provider: config.provider,
      model: config.model,
      usage,
    })

    if (handoff || !text) {
      // The model can't (or shouldn't) answer — stop auto-replying on
      // this thread and hand it to a human. We (a) pause the bot here
      // (sticky until re-enabled), (b) route the conversation to the
      // configured handoff agent — null leaves it in the shared queue —
      // and (c) leave a short internal note so whoever picks it up has
      // context. Assigning fires the `on_conversation_assigned` trigger,
      // which notifies the agent.
      const summary = buildHandoffSummary({
        messages,
        replyCount: conv.ai_reply_count ?? 0,
      })
      await db
        .from('conversations')
        .update({ ai_autoreply_disabled: true, ai_handoff_summary: summary })
        .eq('id', conversationId)
      // Only set the assignee when a target is configured AND the thread
      // isn't already owned — never stomp an existing human assignment.
      if (config.handoffAgentId) {
        await db
          .from('conversations')
          .update({ assigned_agent_id: config.handoffAgentId })
          .eq('id', conversationId)
          .is('assigned_agent_id', null)
      }
      return
    }

    if (
      inboundMessageId &&
      (await hasNewerInbound(db, conversationId, inboundMessageId))
    ) {
      return
    }

    // Atomically claim a reply slot: the cap check + increment happen in
    // one UPDATE, so concurrent inbounds can never overshoot the cap. If
    // another inbound just took the last slot, `claimed` is false and we
    // skip the send. (We consume a slot slightly before the send lands —
    // fail-safe: under-reply rather than over-reply.)
    const { data: claimed, error: claimErr } = await db.rpc(
      'claim_ai_reply_slot',
      {
        conversation_id: conversationId,
        max_replies: config.autoReplyMaxPerConversation,
      },
    )
    if (claimErr) {
      // A real error here (vs. losing the cap race) is almost always a
      // deploy issue — e.g. `claim_ai_reply_slot` not EXECUTE-able by the
      // service role, or the migration not applied. Log it loudly: a
      // silent return makes "auto-reply never fires" undiagnosable.
      console.error('[ai auto-reply] claim_ai_reply_slot failed:', claimErr)
      return
    }
    if (claimed !== true) return

    await engineSendText({
      accountId,
      userId: configOwnerUserId,
      conversationId,
      contactId,
      text,
      aiGenerated: true,
    })

    // Record AI auto-reply into lead notes so counselors and future AI turns have full knowledge
    if (leadLog?.id && text) {
      try {
        const existingNotes = parseLeadNotes(leadLog.notes)
        const aiNote: LeadNote = {
          id: crypto.randomUUID(),
          text: `[WhatsApp Auto Follow-Up]: ${text.slice(0, 300)}${text.length > 300 ? '...' : ''}`,
          author_name: 'AI Admissions Agent',
          author_type: 'ai_agent',
          created_at: new Date().toISOString(),
        }
        await db
          .from('meta_lead_logs')
          .update({ notes: serializeLeadNotes([...existingNotes, aiNote]) })
          .eq('id', leadLog.id)
      } catch (noteErr) {
        console.warn('[ai auto-reply] Failed to record AI note in meta_lead_logs:', noteErr)
      }
    }
  } catch (err) {
    console.error('[ai auto-reply] dispatch failed:', err)
  }
}

async function hasNewerInbound(
  db: ReturnType<typeof supabaseAdmin>,
  conversationId: string,
  inboundMessageId: string,
): Promise<boolean> {
  const { data, error } = await db
    .from('messages')
    .select('message_id')
    .eq('conversation_id', conversationId)
    .eq('sender_type', 'customer')
    .order('created_at', { ascending: false })
    .limit(1)
  if (error || !data || data.length === 0) return false
  return data[0].message_id !== inboundMessageId
}

/**
 * Best-effort "typing…" for the inbound we're about to answer. Swallows
 * every failure (no WhatsApp config, bad token, Meta 4xx) with a warning
 * — the indicator is cosmetic, the reply is not.
 */
async function showTypingIndicator(
  db: ReturnType<typeof supabaseAdmin>,
  accountId: string,
  inboundMessageId: string,
): Promise<void> {
  try {
    const { phoneNumberId, accessToken } = await loadAccountMetaCredentials(
      db,
      accountId,
    )
    await sendTypingIndicator({
      phoneNumberId,
      accessToken,
      messageId: inboundMessageId,
    })
  } catch (err) {
    console.warn('[ai auto-reply] typing indicator failed (continuing):', err)
  }
}
