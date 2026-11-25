import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/ai/admin-client';
import { automateCounsellingOutreach } from '@/lib/counselling/engine';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/counselling/automate
 * Dispatches automated WhatsApp reply and/or Email using the generated Counselling points/drafts
 * to selected CRM leads or a direct recipient, and logs counselor activity onto lead notes.
 */
export async function POST(req: NextRequest) {
  try {
    const ctx = await getCurrentAccount();
    const admin = supabaseAdmin();
    const body = await req.json().catch(() => ({}));

    const universityName = String(body?.universityName || '').trim();
    const courseName = String(body?.courseName || '').trim();
    const websiteUrl = String(body?.websiteUrl || '').trim();
    const whatsappMessage = String(body?.whatsappMessage || '').trim();
    const emailSubject = String(body?.emailSubject || '').trim();
    const emailHeadline = String(body?.emailHeadline || '').trim();
    const emailBodyText = String(body?.emailBodyText || '').trim();
    const emailSummaryPoints = Array.isArray(body?.emailSummaryPoints)
      ? body.emailSummaryPoints.map((s: unknown) => String(s || ''))
      : [];

    const sendWhatsApp = body?.sendWhatsApp !== false;
    const sendEmail = body?.sendEmail !== false;
    const rawLeadIds: string[] = Array.isArray(body?.leadIds)
      ? body.leadIds.map((id: unknown) => String(id || '')).filter(Boolean)
      : [];

    const customRecipient =
      body?.customRecipient && typeof body.customRecipient === 'object'
        ? {
            name: String(body.customRecipient.name || '').trim(),
            phone: String(body.customRecipient.phone || '').trim(),
            email: String(body.customRecipient.email || '').trim(),
          }
        : undefined;

    if (!universityName || !courseName) {
      return NextResponse.json(
        { error: 'universityName and courseName are required' },
        { status: 400 }
      );
    }

    if (!sendWhatsApp && !sendEmail) {
      return NextResponse.json(
        { error: 'Select at least one channel (WhatsApp or Email) to automate' },
        { status: 400 }
      );
    }

    if (
      rawLeadIds.length === 0 &&
      !customRecipient?.phone &&
      !customRecipient?.email
    ) {
      return NextResponse.json(
        { error: 'Please select a lead or enter a recipient phone/email address.' },
        { status: 400 }
      );
    }

    // Scope leads if caller is regular agent
    let authorizedLeadIds = rawLeadIds;
    if (ctx.role === 'agent' && rawLeadIds.length > 0) {
      const { data: ownLeads } = await admin
        .from('meta_lead_logs')
        .select('id')
        .eq('account_id', ctx.accountId)
        .eq('assigned_to', ctx.userId)
        .in('id', rawLeadIds);

      authorizedLeadIds = (ownLeads || []).map((l) => l.id);
      if (authorizedLeadIds.length === 0 && !customRecipient?.phone && !customRecipient?.email) {
        return NextResponse.json(
          { error: 'Permission denied: agents can only dispatch to their assigned leads' },
          { status: 403 }
        );
      }
    }

    const { data: profile } = await admin
      .from('profiles')
      .select('full_name, email')
      .eq('user_id', ctx.userId)
      .maybeSingle();

    const counselorName =
      profile?.full_name || profile?.email?.split('@')[0] || 'Admissions Counselor';

    const outcome = await automateCounsellingOutreach({
      db: admin,
      accountId: ctx.accountId,
      userId: ctx.userId,
      counselorName,
      universityName,
      courseName,
      websiteUrl,
      whatsappMessage,
      emailSubject: emailSubject || `${universityName} — ${courseName} Counseling Guide`,
      emailHeadline: emailHeadline || `${courseName} at ${universityName}`,
      emailBodyText,
      emailSummaryPoints,
      sendWhatsApp,
      sendEmail,
      leadIds: authorizedLeadIds,
      customRecipient,
    });

    return NextResponse.json({
      success: true,
      ...outcome,
    });
  } catch (err) {
    console.error('[POST /api/counselling/automate] error:', err);
    return toErrorResponse(err);
  }
}
