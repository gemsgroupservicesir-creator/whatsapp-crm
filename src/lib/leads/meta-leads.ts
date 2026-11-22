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
  dealId?: string;
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
    full_name: 'New Meta Lead',
    phone: 'Pending Token',
    status: 'token_required',
    raw_data: val,
    error_message: 'Page Access Token needed to fetch lead details from Graph API',
  });
}

