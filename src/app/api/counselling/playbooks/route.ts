import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/ai/admin-client';
import {
  deleteCounsellingPlaybook,
  loadCounsellingPlaybooks,
  renderCounsellingEmailHtml,
  saveCounsellingPlaybook,
  syncPlaybookToKnowledgeBase,
  type CounsellingPlaybook,
} from '@/lib/counselling/engine';
import { getWorkspaceWhatsAppPhone } from '@/lib/whatsapp/wa-phone';

export const dynamic = 'force-dynamic';

/**
 * POST /api/counselling/playbooks
 * Saves or updates a Counselling Playbook and optionally syncs it to AI Knowledge Base.
 */
export async function POST(req: NextRequest) {
  try {
    const ctx = await getCurrentAccount();
    const admin = supabaseAdmin();
    const body = await req.json().catch(() => ({}));

    const universityName =
      typeof body?.universityName === 'string' ? body.universityName.trim() : '';
    const courseName =
      typeof body?.courseName === 'string' ? body.courseName.trim() : '';

    if (!universityName || !courseName) {
      return NextResponse.json(
        { error: 'universityName and courseName are required' },
        { status: 400 }
      );
    }

    const { data: profile } = await admin
      .from('profiles')
      .select('full_name, email')
      .eq('user_id', ctx.userId)
      .maybeSingle();

    const counselorName =
      profile?.full_name || profile?.email?.split('@')[0] || 'Admissions Counselor';
    const waPhone = await getWorkspaceWhatsAppPhone(admin, ctx.accountId);
    const now = new Date().toISOString();

    const emailDraftInput = body?.emailDraft || {};
    const subject = String(
      emailDraftInput.subject || `${universityName} — ${courseName} Counseling Highlights`
    );
    const headline = String(emailDraftInput.headline || `${courseName} at ${universityName}`);
    const bodyText = String(emailDraftInput.bodyText || '');
    const summaryPoints = Array.isArray(emailDraftInput.summaryPoints)
      ? emailDraftInput.summaryPoints.map((s: unknown) => String(s || ''))
      : [];

    const playbook: CounsellingPlaybook = {
      id: typeof body?.id === 'string' && body.id.trim() ? body.id.trim() : `pb_${crypto.randomUUID()}`,
      universityName,
      courseName,
      websiteUrl: typeof body?.websiteUrl === 'string' ? body.websiteUrl.trim() : '',
      websiteTitle: typeof body?.websiteTitle === 'string' ? body.websiteTitle : undefined,
      websiteSynced: Boolean(body?.websiteSynced),
      websiteNote: typeof body?.websiteNote === 'string' ? body.websiteNote : undefined,
      additionalNotes: typeof body?.additionalNotes === 'string' ? body.additionalNotes : undefined,
      universityOverview: String(body?.universityOverview || ''),
      counsellingPoints: Array.isArray(body?.counsellingPoints) ? body.counsellingPoints : [],
      openingPitch: String(body?.openingPitch || ''),
      objectionHandlers: Array.isArray(body?.objectionHandlers) ? body.objectionHandlers : [],
      whatsappReplyDraft: String(body?.whatsappReplyDraft || ''),
      emailDraft: {
        subject,
        headline,
        bodyText,
        summaryPoints,
        bodyHtml: renderCounsellingEmailHtml({
          subject,
          headline,
          universityName,
          courseName,
          websiteUrl: typeof body?.websiteUrl === 'string' ? body.websiteUrl.trim() : '',
          bodyText,
          summaryPoints,
          counselorName,
          counselorPhone: waPhone.displayPhone,
          waLink: waPhone.waLink,
        }),
      },
      autoWhatsappEnabled: body?.autoWhatsappEnabled !== false,
      autoEmailEnabled: body?.autoEmailEnabled !== false,
      kbDocumentId: typeof body?.kbDocumentId === 'string' ? body.kbDocumentId : undefined,
      createdBy: ctx.userId,
      createdByName: counselorName,
      createdAt: typeof body?.createdAt === 'string' ? body.createdAt : now,
      updatedAt: now,
    };

    let kbWarning: string | undefined;
    if (body?.syncToKb !== false) {
      try {
        const kbRes = await syncPlaybookToKnowledgeBase(admin, ctx.accountId, ctx.userId, playbook);
        playbook.kbDocumentId = kbRes.documentId;
        kbWarning = kbRes.warning;
      } catch (kbErr) {
        kbWarning = kbErr instanceof Error ? kbErr.message : 'KB sync skipped';
      }
    }

    const playbooks = await saveCounsellingPlaybook(admin, ctx.accountId, ctx.userId, playbook);

    return NextResponse.json({
      success: true,
      playbook,
      playbooks,
      kbWarning,
    });
  } catch (err) {
    console.error('[POST /api/counselling/playbooks] error:', err);
    return toErrorResponse(err);
  }
}

/**
 * PATCH /api/counselling/playbooks
 * Toggles automation flags (autoWhatsappEnabled / autoEmailEnabled) or triggers KB sync.
 */
export async function PATCH(req: NextRequest) {
  try {
    const ctx = await getCurrentAccount();
    const admin = supabaseAdmin();
    const body = await req.json().catch(() => ({}));

    const id = typeof body?.id === 'string' ? body.id.trim() : '';
    if (!id) {
      return NextResponse.json({ error: 'Playbook id is required' }, { status: 400 });
    }

    const existingList = await loadCounsellingPlaybooks(admin, ctx.accountId);
    const target = existingList.find((p) => p.id === id);
    if (!target) {
      return NextResponse.json({ error: 'Counselling playbook not found' }, { status: 404 });
    }

    if (typeof body.autoWhatsappEnabled === 'boolean') {
      target.autoWhatsappEnabled = body.autoWhatsappEnabled;
    }
    if (typeof body.autoEmailEnabled === 'boolean') {
      target.autoEmailEnabled = body.autoEmailEnabled;
    }
    if (body.syncToKb === true) {
      const kbRes = await syncPlaybookToKnowledgeBase(admin, ctx.accountId, ctx.userId, target);
      target.kbDocumentId = kbRes.documentId;
    }

    const playbooks = await saveCounsellingPlaybook(admin, ctx.accountId, ctx.userId, target);
    return NextResponse.json({
      success: true,
      playbook: target,
      playbooks,
    });
  } catch (err) {
    console.error('[PATCH /api/counselling/playbooks] error:', err);
    return toErrorResponse(err);
  }
}

/**
 * DELETE /api/counselling/playbooks?id=...
 */
export async function DELETE(req: NextRequest) {
  try {
    const ctx = await getCurrentAccount();
    const admin = supabaseAdmin();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id')?.trim();

    if (!id) {
      return NextResponse.json({ error: 'Playbook id is required' }, { status: 400 });
    }

    const playbooks = await deleteCounsellingPlaybook(admin, ctx.accountId, ctx.userId, id);
    return NextResponse.json({
      success: true,
      playbooks,
    });
  } catch (err) {
    console.error('[DELETE /api/counselling/playbooks] error:', err);
    return toErrorResponse(err);
  }
}
