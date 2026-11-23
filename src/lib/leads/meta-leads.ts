import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { parseInternationalPhone } from '@/lib/whatsapp/phone-utils';
import { findOrCreateContact, resolveAuditUserId } from '@/lib/api/v1/contacts';
import { resolveConversationByPhone } from '@/lib/whatsapp/resolve-conversation';
import { sendMessageToConversation } from '@/lib/whatsapp/send-message';
import { decrypt } from '@/lib/whatsapp/encryption';
import { loadEmailConfig } from '@/lib/email/config';
import { sendEmailWithResend, renderLeadWelcomeEmail } from '@/lib/email/resend';
import { serializeLeadNotes, type LeadNote } from '@/lib/leads/notes';

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export interface IncomingLeadPayload {
  leadgenId?: string;
  formId?: string;
  formName?: string;
  campaignId?: string;
  campaignName?: string;
  fullName: string;
  phone: string;
  email?: string;
  college?: string;
  course?: string;
  city?: string;
  adId?: string;
  adName?: string;
  rawFields?: Record<string, string>;
}

export interface ProcessLeadResult {
  success: boolean;
  contactId?: string;
  conversationId?: string;
  dealId?: string;
  assignedTo?: string;
  whatsappSent?: boolean;
  emailSent?: boolean;
  error?: string;
}

/**
 * Fetches lead details from Meta Graph API using leadgen_id and a Page Access Token.
 */
export async function fetchLeadFromMetaGraphApi(
  leadgenId: string,
  pageAccessToken: string
): Promise<IncomingLeadPayload | null> {
  try {
    const fields = 'id,created_time,field_data,form_id,campaign_id,campaign_name,ad_id,ad_name,adset_id,adset_name';
    const url = `https://graph.facebook.com/v21.0/${leadgenId}?fields=${fields}&access_token=${encodeURIComponent(pageAccessToken)}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      const errData = await res.json().catch(() => null);
      console.error('[MetaLeads] Graph API fetch failed:', errData);
      return null;
    }

    const data = await res.json();
    const fieldData = Array.isArray(data.field_data) ? data.field_data : [];

    let fullName = '';
    let phone = '';
    let email = '';
    let college = '';
    let course = '';
    let city = '';
    const rawFields: Record<string, string> = {};

    for (const f of fieldData) {
      const name = String(f.name || '').toLowerCase();
      const val = Array.isArray(f.values) && f.values.length > 0 ? String(f.values[0]) : '';
      rawFields[f.name] = val;

      if (name.includes('full_name') || name === 'name') {
        fullName = val;
      } else if (name.includes('first_name') && !fullName) {
        fullName = val;
      } else if (name.includes('last_name') && fullName) {
        fullName += ' ' + val;
      } else if (
        name.includes('phone') ||
        name.includes('whatsapp') ||
        name.includes('mobile') ||
        name.includes('contact') ||
        name.includes('cell') ||
        name === 'number'
      ) {
        phone = val;
      } else if (name.includes('email')) {
        email = val;
      } else if (
        name.includes('college') ||
        name.includes('university') ||
        name.includes('institute') ||
        name.includes('school') ||
        name.includes('campus') ||
        name.includes('destination') ||
        name.includes('institution')
      ) {
        college = val;
      } else if (
        name.includes('course') ||
        name.includes('program') ||
        name.includes('degree') ||
        name.includes('branch') ||
        name.includes('stream') ||
        name.includes('specialization') ||
        name.includes('study')
      ) {
        course = val;
      } else if (name.includes('city') || name.includes('location') || name.includes('state')) {
        city = val;
      }
    }

    // Format institution and course to clean Title Case with common acronyms (NIT, IIT, CSE, etc.)
    if (college) {
      college = college
        .replace(/_/g, ' ')
        .replace(/\bnit\b/gi, 'NIT')
        .replace(/\biit\b/gi, 'IIT')
        .replace(/\biiit\b/gi, 'IIIT')
        .replace(/\b\w/g, (c) => c.toUpperCase());
    }
    if (course) {
      course = course
        .replace(/_/g, ' ')
        .replace(/\bcse\b/gi, 'CSE')
        .replace(/\beit\b/gi, 'IT')
        .replace(/\bece\b/gi, 'ECE')
        .replace(/\bmba\b/gi, 'MBA')
        .replace(/\bb\.?tech\b/gi, 'B.Tech')
        .replace(/\b\w/g, (c) => c.toUpperCase());
    }

    // Fallback: If phone is still not detected, scan for any field value that looks like a phone number
    if (!phone) {
      for (const f of fieldData) {
        const val = Array.isArray(f.values) && f.values.length > 0 ? String(f.values[0]) : '';
        const digits = val.replace(/\D/g, '');
        if (digits.length >= 7 && digits.length <= 15 && !val.includes('@')) {
          phone = val;
          break;
        }
      }
    }

    let campaignName = (data.campaign_name || data.campaign?.name || '').trim();
    const campaignId = (data.campaign_id || data.campaign?.id || '').trim();
    const adName = (data.ad_name || data.ad?.name || '').trim();
    const adId = (data.ad_id || data.ad?.id || '').trim();
    let formName = (data.form_name || '').trim();

    // Fallback: if campaign_name is missing but campaign_id exists, fetch campaign name
    if (!campaignName && campaignId) {
      try {
        const campRes = await fetch(
          `https://graph.facebook.com/v21.0/${campaignId}?fields=name&access_token=${encodeURIComponent(pageAccessToken)}`
        );
        if (campRes.ok) {
          const campData = await campRes.json();
          if (campData?.name) campaignName = String(campData.name).trim();
        }
      } catch {
        // Ignore fallback campaign name fetch error
      }
    }

    // Fallback: if form_name is missing but form_id exists, fetch form name
    if (!formName && data.form_id) {
      try {
        const formRes = await fetch(
          `https://graph.facebook.com/v21.0/${data.form_id}?fields=name&access_token=${encodeURIComponent(pageAccessToken)}`
        );
        if (formRes.ok) {
          const formData = await formRes.json();
          if (formData?.name) formName = String(formData.name).trim();
        }
      } catch {
        // Ignore fallback form name fetch error
      }
    }

    return {
      leadgenId,
      formId: data.form_id || undefined,
      formName: formName || undefined,
      campaignId: campaignId || undefined,
      campaignName: campaignName || undefined,
      fullName: fullName.trim() || 'Meta Lead',
      phone: phone.trim(),
      email: email.trim() || undefined,
      college: college.trim() || undefined,
      course: course.trim() || undefined,
      city: city.trim() || undefined,
      adId: adId || undefined,
      adName: adName || undefined,
      rawFields,
    };
  } catch (err) {
    console.error('[MetaLeads] Error fetching from Graph API:', err);
    return null;
  }
}

