import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { toErrorResponse } from '@/lib/auth/account';
import {
  sendLeadWhatsAppMessage,
  bulkSendLeadWhatsAppMessages,
} from '@/lib/leads/meta-leads';

export const dynamic = 'force-dynamic';

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * POST /api/leads/whatsapp
 * Sends or retries sending a WhatsApp welcome message to a lead or in bulk
 * from the verified WhatsApp Cloud API number.
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
      .select('account_id, account_role, full_name')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!profile?.account_id) {
      return NextResponse.json({ error: 'No active workspace found' }, { status: 400 });
    }

    const accountId = profile.account_id;
    const body = await request.json().catch(() => null);

    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Request body required' }, { status: 400 });
    }

    const isAgent = profile.account_role === 'agent';

    // 1. Bulk send
    if (body.bulk === true) {
      if (isAgent) {
        return NextResponse.json(
          { error: 'Permission denied: only admins can send bulk WhatsApp messages' },
          { status: 403 }
        );
      }

      const bulkResult = await bulkSendLeadWhatsAppMessages(admin, accountId, {
        onlyFailed: body.onlyFailed !== false,
        limit: typeof body.limit === 'number' ? Math.min(body.limit, 100) : 50,
        preferredTemplateName: body.templateName || undefined,
        senderUserId: user.id,
      });

      return NextResponse.json({
        success: true,
        ...bulkResult,
      });
    }

    // 2. Single lead send
    const leadId = String(body.leadId || body.id || '');
    if (!leadId) {
      return NextResponse.json({ error: 'leadId is required' }, { status: 400 });
    }

    // Agent check: agents can only send to leads assigned to them
    if (isAgent) {
      const { data: targetLead } = await admin
        .from('meta_lead_logs')
        .select('assigned_to')
        .eq('id', leadId)
        .eq('account_id', accountId)
        .maybeSingle();

      if (!targetLead || targetLead.assigned_to !== user.id) {
        return NextResponse.json(
          { error: 'Permission denied: you can only send WhatsApp messages to leads assigned to you' },
          { status: 403 }
        );
      }
    }

    const result = await sendLeadWhatsAppMessage({
      admin,
      accountId,
      leadId,
      preferredTemplateName: body.templateName || undefined,
      senderUserId: user.id,
    });

    if (!result.success) {
      return NextResponse.json(
        {
          error: result.error || 'Failed to send WhatsApp message',
          details: result,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ...result,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
