import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  fetchLeadFromMetaGraphApi,
  processIncomingLead,
  type IncomingLeadPayload,
} from '@/lib/leads/meta-leads';
import { decrypt } from '@/lib/whatsapp/encryption';

export const dynamic = 'force-dynamic';

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * GET /api/leads/meta
 * Meta Webhook verification handshake.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');
  const explicitToken = searchParams.get('token');

  if (mode === 'subscribe' && challenge) {
    const admin = getAdminClient();

    // Check against configured verify tokens in meta_lead_configs or whatsapp_config
    const { data: leadConfig } = await admin
      .from('meta_lead_configs')
      .select('verify_token')
      .eq('verify_token', token || explicitToken)
      .limit(1)
      .maybeSingle();

    const { data: waConfig } = await admin
      .from('whatsapp_config')
      .select('verify_token')
      .eq('verify_token', token || explicitToken)
      .limit(1)
      .maybeSingle();

    if (leadConfig || waConfig || token === 'wacrm_meta_leads' || explicitToken === 'wacrm_meta_leads') {
      return new Response(challenge, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    // Default verify token fallback
    return new Response(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  return NextResponse.json({ error: 'Invalid verification request' }, { status: 400 });
}

/**
 * POST /api/leads/meta
 * Ingests Meta Instant Form Lead Ads webhook notifications or direct leads.
 */
export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const queryAccountId = url.searchParams.get('accountId');
    const admin = getAdminClient();

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    // CASE 1: Standard Meta Graph API webhook payload
    if (body.object === 'page' && Array.isArray(body.entry)) {
      for (const entry of body.entry) {
        const pageId = String(entry.id || '');
        const changes = Array.isArray(entry.changes) ? entry.changes : [];

        for (const change of changes) {
          if (change.field === 'leadgen' && change.value) {
            const val = change.value;
            const leadgenId = String(val.leadgen_id || '');
            const formId = String(val.form_id || '');

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
              console.warn('[MetaWebhook] No target workspace found for leadgen:', leadgenId);
              continue;
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
                continue;
              }
            }

            // Otherwise, record the notification
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
        }
      }

      return NextResponse.json({ success: true, processed: true });
    }

    // CASE 2: Direct Lead Payload (from Zapier, Make, custom webhooks, or test simulator)
    const phone =
      typeof body.phone === 'string'
        ? body.phone
        : typeof body.phone_number === 'string'
        ? body.phone_number
        : '';

    const fullName =
      typeof body.fullName === 'string'
        ? body.fullName
        : typeof body.name === 'string'
        ? body.name
        : typeof body.full_name === 'string'
        ? body.full_name
        : 'Meta Lead';

    const email =
      typeof body.email === 'string' ? body.email : typeof body.email_address === 'string' ? body.email_address : undefined;

    const formName =
      typeof body.formName === 'string'
        ? body.formName
        : typeof body.form_name === 'string'
        ? body.form_name
        : 'Meta Instant Form';

    const college =
      typeof body.college === 'string'
        ? body.college
        : typeof body.college_name === 'string'
        ? body.college_name
        : typeof body.university === 'string'
        ? body.university
        : typeof body.institute === 'string'
        ? body.institute
        : undefined;

    const course =
      typeof body.course === 'string'
        ? body.course
        : typeof body.course_name === 'string'
        ? body.course_name
        : typeof body.program === 'string'
        ? body.program
        : typeof body.degree === 'string'
        ? body.degree
        : undefined;

    const city =
      typeof body.city === 'string'
        ? body.city
        : typeof body.location === 'string'
        ? body.location
        : typeof body.state === 'string'
        ? body.state
        : undefined;

    if (phone) {
      let targetAccountId = queryAccountId;
      if (!targetAccountId) {
        const { data: primaryAcc } = await admin
          .from('accounts')
          .select('id')
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        targetAccountId = primaryAcc?.id;
      }

      if (targetAccountId) {
        const leadPayload: IncomingLeadPayload = {
          fullName,
          phone,
          email,
          formName,
          college,
          course,
          city,
          leadgenId: typeof body.leadgen_id === 'string' ? body.leadgen_id : undefined,
          formId: typeof body.form_id === 'string' ? body.form_id : undefined,
          rawFields: body as Record<string, string>,
        };

        const result = await processIncomingLead(targetAccountId, leadPayload);
        return NextResponse.json(result);
      }
    }

    return NextResponse.json({ success: true, message: 'Webhook received' });
  } catch (err: unknown) {
    console.error('[POST /api/leads/meta] unhandled exception:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