/**
 * Matches an incoming lead against configured auto-assignment rules:
 * Evaluates College Name, Course Name, Form Name, or Any field in priority order.
 * Returns the matched agent user_id or null.
 */
export interface MatchedAssignmentRule {
  id: string;
  name: string;
  assign_to_user_id: string;
  followup_template_name?: string | null;
  ai_auto_chat_enabled?: boolean;
  ai_campaign_prompt?: string | null;
}

/**
 * Finds the matching active lead assignment rule for a lead payload, including campaign AI follow-up config.
 */
export async function findMatchingLeadAssignmentRule(
  admin: SupabaseClient,
  accountId: string,
  lead: {
    formName?: string;
    campaignName?: string;
    college?: string;
    course?: string;
  }
): Promise<MatchedAssignmentRule | null> {
  try {
    const { data: rules } = await admin
      .from('lead_assignment_rules')
      .select('*')
      .eq('account_id', accountId)
      .eq('is_active', true)
      .order('priority', { ascending: true })
      .order('created_at', { ascending: true });

    if (!rules || rules.length === 0) return null;

    for (const rule of rules) {
      let targetText = '';
      if (rule.criteria_type === 'college') {
        targetText = lead.college || '';
      } else if (rule.criteria_type === 'course') {
        targetText = lead.course || '';
      } else if (rule.criteria_type === 'form_name') {
        targetText = lead.formName || '';
      } else if (rule.criteria_type === 'campaign_name') {
        targetText = lead.campaignName || '';
      } else if (rule.criteria_type === 'any') {
        targetText = `${lead.campaignName || ''} ${lead.formName || ''} ${lead.college || ''} ${lead.course || ''}`;
      }

      const needle = (rule.match_value || '').trim().toLowerCase();
      const haystack = targetText.trim().toLowerCase();

      if (!needle || !haystack) continue;

      let matched = false;
      switch (rule.operator) {
        case 'equals':
          matched = haystack === needle;
          break;
        case 'starts_with':
          matched = haystack.startsWith(needle);
          break;
        case 'ends_with':
          matched = haystack.endsWith(needle);
          break;
        case 'contains':
        default:
          matched = haystack.includes(needle);
          break;
      }

      if (matched && rule.assign_to_user_id) {
        return {
          id: rule.id,
          name: rule.name,
          assign_to_user_id: rule.assign_to_user_id,
          followup_template_name: rule.followup_template_name || 'education_admissions_welcome',
          ai_auto_chat_enabled: rule.ai_auto_chat_enabled !== false,
          ai_campaign_prompt: rule.ai_campaign_prompt || null,
        };
      }
    }
  } catch (err) {
    console.warn('[MetaLeads] Error matching assignment rules:', err);
  }

  return null;
}

export async function matchLeadAssignmentRule(
  admin: SupabaseClient,
  accountId: string,
  lead: {
    formName?: string;
    campaignName?: string;
    college?: string;
    course?: string;
  }
): Promise<string | null> {
  const match = await findMatchingLeadAssignmentRule(admin, accountId, lead);
  return match?.assign_to_user_id || null;
}

/**
 * Automatically applies active auto-assignment rules to leads in the workspace.
 * By default, only unassigned leads (assigned_to is null) are evaluated.
 * Updates meta_lead_logs, conversations, and pipeline deals.
 */
export async function applyLeadAssignmentRules(
  admin: SupabaseClient,
  accountId: string,
  onlyUnassigned = true
): Promise<{ assignedCount: number; matchedLeads: Array<{ id: string; name: string; assignedTo: string }> }> {
  try {
    const { data: rules } = await admin
      .from('lead_assignment_rules')
      .select('*')
      .eq('account_id', accountId)
      .eq('is_active', true)
      .order('priority', { ascending: true })
      .order('created_at', { ascending: true });

    if (!rules || rules.length === 0) {
      return { assignedCount: 0, matchedLeads: [] };
    }

    let query = admin
      .from('meta_lead_logs')
      .select('id, full_name, form_name, campaign_name, college, course, conversation_id, contact_id, assigned_to')
      .eq('account_id', accountId);

    if (onlyUnassigned) {
      query = query.is('assigned_to', null);
    }

    const { data: leads, error: leadsError } = await query;
    if (leadsError || !leads || leads.length === 0) {
      return { assignedCount: 0, matchedLeads: [] };
    }

    let assignedCount = 0;
    const matchedLeads: Array<{ id: string; name: string; assignedTo: string }> = [];

    // Cache profiles map for updating deals.assigned_to (which points to profiles.id)
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, user_id')
      .eq('account_id', accountId);

    const userToProfileMap = new Map((profiles || []).map((p) => [p.user_id, p.id]));

    for (const lead of leads) {
      const matchedRule = await findMatchingLeadAssignmentRule(admin, accountId, {
        formName: lead.form_name || undefined,
        campaignName: lead.campaign_name || undefined,
        college: lead.college || undefined,
        course: lead.course || undefined,
      });

      if (matchedRule?.assign_to_user_id) {
        assignedCount++;
        matchedLeads.push({ id: lead.id, name: lead.full_name, assignedTo: matchedRule.assign_to_user_id });

        const now = new Date().toISOString();

        // 1. Update lead log
        await admin
          .from('meta_lead_logs')
          .update({
            assigned_to: matchedRule.assign_to_user_id,
            assigned_at: now,
            ai_chat_enabled: matchedRule.ai_auto_chat_enabled,
            updated_at: now,
          })
          .eq('id', lead.id);

        // 2. Update conversation: assign agent and ensure AI auto-reply is active for inbound replies
        if (lead.conversation_id) {
          await admin
            .from('conversations')
            .update({
              assigned_agent_id: matchedRule.assign_to_user_id,
              ai_autoreply_disabled: false,
            })
            .eq('id', lead.conversation_id);
        }

        // 3. Update pipeline deal if exists
        if (lead.contact_id) {
          const profileId = userToProfileMap.get(matchedRule.assign_to_user_id);
          if (profileId) {
            await admin
              .from('deals')
              .update({ assigned_to: profileId, updated_at: now })
              .eq('contact_id', lead.contact_id);
          }
        }
      }
    }

    return { assignedCount, matchedLeads };
  } catch (err) {
    console.error('[applyLeadAssignmentRules] Error:', err);
    return { assignedCount: 0, matchedLeads: [] };
  }
}

