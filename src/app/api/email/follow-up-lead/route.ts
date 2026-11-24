import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { toErrorResponse } from '@/lib/auth/account';
import {
  sendLeadFollowUpEmail,
  generateNotesFollowUpEmail,
  type FollowUpEmailContext,
} from '@/lib/email/follow-up';
import { parseLeadNotes } from '@/lib/leads/notes';
import { loadAiConfig } from '@/lib/ai/config';
import { getWorkspaceWhatsAppPhone } from '@/lib/whatsapp/wa-phone';

export const dynamic = 'force-dynamic';

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * POST /api/email/follow-up-lead
 *
 * Generates and/or dispatches a personalized admissions follow-up email
 * tailored specifically to the lead's notes and counseling discussions.
 *
 * Body:
 * - leadId: string (required)
 * - accountId?: string
 * - customSubject?: string
 * - latestNoteText?: string
 * - previewOnly?: boolean (if true, returns subject & HTML preview without sending)
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

    // 1. Fetch user profile
    const { data: profile } = await admin
      .from('profiles')
      .select('account_id, account_role, full_name, email')
      .eq('user_id', user.id)
      .maybeSingle();

    // 2. Fetch the target lead
    const { data: lead, error: leadErr } = await admin
      .from('meta_lead_logs')
      .select('*')
      .eq('id', leadId)
      .maybeSingle();

    if (leadErr || !lead) {
      return NextResponse.json({ error: 'Lead record not found' }, { status: 404 });
    }

    if (!lead.email || !lead.email.includes('@')) {
      return NextResponse.json(
        { error: 'This lead has no valid email address recorded.' },
        { status: 400 }
      );
    }

    // 3. Resolve workspace with fallbacks
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

    // 4. Handle Preview-only mode
    if (body.previewOnly === true) {
      const aiConfig = await loadAiConfig(admin, effectiveAccountId).catch(() => null);

      const waPhone = await getWorkspaceWhatsAppPhone(admin, effectiveAccountId);
      let counselorName = profile?.full_name || 'Senior Admissions Counselor';
      let counselorPhone = waPhone.displayPhone;
      let counselorEmail = profile?.email || undefined;

      const counselorUserId = lead.assigned_to || user.id;
      if (counselorUserId) {
        const { data: counselorProfile } = await admin
          .from('profiles')
          .select('full_name, email')
          .eq('user_id', counselorUserId)
          .maybeSingle();

        if (counselorProfile) {
          counselorName = counselorProfile.full_name || counselorName;
          counselorEmail = counselorProfile.email || counselorEmail;
        }
      }

      const context: FollowUpEmailContext = {
        studentName: lead.full_name,
        studentEmail: lead.email,
        studentPhone: lead.phone,
        college: lead.college,
        course: lead.course,
        city: lead.city,
        campaignName: lead.campaign_name,
        counselorName,
        counselorPhone,
        counselorEmail,
        notes: parseLeadNotes(lead.notes),
        latestNoteText: body.latestNoteText,
        customSubject: body.customSubject,
      };

      const generated = await generateNotesFollowUpEmail(context, aiConfig);

      return NextResponse.json({
        success: true,
        preview: true,
        subject: generated.subject,
        html: generated.html,
        text: generated.text,
        source: generated.source,
        recipient: lead.email,
      });
    }

    // 5. Send Email mode
    const sendResult = await sendLeadFollowUpEmail({
      admin,
      accountId: effectiveAccountId,
      leadId: lead.id,
      currentUserId: user.id,
      latestNoteText: body.latestNoteText,
      customSubject: body.customSubject,
    });

    if (!sendResult.success) {
      return NextResponse.json(
        { error: sendResult.error || 'Failed to dispatch follow-up email' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      id: sendResult.id,
      subject: sendResult.subject,
      recipient: sendResult.recipient,
      source: sendResult.source,
      parsed_notes: sendResult.updatedNotes,
      message: `Follow-up email successfully sent to ${sendResult.recipient}!`,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
