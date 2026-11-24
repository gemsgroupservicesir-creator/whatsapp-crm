import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { toErrorResponse } from '@/lib/auth/account';
import { loadEmailConfig, saveEmailConfig, maskApiKey } from '@/lib/email/config';

export const dynamic = 'force-dynamic';

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * GET /api/email/config
 * Returns current workspace email configuration (API key is masked for security).
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

    // Self-heal profile account_id if unlinked
    if (profile && !profile.account_id) {
      try {
        await admin
          .from('profiles')
          .update({
            account_id: effectiveAccountId,
            account_role: profile.account_role || 'owner',
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', user.id);
      } catch {
        // ignore
      }
    }

    const config = await loadEmailConfig(admin, effectiveAccountId);
    const hasEnvKey = Boolean(process.env.RESEND_API_KEY);

    const configObj = {
      provider: 'resend' as const,
      apiKey: config?.apiKey ? maskApiKey(config.apiKey) : '',
      fromEmail: config?.fromEmail || 'GEMS Admissions <admissions@gemsgroup.edu.np>',
      replyToEmail: config?.replyToEmail || '',
      autoEmailEnabled: config?.autoEmailEnabled ?? false,
      autoFollowUpOnNote: config?.autoFollowUpOnNote ?? false,
      subjectTemplate: config?.subjectTemplate || 'Welcome to {{college}} — {{course}} Admissions {{year}}',
      hasApiKey: Boolean(config?.apiKey),
      isEnvConfigured: hasEnvKey,
    };

    return NextResponse.json({
      ...configObj,
      config: configObj,
      isEnvKey: hasEnvKey,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * POST /api/email/config
 * Saves workspace email settings (Resend API key, from email, auto send toggle, etc.).
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

    const body = await request.json().catch(() => ({}));

    let effectiveAccountId = body.accountId || profile?.account_id;
    let effectiveRole = profile?.account_role;

    if (!effectiveAccountId) {
      const { data: owned } = await admin
        .from('accounts')
        .select('id')
        .eq('owner_user_id', user.id)
        .limit(1)
        .maybeSingle();
      if (owned?.id) {
        effectiveAccountId = owned.id;
        effectiveRole = 'owner';
      }
    }

    if (!effectiveAccountId) {
      const { data: member } = await admin
        .from('account_members')
        .select('account_id, role')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();
      if (member?.account_id) {
        effectiveAccountId = member.account_id;
        effectiveRole = member.role;
      }
    }

    if (!effectiveAccountId) {
      const { data: anyAcc } = await admin
        .from('accounts')
        .select('id, owner_user_id')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (anyAcc?.id) {
        effectiveAccountId = anyAcc.id;
        if (anyAcc.owner_user_id === user.id) effectiveRole = 'owner';
      }
    }

    if (!effectiveAccountId) {
      return NextResponse.json({ error: 'No active workspace found' }, { status: 400 });
    }

    // Self-heal profile account_id if unlinked
    if (profile && !profile.account_id) {
      try {
        await admin
          .from('profiles')
          .update({
            account_id: effectiveAccountId,
            account_role: effectiveRole || 'owner',
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', user.id);
      } catch {
        // ignore
      }
    }

    const updatePayload: Record<string, unknown> = {};

    if (typeof body.apiKey === 'string') {
      const trimmed = body.apiKey.trim();
      // If user typed a new key (not masked placeholder)
      if (trimmed && !trimmed.includes('••••')) {
        updatePayload.apiKey = trimmed;
      }
    }

    if (typeof body.fromEmail === 'string') {
      updatePayload.fromEmail = body.fromEmail.trim();
    }

    if (typeof body.replyToEmail === 'string') {
      updatePayload.replyToEmail = body.replyToEmail.trim();
    }

    if (typeof body.autoEmailEnabled === 'boolean') {
      updatePayload.autoEmailEnabled = body.autoEmailEnabled;
    }

    if (typeof body.autoFollowUpOnNote === 'boolean') {
      updatePayload.autoFollowUpOnNote = body.autoFollowUpOnNote;
    }

    if (typeof body.subjectTemplate === 'string') {
      updatePayload.subjectTemplate = body.subjectTemplate.trim();
    }

    await saveEmailConfig(admin, effectiveAccountId, user.id, updatePayload);

    return NextResponse.json({ success: true, accountId: effectiveAccountId });
  } catch (err) {
    return toErrorResponse(err);
  }
}