/**
 * Ingests a Meta Lead into the CRM:
 * 1. Sanitizes phone number.
 * 2. Creates/Finds Contact and applies tag.
 * 3. Resolves/Creates Conversation.
 * 4. Auto-assigns to Agent based on College / Course / Form rules.
 * 5. Optionally sends instant WhatsApp template message if configured.
 * 6. Logs to meta_lead_logs with full lead attributes.
 */
export async function processIncomingLead(
  accountId: string,
  lead: IncomingLeadPayload
): Promise<ProcessLeadResult> {
  const admin = getAdminClient();

  // 1. Sanitize phone
  const rawPhone = lead.phone.startsWith('+') ? lead.phone : `+${lead.phone.replace(/\D/g, '')}`;
  const sanitizedDigits = parseInternationalPhone(rawPhone);
  if (!sanitizedDigits) {
    await admin.from('meta_lead_logs').insert({
      account_id: accountId,
      leadgen_id: lead.leadgenId || null,
      form_id: lead.formId || null,
      form_name: lead.formName || 'Meta Instant Form',
      campaign_name: lead.campaignName || null,
      ad_name: lead.adName || null,
      full_name: lead.fullName,
      phone: lead.phone,
      email: lead.email || null,
      college: lead.college || null,
      course: lead.course || null,
      city: lead.city || null,
      raw_data: lead.rawFields || {},
      status: 'invalid_phone',
      error_message: 'Phone number format invalid or missing country code',
    });
    return { success: false, error: 'Invalid phone number format' };
  }
  const formattedPhone = `+${sanitizedDigits}`;

  // 2. Fetch Lead Configuration for this account
  const { data: config } = await admin
    .from('meta_lead_configs')
    .select('*')
    .eq('account_id', accountId)
    .maybeSingle();

  const autoTag = config?.auto_tag || 'Meta Lead';

  // 3. Create or find contact
  let contactId: string;
  try {
    const auditUserId = await resolveAuditUserId(admin, accountId);
    const contactResult = await findOrCreateContact(admin, accountId, auditUserId, {
      phone: formattedPhone,
      name: lead.fullName,
      email: lead.email,
    });
    contactId = contactResult.id;

    // Apply lead tags
    const { data: tagRow } = await admin
      .from('tags')
      .select('id')
      .eq('account_id', accountId)
      .eq('name', autoTag)
      .maybeSingle();

    let tagId = tagRow?.id;
    if (!tagId) {
      const { data: newTag } = await admin
        .from('tags')
        .insert({ account_id: accountId, name: autoTag, color: '#10B981' })
        .select('id')
        .maybeSingle();
      tagId = newTag?.id;
    }

    if (tagId) {
      await admin.from('contact_tags').upsert(
        { contact_id: contactId, tag_id: tagId },
        { onConflict: 'contact_id, tag_id' }
      );
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[MetaLeads] Contact creation error:', err);
    return { success: false, error: `Failed to create contact: ${msg}` };
  }

  // 4. Resolve or create conversation
  let conversationId: string | undefined;
  try {
    const conv = await resolveConversationByPhone(admin, accountId, formattedPhone, lead.fullName);
    conversationId = conv.conversationId;
  } catch (err) {
    console.warn('[MetaLeads] Could not resolve conversation:', err);
  }

  // 5. Auto-assign lead to agent based on rules (College, Course, Form Name, Campaign Name)
  let matchedRule: MatchedAssignmentRule | null = null;
  let assignedTo: string | undefined;
  try {
    matchedRule = await findMatchingLeadAssignmentRule(admin, accountId, {
      formName: lead.formName,
      campaignName: lead.campaignName,
      college: lead.college,
      course: lead.course,
    });
    if (matchedRule?.assign_to_user_id) {
      assignedTo = matchedRule.assign_to_user_id;
      if (conversationId) {
        await admin
          .from('conversations')
          .update({
            assigned_agent_id: matchedRule.assign_to_user_id,
            ai_autoreply_disabled: false,
          })
          .eq('id', conversationId);
      }
    }
  } catch (assignErr) {
    console.warn('[MetaLeads] Auto-assignment failed:', assignErr);
  }

  // 6. Check if auto-WhatsApp follow-up is enabled & configured
  let whatsappSent = false;
  let whatsappError: string | undefined;

  // Prioritize rule-specific follow-up template, then global config template, fallback to education_admissions_welcome
  const templateName =
    matchedRule?.followup_template_name ||
    config?.auto_template_name ||
    'education_admissions_welcome';

  const shouldSendWhatsApp = Boolean(
    (matchedRule && matchedRule.followup_template_name) ||
    (config?.auto_whatsapp_enabled && config?.auto_template_name) ||
    config?.auto_whatsapp_enabled !== false
  );

  if (shouldSendWhatsApp && conversationId) {
    try {
      await sendMessageToConversation(admin, accountId, {
        conversationId,
        messageType: 'template',
        templateName,
        templateParams: [lead.fullName || 'Student'],
      });
      whatsappSent = true;

      // Ensure AI auto-reply is active on this thread for incoming replies
      await admin
        .from('conversations')
        .update({ ai_autoreply_disabled: false })
        .eq('id', conversationId);
    } catch (sendErr: unknown) {
      whatsappError = sendErr instanceof Error ? sendErr.message : String(sendErr);
      console.error('[MetaLeads] Auto-reply send failed:', sendErr);
    }
  }

  // 6.5. Auto-send Admissions Welcome Email if lead has email and email config is active
  let emailSent = false;
  let emailDeliveryMeta: Record<string, unknown> | undefined;
  const initialNotes: LeadNote[] = [];

  if (lead.email && lead.email.includes('@')) {
    try {
      const emailConfig = await loadEmailConfig(admin, accountId);
      if (emailConfig?.apiKey && emailConfig.autoEmailEnabled) {
        // Resolve assigned counselor profile if available
        let counselorName = 'Senior Admissions Counselor';
        let counselorPhone = '+977 980-0000000';
        let counselorEmail: string | undefined;

        if (assignedTo) {
          const { data: counselorProfile } = await admin
            .from('profiles')
            .select('full_name, email')
            .eq('user_id', assignedTo)
            .maybeSingle();

          if (counselorProfile) {
            counselorName = counselorProfile.full_name || counselorName;
            counselorEmail = counselorProfile.email || undefined;
          }
        }

        const renderedEmail = renderLeadWelcomeEmail(
          {
            fullName: lead.fullName,
            email: lead.email,
            phone: formattedPhone,
            college: lead.college,
            course: lead.course,
            city: lead.city,
            campaignName: lead.campaignName,
            counselorName,
            counselorPhone,
            counselorEmail,
          },
          emailConfig.subjectTemplate
        );

        const sendResult = await sendEmailWithResend({
          apiKey: emailConfig.apiKey,
          from: emailConfig.fromEmail,
          to: lead.email,
          subject: renderedEmail.subject,
          html: renderedEmail.html,
          text: renderedEmail.text,
          replyTo: emailConfig.replyToEmail || counselorEmail,
        });

        if (sendResult.success) {
          emailSent = true;
          emailDeliveryMeta = {
            sent: true,
            sent_at: new Date().toISOString(),
            message_id: sendResult.id,
            to: lead.email,
            subject: renderedEmail.subject,
          };
          initialNotes.push({
            id: crypto.randomUUID(),
            text: `📧 Auto-welcome email sent to ${lead.email} (${renderedEmail.subject}).`,
            author_name: 'Admissions AI Assistant',
            author_type: 'ai_agent',
            created_at: new Date().toISOString(),
          });
        } else {
          console.warn('[MetaLeads] Auto-email dispatch failed:', sendResult.error);
          emailDeliveryMeta = {
            sent: false,
            error: sendResult.error,
            to: lead.email,
            attempted_at: new Date().toISOString(),
          };
          initialNotes.push({
            id: crypto.randomUUID(),
            text: `⚠️ Auto-welcome email failed for ${lead.email}: ${sendResult.error}`,
            author_name: 'Admissions AI Assistant',
            author_type: 'system',
            created_at: new Date().toISOString(),
          });
        }
      }
    } catch (emailErr) {
      console.warn('[MetaLeads] Auto-email error:', emailErr);
    }
  }

  // 7. Log the lead with college, course, city, campaign, assignment info, email status, and AI auto-chat status
  await admin.from('meta_lead_logs').insert({
    account_id: accountId,
    leadgen_id: lead.leadgenId || null,
    form_id: lead.formId || null,
    form_name: lead.formName || 'Meta Instant Form',
    campaign_name: lead.campaignName || null,
    ad_name: lead.adName || null,
    full_name: lead.fullName,
    phone: formattedPhone,
    email: lead.email || null,
    college: lead.college || null,
    course: lead.course || null,
    city: lead.city || null,
    raw_data: {
      ...(lead.rawFields || {}),
      ...(emailDeliveryMeta ? { email_delivery: emailDeliveryMeta } : {}),
    },
    notes: initialNotes.length > 0 ? serializeLeadNotes(initialNotes) : null,
    status: 'processed',
    lead_status: 'new',
    contact_id: contactId,
    conversation_id: conversationId || null,
    assigned_to: assignedTo || null,
    assigned_at: assignedTo ? new Date().toISOString() : null,
    whatsapp_sent: whatsappSent,
    ai_chat_enabled: matchedRule ? matchedRule.ai_auto_chat_enabled : true,
    ai_followup_status: whatsappSent ? 'sent' : whatsappError ? 'failed' : 'pending',
    error_message: whatsappError || null,
  });

  // 8. Automatically sync lead into Education Admissions Pipeline
  let dealId: string | undefined;
  try {
    const syncedDealId = await syncLeadToPipelineDeal(admin, accountId, {
      contactId,
      conversationId: conversationId || null,
      fullName: lead.fullName,
      phone: formattedPhone,
      email: lead.email,
      college: lead.college,
      course: lead.course,
      city: lead.city,
      formName: lead.formName,
      assignedUserId: assignedTo,
    });
    if (syncedDealId) dealId = syncedDealId;
  } catch (syncErr) {
    console.warn('[MetaLeads] Pipeline deal auto-sync failed:', syncErr);
  }

  return {
    success: true,
    contactId,
    conversationId,
    dealId,
    assignedTo,
    whatsappSent,
    emailSent,
  };
}

/**
 * Automatically syncs a lead into an Education Admissions Pipeline Deal.
 * If the deal exists for this contact in the pipeline, it updates it.
 * Otherwise, it creates a new deal in the first stage ("New Inquiry").
 */
export async function syncLeadToPipelineDeal(
  admin: SupabaseClient,
  accountId: string,
  data: {
    contactId: string;
    conversationId?: string | null;
    fullName: string;
    phone: string;
    email?: string | null;
    college?: string | null;
    course?: string | null;
    city?: string | null;
    formName?: string | null;
    assignedUserId?: string | null;
  }
): Promise<string | null> {
  try {
    // 1. Find or seed primary Education Admissions Pipeline for this account
    let { data: pipeline } = await admin
      .from('pipelines')
      .select('id, name')
      .eq('account_id', accountId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    const auditUserId = await resolveAuditUserId(admin, accountId);

    if (!pipeline) {
      const { data: newPipe } = await admin
        .from('pipelines')
        .insert({
          account_id: accountId,
          user_id: auditUserId,
          name: 'Education Admissions',
        })
        .select('id, name')
        .single();

      if (newPipe) {
        pipeline = newPipe;
        const defaultStages = [
          { name: 'New Inquiry', color: '#3b82f6', position: 0 },
          { name: 'Counseling', color: '#eab308', position: 1 },
          { name: 'Document Collection', color: '#f97316', position: 2 },
          { name: 'Application Submitted', color: '#8b5cf6', position: 3 },
          { name: 'Offer Letter Received', color: '#06b6d4', position: 4 },
          { name: 'Visa Processing', color: '#ec4899', position: 5 },
          { name: 'Enrolled / Visa Approved', color: '#22c55e', position: 6 },
        ];
        await admin.from('pipeline_stages').insert(
          defaultStages.map((s) => ({
            pipeline_id: newPipe.id,
            name: s.name,
            color: s.color,
            position: s.position,
          }))
        );
      }
    }

    if (!pipeline) return null;

    // 2. Fetch stages for this pipeline (ordered by position)
    const { data: stages } = await admin
      .from('pipeline_stages')
      .select('id, name, position')
      .eq('pipeline_id', pipeline.id)
      .order('position', { ascending: true });

    if (!stages || stages.length === 0) return null;
    const firstStage = stages[0];

    // 3. Resolve profile for assigned agent (deals.assigned_to references profiles.id)
    let assignedProfileId: string | null = null;
    if (data.assignedUserId) {
      const { data: prof } = await admin
        .from('profiles')
        .select('id')
        .eq('user_id', data.assignedUserId)
        .maybeSingle();
      assignedProfileId = prof?.id || null;
    }

    // 4. Construct deal title & notes
    const dest = data.college ? data.college.replace(/_/g, ' ').toUpperCase() : '';
    const crse = data.course ? data.course.trim() : '';
    const detail = [dest, crse].filter(Boolean).join(' • ');
    const dealTitle = detail ? `${data.fullName} • ${detail}` : `${data.fullName} • Study Inquiry`;

    const notesLines = [
      data.college ? `🎓 Preferred College/Destination: ${data.college.replace(/_/g, ' ')}` : null,
      data.course ? `📚 Course: ${data.course}` : null,
      data.city ? `📍 City: ${data.city}` : null,
      data.email ? `✉️ Email: ${data.email}` : null,
      data.phone ? `📱 WhatsApp: ${data.phone}` : null,
      data.formName ? `📋 Form: ${data.formName}` : null,
    ].filter(Boolean);

    // 5. Check if deal already exists for this contact in this pipeline
    const { data: existingDeal } = await admin
      .from('deals')
      .select('id, stage_id, notes, assigned_to')
      .eq('account_id', accountId)
      .eq('pipeline_id', pipeline.id)
      .eq('contact_id', data.contactId)
      .maybeSingle();

    if (existingDeal) {
      await admin
        .from('deals')
        .update({
          title: dealTitle,
          assigned_to: assignedProfileId || existingDeal.assigned_to,
          notes: notesLines.join('\n') || existingDeal.notes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingDeal.id);
      return existingDeal.id;
    }

    // 6. Create deal in first stage ("New Inquiry")
    const { data: createdDeal, error: dealErr } = await admin
      .from('deals')
      .insert({
        account_id: accountId,
        user_id: auditUserId,
        pipeline_id: pipeline.id,
        stage_id: firstStage.id,
        contact_id: data.contactId,
        conversation_id: data.conversationId || null,
        title: dealTitle,
        value: 0,
        currency: 'NPR',
        notes: notesLines.join('\n'),
        status: 'open',
        assigned_to: assignedProfileId,
      })
      .select('id')
      .single();

    if (dealErr) {
      console.error('[MetaLeads] Deal sync insert error:', dealErr);
      return null;
    }

    return createdDeal?.id || null;
  } catch (err) {
    console.error('[MetaLeads] syncLeadToPipelineDeal error:', err);
    return null;
  }
}

/**
 * Syncs all processed leads in a workspace to pipeline deals.
 */
export async function syncAllLeadsToPipeline(
  admin: SupabaseClient,
  accountId: string
): Promise<number> {
  const { data: leads } = await admin
    .from('meta_lead_logs')
    .select('*')
    .eq('account_id', accountId)
    .eq('status', 'processed');

  if (!leads || leads.length === 0) return 0;

  let count = 0;
  for (const lead of leads) {
    if (!lead.contact_id) continue;
    const synced = await syncLeadToPipelineDeal(admin, accountId, {
      contactId: lead.contact_id,
      conversationId: lead.conversation_id || null,
      fullName: lead.full_name,
      phone: lead.phone,
      email: lead.email,
      college: lead.college,
      course: lead.course,
      city: lead.city,
      formName: lead.form_name,
      assignedUserId: lead.assigned_to,
    });
    if (synced) count++;
  }

  return count;
}

/**
 * Handles an incoming Meta leadgen change event from either /api/leads/meta or /api/whatsapp/webhook.
 */
export async function handleMetaLeadgenChange(
  pageId: string,
  val: Record<string, unknown>,
  queryAccountId?: string | null
): Promise<void> {
  const admin = getAdminClient();
  const leadgenId = String(val?.leadgen_id || '');
  const formId = String(val?.form_id || '');

  // Find matching workspace by page_id or queryAccountId
  let targetAccountId = queryAccountId;
  let pageAccessToken: string | null = null;

  if (pageId) {
    const { data: cfg } = await admin
      .from('meta_lead_configs')
      .select('account_id, page_access_token')
      .eq('page_id', pageId)
      .maybeSingle();

    if (cfg) {
      targetAccountId = cfg.account_id;
      pageAccessToken = cfg.page_access_token;
    }
  }

  if (!targetAccountId) {
    // Fallback to primary account
    const { data: primaryAcc } = await admin
      .from('accounts')
      .select('id')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    targetAccountId = primaryAcc?.id;
  }

  if (!targetAccountId) {
    console.warn('[MetaLeads] No target workspace found for leadgen:', leadgenId);
    return;
  }

  // Fallback: check meta_lead_configs for targetAccountId, then whatsapp_config
  if (!pageAccessToken && targetAccountId) {
    const { data: leadCfg } = await admin
      .from('meta_lead_configs')
      .select('page_access_token')
      .eq('account_id', targetAccountId)
      .maybeSingle();

    if (leadCfg?.page_access_token) {
      pageAccessToken = leadCfg.page_access_token;
    } else {
      const { data: waCfg } = await admin
        .from('whatsapp_config')
        .select('access_token')
        .eq('account_id', targetAccountId)
        .maybeSingle();

      if (waCfg?.access_token) {
        try {
          pageAccessToken = decrypt(waCfg.access_token);
        } catch {
          // Ignore decrypt errors
        }
      }
    }
  }

  // If we have pageAccessToken, fetch real lead data from Meta
  if (pageAccessToken && leadgenId) {
    const leadData = await fetchLeadFromMetaGraphApi(leadgenId, pageAccessToken);
    if (leadData && leadData.phone) {
      await processIncomingLead(targetAccountId, leadData);
      return;
    }
  }

  // Otherwise, record the notification so the user sees that Meta reached out
  await admin.from('meta_lead_logs').insert({
    account_id: targetAccountId,
    leadgen_id: leadgenId,
    form_id: formId,
    form_name: 'Meta Lead Form',
    campaign_name: typeof val.campaign_name === 'string' ? val.campaign_name : null,
    ad_name: typeof val.ad_name === 'string' ? val.ad_name : null,
    full_name: 'New Meta Lead',
    phone: 'Pending Token',
    status: 'token_required',
    raw_data: val,
    error_message: 'Page Access Token needed to fetch lead details from Graph API',
  });
}

export interface DetectedCampaign {
  name: string;
  source: 'meta_ads' | 'ctwa' | 'rules' | 'lead_logs';
  forms: string[];
  adNames: string[];
  leadsCount: number;
  status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED' | 'DETECTED';
  lastDetectedAt?: string;
  formId?: string;
  campaignId?: string;
}

/**
 * Automatically discovers active & past campaigns from Meta Graph API forms,
 * meta_lead_logs, lead_assignment_rules, and WhatsApp ad referrals.
 */
export async function detectWorkspaceCampaigns(
  accountId: string
): Promise<DetectedCampaign[]> {
  const admin = getAdminClient();
  const campaignMap = new Map<string, DetectedCampaign>();

  const addOrUpdate = (name: string, partial: Partial<DetectedCampaign>) => {
    const trimmed = (name || '').trim();
    if (!trimmed) return;
    const existing = campaignMap.get(trimmed) || {
      name: trimmed,
      source: partial.source || 'meta_ads',
      forms: [],
      adNames: [],
      leadsCount: 0,
      status: 'DETECTED',
      lastDetectedAt: new Date().toISOString(),
    };

    if (partial.source) existing.source = partial.source;
    if (partial.status) existing.status = partial.status;
    if (partial.formId) existing.formId = partial.formId;
    if (partial.campaignId) existing.campaignId = partial.campaignId;
    if (partial.lastDetectedAt) existing.lastDetectedAt = partial.lastDetectedAt;
    if (typeof partial.leadsCount === 'number') {
      existing.leadsCount = Math.max(existing.leadsCount, partial.leadsCount);
    }

    if (partial.forms) {
      for (const f of partial.forms) {
        if (f && !existing.forms.includes(f)) existing.forms.push(f);
      }
    }
    if (partial.adNames) {
      for (const a of partial.adNames) {
        if (a && !existing.adNames.includes(a)) existing.adNames.push(a);
      }
    }

    campaignMap.set(trimmed, existing);
  };

  // 1. Fetch campaigns and forms from meta_lead_logs
  try {
    const { data: logs } = await admin
      .from('meta_lead_logs')
      .select('campaign_name, form_name, ad_name, created_at')
      .eq('account_id', accountId);

    if (logs) {
      for (const log of logs) {
        if (log.campaign_name) {
          const existing = campaignMap.get(log.campaign_name);
          const currentCount = (existing?.leadsCount || 0) + 1;
          addOrUpdate(log.campaign_name, {
            source: 'meta_ads',
            forms: log.form_name ? [log.form_name] : [],
            adNames: log.ad_name ? [log.ad_name] : [],
            leadsCount: currentCount,
            lastDetectedAt: log.created_at,
          });
        }
      }
    }
  } catch (err) {
    console.warn('[detectWorkspaceCampaigns] Error reading meta_lead_logs:', err);
  }

  // 2. Fetch campaign rules to include user-configured campaign names
  try {
    const { data: rules } = await admin
      .from('lead_assignment_rules')
      .select('match_value, criteria_type, name')
      .eq('account_id', accountId)
      .eq('criteria_type', 'campaign_name');

    if (rules) {
      for (const rule of rules) {
        if (rule.match_value) {
          addOrUpdate(rule.match_value, {
            source: 'rules',
            status: 'ACTIVE',
          });
        }
      }
    }
  } catch (err) {
    console.warn('[detectWorkspaceCampaigns] Error reading lead_assignment_rules:', err);
  }

  // 3. Connect to live Meta Graph API if config is present
  try {
    let pageAccessToken: string | null = null;
    let pageId: string | null = null;

    const { data: cfg } = await admin
      .from('meta_lead_configs')
      .select('page_id, page_access_token')
      .eq('account_id', accountId)
      .maybeSingle();

    if (cfg?.page_access_token) {
      pageAccessToken = cfg.page_access_token;
      pageId = cfg.page_id || null;
    } else {
      const { data: waCfg } = await admin
        .from('whatsapp_config')
        .select('access_token')
        .eq('account_id', accountId)
        .maybeSingle();

      if (waCfg?.access_token) {
        try {
          pageAccessToken = decrypt(waCfg.access_token);
        } catch {}
      }
    }

    if (pageAccessToken) {
      // Step 3a. Resolve real Page Access Token if system token is provided
      let effectivePageToken = pageAccessToken;
      let effectivePageId = pageId;

      try {
        const accRes = await fetch(
          `https://graph.facebook.com/v21.0/me/accounts?access_token=${encodeURIComponent(pageAccessToken)}`
        );
        if (accRes.ok) {
          const accData = await accRes.json();
          const firstAccount = accData?.data?.[0];
          if (firstAccount?.access_token) {
            effectivePageToken = firstAccount.access_token;
            if (!effectivePageId && firstAccount.id) {
              effectivePageId = firstAccount.id;
            }
          }
        }
      } catch {}

      if (effectivePageId && effectivePageToken) {
        // Step 3b. Fetch forms on page
        const formsRes = await fetch(
          `https://graph.facebook.com/v21.0/${effectivePageId}/leadgen_forms?fields=id,name,status,leads_count&access_token=${encodeURIComponent(effectivePageToken)}`
        );
        if (formsRes.ok) {
          const formsData = await formsRes.json();
          const forms = Array.isArray(formsData.data) ? formsData.data : [];

          for (const form of forms) {
            const formId = form.id;
            const formName = form.name;
            const formStatus = form.status === 'ACTIVE' ? 'ACTIVE' : 'PAUSED';

            // Query sample leads to get live campaign name & ad details
            try {
              const leadsRes = await fetch(
                `https://graph.facebook.com/v21.0/${formId}/leads?fields=campaign_name,campaign_id,ad_name,ad_id&limit=3&access_token=${encodeURIComponent(effectivePageToken)}`
              );
              if (leadsRes.ok) {
                const leadsData = await leadsRes.json();
                const sampleLeads = Array.isArray(leadsData.data) ? leadsData.data : [];

                for (const lead of sampleLeads) {
                  const campName = (lead.campaign_name || '').trim();
                  if (campName) {
                    addOrUpdate(campName, {
                      source: 'meta_ads',
                      status: formStatus,
                      formId,
                      campaignId: lead.campaign_id,
                      forms: [formName],
                      adNames: lead.ad_name ? [lead.ad_name] : [],
                    });
                  }
                }
              }
            } catch {}
          }
        }
      }
    }
  } catch (apiErr) {
    console.warn('[detectWorkspaceCampaigns] Meta API discovery error:', apiErr);
  }

  return Array.from(campaignMap.values()).sort((a, b) => {
    if (a.status === 'ACTIVE' && b.status !== 'ACTIVE') return -1;
    if (b.status === 'ACTIVE' && a.status !== 'ACTIVE') return 1;
    return b.leadsCount - a.leadsCount || a.name.localeCompare(b.name);
  });
}

/**
 * Synchronizes all leads directly from Meta Instant Forms via Graph API.
 * Guarantees zero dropped leads if webhooks were missed.
 */
export async function syncMetaFormLeads(
  accountId: string,
  targetFormId?: string
): Promise<{ success: boolean; syncedCount: number; skippedCount: number; totalFound: number; error?: string }> {
  const admin = getAdminClient();
  let syncedCount = 0;
  let skippedCount = 0;
  let totalFound = 0;

  try {
    const { data: cfg } = await admin
      .from('meta_lead_configs')
      .select('page_id, page_access_token')
      .eq('account_id', accountId)
      .maybeSingle();

    if (!cfg?.page_access_token) {
      return {
        success: false,
        syncedCount: 0,
        skippedCount: 0,
        totalFound: 0,
        error: 'No Meta Page access token configured.',
      };
    }

    let effectivePageToken = cfg.page_access_token;
    let effectivePageId = cfg.page_id;

    try {
      const accRes = await fetch(
        `https://graph.facebook.com/v21.0/me/accounts?access_token=${encodeURIComponent(cfg.page_access_token)}`
      );
      if (accRes.ok) {
        const accData = await accRes.json();
        const firstAccount = accData?.data?.[0];
        if (firstAccount?.access_token) {
          effectivePageToken = firstAccount.access_token;
          if (!effectivePageId && firstAccount.id) effectivePageId = firstAccount.id;
        }
      }
    } catch {}

    if (!effectivePageId) {
      return {
        success: false,
        syncedCount: 0,
        skippedCount: 0,
        totalFound: 0,
        error: 'Meta Page ID could not be resolved.',
      };
    }

    // List forms
    let formsToSync: Array<{ id: string; name: string }> = [];
    if (targetFormId) {
      formsToSync = [{ id: targetFormId, name: 'Target Form' }];
    } else {
      const formsRes = await fetch(
        `https://graph.facebook.com/v21.0/${effectivePageId}/leadgen_forms?fields=id,name,status&access_token=${encodeURIComponent(effectivePageToken)}`
      );
      if (formsRes.ok) {
        const formsData = await formsRes.json();
        formsToSync = (formsData.data || []).map((f: { id: string; name: string }) => ({
          id: f.id,
          name: f.name,
        }));
      }
    }

    // Fetch existing leadgen_ids in meta_lead_logs to avoid duplicate processing
    const { data: existingLogs } = await admin
      .from('meta_lead_logs')
      .select('leadgen_id')
      .eq('account_id', accountId);

    const existingIds = new Set((existingLogs || []).map((l) => l.leadgen_id).filter(Boolean));
    const fields = 'id,created_time,field_data,form_id,campaign_id,campaign_name,ad_id,ad_name,adset_id,adset_name';

    for (const form of formsToSync) {
      const leadsRes = await fetch(
        `https://graph.facebook.com/v21.0/${form.id}/leads?fields=${fields}&limit=50&access_token=${encodeURIComponent(effectivePageToken)}`
      );
      if (!leadsRes.ok) continue;

      const leadsData = await leadsRes.json();
      const rawLeads = Array.isArray(leadsData.data) ? leadsData.data : [];
      totalFound += rawLeads.length;

      for (const lead of rawLeads) {
        if (existingIds.has(lead.id)) {
          skippedCount++;
          continue;
        }

        const parsedLead = await fetchLeadFromMetaGraphApi(lead.id, effectivePageToken);
        if (parsedLead && parsedLead.phone) {
          if (!parsedLead.formName) parsedLead.formName = form.name;
          const result = await processIncomingLead(accountId, parsedLead);
          if (result.success) {
            syncedCount++;
            existingIds.add(lead.id);
          }
        }
      }
    }

    return {
      success: true,
      syncedCount,
      skippedCount,
      totalFound,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[syncMetaFormLeads] error:', err);
    return { success: false, syncedCount, skippedCount, totalFound, error: msg };
  }
}

export interface WhatsAppAdReferralData {
  sourceUrl?: string;
  sourceId?: string;
  sourceType?: string;
  headline?: string;
  body?: string;
  ctwaClid?: string;
}

/**
 * Handles Click-to-WhatsApp (CTWA) ad referrals and ad campaign tags in inbound messages.
 * Automatically links the campaign to meta_lead_logs and applies auto-assignment rules.
 */
export async function handleWhatsAppAdReferral(
  admin: SupabaseClient,
  accountId: string,
  options: {
    contactId: string;
    conversationId: string;
    phone: string;
    fullName: string;
    referral?: WhatsAppAdReferralData;
    messageText?: string;
  }
): Promise<{
  isAdLead: boolean;
  campaignName?: string;
  assignedTo?: string;
  ruleMatched?: boolean;
}> {
  try {
    let campaignName: string | undefined;
    let adName: string | undefined;

    // 1. Check referral object from Click-to-WhatsApp (CTWA) ads
    if (options.referral) {
      campaignName = (options.referral.headline || '').trim();
      adName = (options.referral.body || options.referral.headline || '').trim();
    }

    // 2. Check for UTM tags or explicit ad keywords in message text if campaignName still empty
    const text = options.messageText || '';
    if (!campaignName && text) {
      const utmMatch = text.match(/(?:utm_campaign|campaign|ad_campaign)[=:]\s*([a-zA-Z0-9_\-]+)/i);
      if (utmMatch && utmMatch[1]) {
        campaignName = utmMatch[1].trim();
      } else {
        // Check if message text mentions any active rule campaign
        const { data: activeRules } = await admin
          .from('lead_assignment_rules')
          .select('match_value')
          .eq('account_id', accountId)
          .eq('criteria_type', 'campaign_name')
          .eq('is_active', true);

        if (activeRules) {
          const lowerText = text.toLowerCase();
          for (const rule of activeRules) {
            if (rule.match_value && lowerText.includes(rule.match_value.toLowerCase())) {
              campaignName = rule.match_value;
              break;
            }
          }
        }
      }
    }

    if (!campaignName && !options.referral) {
      return { isAdLead: false };
    }

    const detectedCampaign = campaignName || 'Click-to-WhatsApp Ad';

    // 3. Find matching assignment rule
    const matchedRule = await findMatchingLeadAssignmentRule(admin, accountId, {
      campaignName: detectedCampaign,
      formName: 'Click-to-WhatsApp Ad',
    });

    const assignedTo = matchedRule?.assign_to_user_id || undefined;

    // 4. Update conversation assignment if matched
    if (assignedTo && options.conversationId) {
      await admin
        .from('conversations')
        .update({
          assigned_agent_id: assignedTo,
          ai_autoreply_disabled: false,
        })
        .eq('id', options.conversationId);
    }

    // 5. Upsert lead in meta_lead_logs
    const { data: existingLead } = await admin
      .from('meta_lead_logs')
      .select('id, assigned_to')
      .eq('account_id', accountId)
      .eq('contact_id', options.contactId)
      .maybeSingle();

    if (existingLead) {
      await admin
        .from('meta_lead_logs')
        .update({
          campaign_name: detectedCampaign,
          ad_name: adName || null,
          assigned_to: assignedTo || existingLead.assigned_to,
          assigned_at: assignedTo ? new Date().toISOString() : undefined,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingLead.id);
    } else {
      await admin.from('meta_lead_logs').insert({
        account_id: accountId,
        form_name: 'Click-to-WhatsApp Ad',
        campaign_name: detectedCampaign,
        ad_name: adName || null,
        full_name: options.fullName || 'WhatsApp Ad Lead',
        phone: options.phone,
        status: 'processed',
        lead_status: 'new',
        contact_id: options.contactId,
        conversation_id: options.conversationId,
        assigned_to: assignedTo || null,
        assigned_at: assignedTo ? new Date().toISOString() : null,
        whatsapp_sent: false,
        ai_chat_enabled: matchedRule ? matchedRule.ai_auto_chat_enabled : true,
        raw_data: {
          referral: options.referral || null,
          source: 'ctwa',
        },
      });
    }

    // 6. Sync to pipeline deal
    await syncLeadToPipelineDeal(admin, accountId, {
      contactId: options.contactId,
      conversationId: options.conversationId,
      fullName: options.fullName,
      phone: options.phone,
      formName: 'Click-to-WhatsApp Ad',
      assignedUserId: assignedTo,
    });

    return {
      isAdLead: true,
      campaignName: detectedCampaign,
      assignedTo,
      ruleMatched: Boolean(matchedRule),
    };
  } catch (err) {
    console.error('[handleWhatsAppAdReferral] Error:', err);
    return { isAdLead: false };
  }
}

