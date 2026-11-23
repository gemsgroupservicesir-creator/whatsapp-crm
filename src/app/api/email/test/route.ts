import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { toErrorResponse } from '@/lib/auth/account';
import { loadEmailConfig } from '@/lib/email/config';
import { sendEmailWithResend } from '@/lib/email/resend';

export const dynamic = 'force-dynamic';

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * POST /api/email/test
 * Sends a test email to verify the Resend API configuration.
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
      .select('account_id, account_role, full_name, email')
      .eq('user_id', user.id)
      .maybeSingle();

    const body = await request.json().catch(() => ({}));

    // Resolve workspace account with multi-level fallbacks
    let effectiveAccountId = body.accountId || profile?.account_id;

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

    const recipient = String(
      body.to ||
      body.testRecipient ||
      body.recipient ||
      profile?.email ||
      user.email ||
      ''
    ).trim();

    if (!recipient || !recipient.includes('@')) {
      return NextResponse.json(
        { error: 'A valid recipient email address is required' },
        { status: 400 }
      );
    }

    const config = await loadEmailConfig(admin, effectiveAccountId);
    const activeApiKey =
      body.apiKey && typeof body.apiKey === 'string' && !body.apiKey.includes('••••')
        ? body.apiKey.trim()
        : config?.apiKey;

    if (!activeApiKey) {
      return NextResponse.json(
        { error: 'Resend API key is not configured. Please enter your API key first.' },
        { status: 400 }
      );
    }

    const fromEmail = body.fromEmail?.trim() || config?.fromEmail || 'GEMS Admissions <onboarding@resend.dev>';

    const testSubject = 'GEMS Education — Resend Email Verification Test';
    const testHtml = `<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; background-color: #f8fafc; padding: 24px; color: #1e293b;">
  <div style="max-width: 540px; margin: 0 auto; background: #ffffff; padding: 28px; border-radius: 8px; border: 1px solid #e2e8f0;">
    <h2 style="color: #166534; margin-top: 0;">🎉 Resend Email Delivery Configured!</h2>
    <p>This is a test email sent from your <strong>WACRM</strong> Admissions system.</p>
    <div style="background-color: #f1f5f9; padding: 12px 16px; border-radius: 6px; font-size: 14px;">
      • <strong>Sender:</strong> ${fromEmail}<br>
      • <strong>Recipient:</strong> ${recipient}<br>
      • <strong>Delivered via:</strong> Resend API (HTTP POST)<br>
      • <strong>Timestamp:</strong> ${new Date().toLocaleString()}
    </div>
    <p style="font-size: 14px; color: #64748b; margin-top: 20px;">
      Your Auto Email Sender is ready to automatically dispatch welcome and admission emails to incoming Meta leads.
    </p>
  </div>
</body>
</html>`;

    const result = await sendEmailWithResend({
      apiKey: activeApiKey,
      from: fromEmail,
      to: recipient,
      subject: testSubject,
      html: testHtml,
      replyTo: config?.replyToEmail,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to send test email' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      id: result.id,
      recipient,
      message: `Test email sent successfully to ${recipient}!`,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
