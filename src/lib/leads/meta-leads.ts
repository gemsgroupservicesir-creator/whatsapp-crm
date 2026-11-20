import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { parseInternationalPhone } from '@/lib/whatsapp/phone-utils';
import { findOrCreateContact, resolveAuditUserId } from '@/lib/api/v1/contacts';
import { resolveConversationByPhone } from '@/lib/whatsapp/resolve-conversation';
import { sendMessageToConversation } from '@/lib/whatsapp/send-message';

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
  adId?: string;
  adName?: string;
  rawFields?: Record<string, string>;
}

export interface ProcessLeadResult {
  success: boolean;
  contactId?: string;
  conversationId?: string;
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
      }
    }

    return {
      leadgenId,
      formId: data.form_id || undefined,
      fullName: fullName.trim() || 'Meta Lead',
      phone: phone.trim(),
      email: email.trim() || undefined,
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
 * Ingests a Meta Lead into the CRM:
 * 1. Sanitizes phone number.
 * 2. Creates/Finds Contact and applies tag.
 * 3. Resolves/Creates Conversation.
 * 4. Optionally sends instant WhatsApp template message if configured.
 * 5. Logs to meta_lead_logs.
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

  // 5. Check if auto-WhatsApp is enabled & configured
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

  // 6. Log the lead
  await admin.from('meta_lead_logs').insert({
    account_id: accountId,
    leadgen_id: lead.leadgenId || null,
    form_id: lead.formId || null,
    form_name: lead.formName || 'Meta Instant Form',
    full_name: lead.fullName,
    phone: formattedPhone,
    email: lead.email || null,
    raw_data: lead.rawFields || {},
    status: 'processed',
    contact_id: contactId,
    whatsapp_sent: whatsappSent,
    error_message: whatsappError || null,
  });

  return {
    success: true,
    contactId,
    conversationId,
    whatsappSent,
  };
}
