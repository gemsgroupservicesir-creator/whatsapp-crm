import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { processIncomingLead } from '@/lib/leads/meta-leads';
import { toErrorResponse } from '@/lib/auth/account';

export const dynamic = 'force-dynamic';

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * POST /api/account/leads/test
 * Simulates a test Meta Lead Ads submission so the user can verify contact creation and WhatsApp auto-reply with 1 click.
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
      .select('account_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!profile?.account_id) {
      return NextResponse.json({ error: 'No active workspace found' }, { status: 400 });
    }

    const body = (await request.json().catch(() => null)) as {
      fullName?: string;
      phone?: string;
      email?: string;
      formName?: string;
    } | null;

    const fullName = body?.fullName?.trim() || 'Test Meta Lead';
    const phone = body?.phone?.trim() || '+919876543210';
    const email = body?.email?.trim() || 'test.lead@example.com';
    const formName = body?.formName?.trim() || 'Sample Meta Instant Form';

    const result = await processIncomingLead(profile.account_id, {
      fullName,
      phone,
      email,
      formName,
      leadgenId: `test_lead_${Date.now()}`,
      rawFields: {
        full_name: fullName,
        phone_number: phone,
        email: email,
        simulated: 'true',
      },
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Failed to process test lead' }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: 'Test lead processed successfully!',
      contactId: result.contactId,
      conversationId: result.conversationId,
      whatsappSent: result.whatsappSent,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
