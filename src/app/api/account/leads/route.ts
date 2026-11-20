import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { toErrorResponse } from '@/lib/auth/account';

export const dynamic = 'force-dynamic';

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * GET /api/account/leads
 * Returns Meta Lead Ads configuration, verify token, templates, and recent leads.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = getAdminClient();
    const { data: profile } = await admin
      .from('profiles')
      .select('account_id, account_role')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!profile?.account_id) {
      return NextResponse.json({ error: 'No active workspace found' }, { status: 400 });
    }

    const accountId = profile.account_id;

    // Get or initialize meta_lead_configs row
    let { data: config } = await admin
      .from('meta_lead_configs')
      .select('*')
      .eq('account_id', accountId)
      .maybeSingle();

    if (!config) {
      const { data: newCfg } = await admin
        .from('meta_lead_configs')
        .insert({
          account_id: accountId,
          is_enabled: true,
          auto_tag: 'Meta Lead',
        })
        .select('*')
        .single();
      config = newCfg;
    }

    // Get available WhatsApp approved templates for auto-reply
    const { data: templates } = await admin
      .from('message_templates')
      .select('id, name, status, category, language')
      .eq('account_id', accountId)
      .order('name', { ascending: true });

    // Get last 25 lead logs
    const { data: recentLeads } = await admin
      .from('meta_lead_logs')
      .select('id, leadgen_id, form_name, full_name, phone, email, status, whatsapp_sent, error_message, created_at, contact_id')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(25);

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://whatsapp-crm-beta-seven.vercel.app';
    const webhookUrl = `${baseUrl}/api/leads/meta?accountId=${accountId}`;

    return NextResponse.json({
      config: {
        id: config.id,
        is_enabled: config.is_enabled,
        page_id: config.page_id || '',
        page_name: config.page_name || '',
        has_page_token: Boolean(config.page_access_token),
        verify_token: config.verify_token,
        auto_whatsapp_enabled: config.auto_whatsapp_enabled,
        auto_template_id: config.auto_template_id || '',
        auto_template_name: config.auto_template_name || '',
        auto_tag: config.auto_tag || 'Meta Lead',
      },
      webhookUrl,
      templates: templates || [],
      recentLeads: recentLeads || [],
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * POST /api/account/leads
 * Saves or updates Meta Lead Ads configuration.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = getAdminClient();
    const { data: profile } = await admin
      .from('profiles')
      .select('account_id, account_role')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!profile?.account_id) {
      return NextResponse.json({ error: 'No active workspace' }, { status: 400 });
    }

    if (profile.account_role !== 'owner' && profile.account_role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as {
      is_enabled?: boolean;
      page_id?: string;
      page_name?: string;
      page_access_token?: string;
      auto_whatsapp_enabled?: boolean;
      auto_template_id?: string;
      auto_template_name?: string;
      auto_tag?: string;
    } | null;

    const accountId = profile.account_id;

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (typeof body?.is_enabled === 'boolean') updatePayload.is_enabled = body.is_enabled;
    if (typeof body?.page_id === 'string') updatePayload.page_id = body.page_id.trim();
    if (typeof body?.page_name === 'string') updatePayload.page_name = body.page_name.trim();
    if (typeof body?.page_access_token === 'string' && body.page_access_token.trim()) {
      updatePayload.page_access_token = body.page_access_token.trim();
    }
    if (typeof body?.auto_whatsapp_enabled === 'boolean') {
      updatePayload.auto_whatsapp_enabled = body.auto_whatsapp_enabled;
    }
    if (typeof body?.auto_template_id === 'string') {
      updatePayload.auto_template_id = body.auto_template_id || null;
    }
    if (typeof body?.auto_template_name === 'string') {
      updatePayload.auto_template_name = body.auto_template_name.trim() || null;
    }
    if (typeof body?.auto_tag === 'string') {
      updatePayload.auto_tag = body.auto_tag.trim() || 'Meta Lead';
    }

    const { data: updated, error: upsertErr } = await admin
      .from('meta_lead_configs')
      .upsert(
        { account_id: accountId, ...updatePayload },
        { onConflict: 'account_id' }
      )
      .select('*')
      .single();

    if (upsertErr) {
      console.error('[POST /api/account/leads] upsert error:', upsertErr);
      return NextResponse.json({ error: upsertErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, config: updated });
  } catch (err) {
    return toErrorResponse(err);
  }
}
