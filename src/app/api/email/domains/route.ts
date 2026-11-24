import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { toErrorResponse } from '@/lib/auth/account';
import { loadEmailConfig } from '@/lib/email/config';

export const dynamic = 'force-dynamic';

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export interface ResendDomainItem {
  id: string;
  name: string;
  status: string;
  created_at: string;
  region: string;
  capabilities?: {
    sending?: string;
    receiving?: string;
  };
}

/**
 * GET /api/email/domains
 * Fetches verified custom domains configured in Resend using the active workspace API key.
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
      .select('account_id, account_role, full_name, email')
      .eq('user_id', user.id)
      .maybeSingle();

    let effectiveAccountId = profile?.account_id;

    if (!effectiveAccountId) {
      const { data: owned } = await admin
        .from('accounts')
        .select('id')
        .eq('owner_user_id', user.id)
        .limit(1)
        .maybeSingle();
      if (owned?.id) effectiveAccountId = owned.id;
    }

    if (!effectiveAccountId) {
      const { data: member } = await admin
        .from('account_members')
        .select('account_id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();
      if (member?.account_id) effectiveAccountId = member.account_id;
    }

    if (!effectiveAccountId) {
      const { data: anyAcc } = await admin
        .from('accounts')
        .select('id')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (anyAcc?.id) effectiveAccountId = anyAcc.id;
    }

    if (!effectiveAccountId) {
      return NextResponse.json({ error: 'No active workspace found' }, { status: 400 });
    }

    const config = await loadEmailConfig(admin, effectiveAccountId);
    const apiKey = config?.apiKey || process.env.RESEND_API_KEY;

    if (!apiKey) {
      return NextResponse.json({
        configured: false,
        domains: [],
        message: 'No Resend API key configured yet',
      });
    }

    const res = await fetch('https://api.resend.com/domains', {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      next: { revalidate: 60 },
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      return NextResponse.json({
        configured: true,
        domains: [],
        error: errorData.message || `Resend API returned status ${res.status}`,
      });
    }

    const result = await res.json();
    const rawDomains: ResendDomainItem[] = Array.isArray(result.data) ? result.data : [];

    const domains = rawDomains.map((d) => ({
      id: d.id,
      name: d.name,
      status: d.status,
      created_at: d.created_at,
      region: d.region,
      capabilities: d.capabilities,
    }));

    return NextResponse.json({
      configured: true,
      domains,
      verifiedDomainCount: domains.filter((d) => d.status.toLowerCase() === 'verified').length,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
