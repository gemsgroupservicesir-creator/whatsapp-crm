import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { toErrorResponse } from '@/lib/auth/account';
import { loadEmailConfig } from '@/lib/email/config';
import { sendEmailWithResend, renderLeadWelcomeEmail } from '@/lib/email/resend';
import { parseLeadNotes, serializeLeadNotes, type LeadNote } from '@/lib/leads/notes';

export const dynamic = 'force-dynamic';

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * POST /api/email/send-lead
 * Allows counselors or admins to manually trigger or re-send the admissions welcome email to a lead.
 * Body: { leadId: string, customSubject?: string, accountId?: string }
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
    const body = await request.json().catch(() => ({}));
    const leadId = String(body.leadId || '').trim();

    if (!leadId) {
      return NextResponse.json({ error: 'leadId is required' }, { status: 400 });
    }

    // 1. Fetch user's profile without requesting missing columns
    const { data: profile } = await admin
      .from('profiles')
      .select('account_id, account_role, full_name, email')
      .eq('user_id', user.id)
      .maybeSingle();

    // 2. Fetch the target lead record directly
    const { data: lead } = await admin
      .from('meta_lead_logs')
      .select('*')
      .eq('id', leadId)
      .maybeSingle();

    if (!lead) {
      return NextResponse.json({ error: 'Lead record not found' }, { status: 404 });
    }

    // 3. Resolve active workspace with multi-level fallbacks
    let effectiveAccountId =
      body.accountId ||
      lead.account_id ||
      profile?.account_id;

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

    if (!lead.email || !lead.email.includes('@')) {
      return NextResponse.json(
        { error: 'This lead has no valid email address recorded' },
        { status: 400 }
      );
    }

    const emailConfig = await loadEmailConfig(admin, effectiveAccountId);
    if (!emailConfig?.apiKey) {
      return NextResponse.json(
        { error: 'Resend Email is not configured. Please add your Resend API key in Settings → Email delivery.' },
        { status: 400 }
      );
    }

    // Resolve assigned counselor details
    let counselorName = profile?.full_name || 'Senior Admissions Counselor';
    let counselorPhone = '+977 980-0000000';
    let counselorEmail = profile?.email || undefined;

    if (lead.assigned_to && lead.assigned_to !== user.id) {
      const { data: counselorProfile } = await admin
        .from('profiles')
        .select('full_name, email')
        .eq('user_id', lead.assigned_to)
        .maybeSingle();

      if (counselorProfile) {
        counselorName = counselorProfile.full_name || counselorName;
        counselorEmail = counselorProfile.email || counselorEmail;
      }
    }

    const rendered = renderLeadWelcomeEmail(
      {
        fullName: lead.full_name,
        email: lead.email,
        phone: lead.phone,
        college: lead.college,
        course: lead.course,
        city: lead.city,
        campaignName: lead.campaign_name,
        counselorName,
        counselorPhone,
        counselorEmail,
      },
      body.customSubject || emailConfig.subjectTemplate
    );

    const result = await sendEmailWithResend({
      apiKey: emailConfig.apiKey,
      from: emailConfig.fromEmail,
      to: lead.email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      replyTo: emailConfig.replyToEmail || counselorEmail,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to dispatch email' },
        { status: 400 }
      );
    }

    // Append an automated timeline note to lead's notes
    const existingNotes = parseLeadNotes(lead.notes);
    const newNote: LeadNote = {
      id: crypto.randomUUID(),
      text: `📧 Welcome email sent to ${lead.email} (${rendered.subject}) by ${profile?.full_name || 'Counselor'}.`,
      author_name: profile?.full_name || 'Counselor',
      author_type: 'counselor',
      created_at: new Date().toISOString(),
    };

    const currentRaw = lead.raw_data && typeof lead.raw_data === 'object' ? lead.raw_data : {};
    const updatedRaw = {
      ...currentRaw,
      email_delivery: {
        sent: true,
        sent_at: new Date().toISOString(),
        message_id: result.id,
        to: lead.email,
        subject: rendered.subject,
      },
    };

    await admin
      .from('meta_lead_logs')
      .update({
        notes: serializeLeadNotes([...existingNotes, newNote]),
        raw_data: updatedRaw,
        updated_at: new Date().toISOString(),
      })
      .eq('id', lead.id);

    return NextResponse.json({
      success: true,
      id: result.id,
      recipient: lead.email,
      subject: rendered.subject,
      message: `Welcome email successfully delivered to ${lead.email}!`,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
