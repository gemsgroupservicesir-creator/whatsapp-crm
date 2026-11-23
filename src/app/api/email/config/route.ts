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
      .select('account_id, account_role')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!profile?.account_id) {
      return NextResponse.json({ error: 'No active workspace found' }, { status: 400 });
    }

    const config = await loadEmailConfig(admin, profile.account_id);
    const hasEnvKey = Boolean(process.env.RESEND_API_KEY);

    return NextResponse.json({
      config: config
        ? {
            provider: config.provider,
            fromEmail: config.fromEmail,
            replyToEmail: config.replyToEmail || '',
            autoEmailEnabled: config.autoEmailEnabled,
            subjectTemplate: config.subjectTemplate || '',
            hasApiKey: Boolean(config.apiKey),
            maskedApiKey: maskApiKey(config.apiKey),
          }
        : {
            provider: 'resend',
            fromEmail: 'GEMS Admissions <onboarding@resend.dev>',
            replyToEmail: '',
            autoEmailEnabled: false,
            subjectTemplate: 'Welcome to {{college}} — {{course}} Admissions {{year}}',
            hasApiKey: false,
            maskedApiKey: '',
          },
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

    if (!profile?.account_id) {
      return NextResponse.json({ error: 'No active workspace found' }, { status: 400 });
    }

    if (profile.account_role !== 'owner' && profile.account_role !== 'admin') {
      return NextResponse.json(
        { error: 'Only admins can modify email configuration' },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
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

    if (typeof body.subjectTemplate === 'string') {
      updatePayload.subjectTemplate = body.subjectTemplate.trim();
    }

    await saveEmailConfig(admin, profile.account_id, user.id, updatePayload);

    return NextResponse.json({ success: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
