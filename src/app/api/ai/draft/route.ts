import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'
import { loadAiConfig } from '@/lib/ai/config'
import { buildConversationContext } from '@/lib/ai/context'
import { retrieveKnowledge } from '@/lib/ai/knowledge'
import { generateReply } from '@/lib/ai/generate'
import { buildSystemPrompt } from '@/lib/ai/defaults'
import { latestUserMessage } from '@/lib/ai/query'
import { logAiUsage } from '@/lib/ai/usage'
import { supabaseAdmin } from '@/lib/ai/admin-client'
import { AiError, type ChatMessage } from '@/lib/ai/types'
import { getT } from '@/lib/i18n/translate'
import { formatNotesForAiContext } from '@/lib/leads/notes'

const t = getT('Api')

/**
 * POST /api/ai/draft  (agent+)
 *
 * Body: { conversation_id }
 * Returns: { draft } — a suggested reply for the agent to edit + send.
 *
 * Uses the account's configured provider/key (BYO). Read-only: it never
 * sends or stores anything, just hands text back to the composer.
 */
export const maxDuration = 60

export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('agent')

    const userLimit = checkRateLimit(`ai-draft:${userId}`, RATE_LIMITS.aiDraft)
    if (!userLimit.success) return rateLimitResponse(userLimit)
    // Also cap the whole team's draws on the shared BYO provider key.
    const accountLimit = checkRateLimit(
      `ai-draft-acct:${accountId}`,
      RATE_LIMITS.aiDraftAccount,
    )
    if (!accountLimit.success) return rateLimitResponse(accountLimit)

    const body = await request.json().catch(() => null)
    const conversationId =
      body && typeof body.conversation_id === 'string' ? body.conversation_id : ''
    if (!conversationId) {
      return NextResponse.json(
        { error: t('ai.conversationIdRequired') },
        { status: 400 },
      )
    }

    // RLS scopes the SSR client to the caller's account, so a missing
    // row means "not yours / not found" either way.
    const { data: conversation, error: convErr } = await supabase
      .from('conversations')
      .select('id, contact_id, account_id')
      .eq('id', conversationId)
      .maybeSingle()
    if (convErr) {
      console.error('[ai/draft] conversation lookup error:', convErr)
      return NextResponse.json({ error: t('common.failedToLoadConversation') }, { status: 500 })
    }
    if (!conversation) {
      return NextResponse.json({ error: t('common.conversationNotFound') }, { status: 404 })
    }

    const config = await loadAiConfig(supabase, accountId).catch((err) => {
      // Decrypt failure — surface distinctly from "not configured".
      console.error('[ai/draft] loadAiConfig error:', err)
      throw new AiError(t('ai.storedKeyUndecryptable'), {
        code: 'key_decrypt_failed',
        status: 400,
      })
    })
    if (!config) {
      return NextResponse.json(
        {
          error: t('ai.notConfigured'),
          code: 'ai_not_configured',
        },
        { status: 400 },
      )
    }

    // Retrieve contact info if available
    let contact: { name?: string | null; phone?: string | null; email?: string | null } | null = null
    if (conversation.contact_id) {
      const { data: c } = await supabase
        .from('contacts')
        .select('name, phone, email')
        .eq('id', conversation.contact_id)
        .maybeSingle()
      contact = c
    }

    // Retrieve lead information from meta_lead_logs if this thread corresponds to a lead
    let leadLog: {
      full_name?: string | null
      phone?: string | null
      email?: string | null
      college?: string | null
      course?: string | null
      city?: string | null
      campaign_name?: string | null
      form_name?: string | null
      notes?: unknown
    } | null = null

    const { data: leadByConv } = await supabase
      .from('meta_lead_logs')
      .select('full_name, phone, email, college, course, city, campaign_name, form_name, notes')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (leadByConv) {
      leadLog = leadByConv
    } else if (contact?.phone) {
      const { data: leadByPhone } = await supabase
        .from('meta_lead_logs')
        .select('full_name, phone, email, college, course, city, campaign_name, form_name, notes')
        .eq('phone', contact.phone)
        .eq('account_id', accountId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      leadLog = leadByPhone
    }

    let contextualUserPrompt = config.systemPrompt || ''
    const leadDetails: string[] = []
    if (leadLog?.campaign_name) leadDetails.push(`Campaign: ${leadLog.campaign_name}`)
    if (leadLog?.college) leadDetails.push(`College of Interest: ${leadLog.college}`)
    if (leadLog?.course) leadDetails.push(`Course / Degree: ${leadLog.course}`)
    if (leadLog?.city) leadDetails.push(`City / Location: ${leadLog.city}`)
    if (leadLog?.form_name) leadDetails.push(`Source Form: ${leadLog.form_name}`)

    if (leadDetails.length > 0) {
      contextualUserPrompt += `\n\nLEAD & ADMISSIONS CONTEXT:\n${leadDetails.join('\n')}`
    }
    if (leadLog?.notes) {
      const notesContext = formatNotesForAiContext(leadLog.notes)
      if (notesContext) {
        contextualUserPrompt += `\n${notesContext}`
      }
    }

    const messages = await buildConversationContext(supabase, conversationId)

    // Ground the draft in the account's knowledge base (best-effort —
    // returns [] when there's no KB or retrieval fails).
    const knowledgeQuery =
      latestUserMessage(messages) ||
      [leadLog?.course, leadLog?.college, leadLog?.campaign_name].filter(Boolean).join(' ') ||
      'admissions enquiry'

    const knowledge = await retrieveKnowledge(
      supabase,
      accountId,
      config,
      knowledgeQuery,
    )

    const systemPrompt = buildSystemPrompt({
      userPrompt: contextualUserPrompt,
      mode: 'draft',
      knowledge,
    })

    let effectiveMessages: ChatMessage[] = [...messages]

    if (effectiveMessages.length === 0) {
      // BRAND NEW THREAD (e.g. freshly captured lead or newly opened contact with no messages yet)
      // Instead of failing with 'No messages to draft from yet.', generate a personalized opening outreach message.
      const studentName = leadLog?.full_name || contact?.name || 'Student'
      const programInfo = [leadLog?.course, leadLog?.college].filter(Boolean).join(' at ')

      const initialOutreachPrompt =
        `Please draft a warm, polite, and professional initial outreach WhatsApp message to start the conversation with ${studentName}.` +
        (programInfo ? ` The student expressed interest in ${programInfo}.` : '') +
        (leadLog?.campaign_name ? ` (Ad Campaign: ${leadLog.campaign_name})` : '') +
        '\n\nMessage Requirements:' +
        '\n- Address them warmly by their name.' +
        '\n- Introduce yourself as their education counsellor/admissions advisor.' +
        (programInfo ? `\n- Reference their interest in ${programInfo}.` : '') +
        '\n- Ask an engaging open question to invite their reply (e.g., asking if they have any specific questions about eligibility, fee structure, scholarship, or would like the brochure).' +
        '\n- Keep it concise (2-4 sentences), friendly, polite, and suitable for WhatsApp.' +
        '\n- Output ONLY the message text without quotes or preamble.'

      effectiveMessages = [
        {
          role: 'user',
          content: initialOutreachPrompt,
        },
      ]
    } else {
      // If messages only contain assistant messages (outreach was sent, but student hasn't replied yet)
      const hasCustomerMessage = effectiveMessages.some((m) => m.role === 'user')
      if (!hasCustomerMessage) {
        const studentName = leadLog?.full_name || contact?.name || 'the student'
        effectiveMessages = [
          {
            role: 'user',
            content: `We previously sent an initial message to ${studentName}. They have not replied yet.`,
          },
          ...effectiveMessages,
          {
            role: 'user',
            content:
              `Please draft a polite follow-up WhatsApp message to check in with ${studentName}, ask if they had any questions regarding our previous message, and offer further assistance with their admission process. Keep it short, courteous, and inviting.`,
          },
        ]
      }
    }

    const { text, usage } = await generateReply({ config, systemPrompt, messages: effectiveMessages })

    // Record spend on the account's BYO key. Best-effort + via the
    // service role (the log has no `authenticated` INSERT policy). This
    // must not fail or delay the draft the agent is waiting on, so:
    //  - the whole thing is wrapped (constructing the admin client throws
    //    if the service-role key is unset — that must not 500 the draft);
    //  - it's fire-and-forget (`void`), not awaited, so the response
    //    isn't held for a DB round-trip.
    try {
      void logAiUsage(supabaseAdmin(), {
        accountId,
        conversationId,
        mode: 'draft',
        provider: config.provider,
        model: config.model,
        usage,
      })
    } catch (logErr) {
      console.error('[ai/draft] usage log skipped:', logErr)
    }

    return NextResponse.json({ draft: text })
  } catch (err) {
    if (err instanceof AiError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.status },
      )
    }
    return toErrorResponse(err)
  }
}
