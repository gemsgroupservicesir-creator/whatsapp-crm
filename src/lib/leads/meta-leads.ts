import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { parseInternationalPhone } from '@/lib/whatsapp/phone-utils';
import { findOrCreateContact, resolveAuditUserId } from '@/lib/api/v1/contacts';
import { resolveConversationByPhone } from '@/lib/whatsapp/resolve-conversation';
import { sendMessageToConversation } from '@/lib/whatsapp/send-message';
import { decrypt } from '@/lib/whatsapp/encryption';

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
  assignedTo?: string;
  whatsappSent?: boolean;
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
    const url = `https://graph.facebook.com/v21.0/${leadgenId}?access_token=${encodeURIComponent(pageAccessToken)}`;
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
      } else if (name.includes('phone') || name === 'phone_number') {
        phone = val;
      } else if (name.includes('email')) {
        email = val;
      } else if (name.includes('college') || name.includes('university') || name.includes('institute') || name.includes('school') || name.includes('campus')) {
        college = val;
      } else if (name.includes('course') || name.includes('program') || name.includes('degree') || name.includes('branch') || name.includes('stream') || name.includes('specialization')) {
        course = val;
      } else if (name.includes('city') || name.includes('location') || name.includes('state')) {
        city = val;
      }
    }

    return {
      leadgenId,
      formId: data.form_id || undefined,
      fullName: fullName.trim() || 'Meta Lead',
      phone: phone.trim(),
      email: email.trim() || undefined,
      college: college.trim() || undefined,
      course: course.trim() || undefined,
      city: city.trim() || undefined,
      adId: data.ad_id || undefined,
      adName: data.ad_name || undefined,
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
export async function matchLeadAssignmentRule(
  admin: SupabaseClient,
  accountId: string,
  lead: {
    formName?: string;
    college?: string;
    course?: string;
  }
): Promise<string | null> {
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
      } else if (rule.criteria_type === 'any') {
        targetText = `${lead.formName || ''} ${lead.college || ''} ${lead.course || ''}`;
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
        return rule.assign_to_user_id;
      }
    }
  } catch (err) {
    console.warn('[MetaLeads] Error matching assignment rules:', err);
  }

  return null;
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

  // 5. Auto-assign lead to agent based on rules (College, Course, Form Name)
  let assignedTo: string | undefined;
  try {
    const matchedUserId = await matchLeadAssignmentRule(admin, accountId, {
      formName: lead.formName,
      college: lead.college,
      course: lead.course,
    });
    if (matchedUserId) {
      assignedTo = matchedUserId;
      if (conversationId) {
        await admin
          .from('conversations')
          .update({ assigned_agent_id: matchedUserId })
          .eq('id', conversationId);
      }
    }
  } catch (assignErr) {
    console.warn('[MetaLeads] Auto-assignment failed:', assignErr);
  }

  // 6. Check if auto-WhatsApp is enabled & configured
  let whatsappSent = false;
  let whatsappError: string | undefined;

  if (
    config?.auto_whatsapp_enabled &&
    config?.auto_template_name &&
    conversationId
  ) {
    try {
      await sendMessageToConversation(admin, accountId, {
        conversationId,
        messageType: 'template',
        templateName: config.auto_template_name,
      });
      whatsappSent = true;
    } catch (sendErr: unknown) {
      whatsappError = sendErr instanceof Error ? sendErr.message : String(sendErr);
      console.error('[MetaLeads] Auto-reply send failed:', sendErr);
    }
  }

  // 7. Log the lead with college, course, city, and assignment info
  await admin.from('meta_lead_logs').insert({
    account_id: accountId,
    leadgen_id: lead.leadgenId || null,
    form_id: lead.formId || null,
    form_name: lead.formName || 'Meta Instant Form',
    full_name: lead.fullName,
    phone: formattedPhone,
    email: lead.email || null,
    college: lead.college || null,
    course: lead.course || null,
    city: lead.city || null,
    raw_data: lead.rawFields || {},
    status: 'processed',
    lead_status: 'new',
    contact_id: contactId,
    conversation_id: conversationId || null,
    assigned_to: assignedTo || null,
    assigned_at: assignedTo ? new Date().toISOString() : null,
    whatsapp_sent: whatsappSent,
    error_message: whatsappError || null,
  });

  return {
    success: true,
    contactId,
    conversationId,
    assignedTo,
    whatsappSent,
  };
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

  // Fallback to whatsapp_config access_token if no page_access_token set
  if (!pageAccessToken && targetAccountId) {
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
    full_name: 'New Meta Lead',
    phone: 'Pending Token',
    status: 'token_required',
    raw_data: val,
    error_message: 'Page Access Token needed to fetch lead details from Graph API',
  });
}

