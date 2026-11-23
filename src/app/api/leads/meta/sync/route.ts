import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { toErrorResponse } from '@/lib/auth/account';
import { syncMetaFormLeads } from '@/lib/leads/meta-leads';

export const dynamic = 'force-dynamic';

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * POST /api/leads/meta/sync
 * Manually or periodically syncs all leads directly from Meta Instant Forms via Graph API.
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
      return NextResponse.json({ error: 'No active workspace found' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const targetFormId = body?.formId ? String(body.formId) : undefined;

    const result = await syncMetaFormLeads(profile.account_id, targetFormId);

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Failed to sync Meta leads' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `Sync completed: ${result.syncedCount} new lead(s) imported, ${result.skippedCount} already recorded (${result.totalFound} total checked).`,
      syncedCount: result.syncedCount,
      skippedCount: result.skippedCount,
      totalFound: result.totalFound,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
