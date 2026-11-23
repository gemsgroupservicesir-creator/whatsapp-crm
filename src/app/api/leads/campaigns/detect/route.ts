import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { toErrorResponse } from '@/lib/auth/account';
import { detectWorkspaceCampaigns } from '@/lib/leads/meta-leads';

export const dynamic = 'force-dynamic';

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * GET /api/leads/campaigns/detect
 * Discovers and returns all auto-detected campaigns from Meta Lead Ads,
 * Meta Instant Forms, WhatsApp CTWA referrals, rules, and DB lead logs.
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

    const campaigns = await detectWorkspaceCampaigns(profile.account_id);

    return NextResponse.json({
      success: true,
      campaigns,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
