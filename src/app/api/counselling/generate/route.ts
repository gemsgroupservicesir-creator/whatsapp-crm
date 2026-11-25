import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/ai/admin-client';
import {
  generateCounsellingKit,
  loadCounsellingPlaybooks,
} from '@/lib/counselling/engine';
import { loadEmailConfig } from '@/lib/email/config';
import { getWorkspaceWhatsAppPhone } from '@/lib/whatsapp/wa-phone';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/counselling/generate
 * Loads saved Counselling Playbooks, targetable student leads, and workspace channel status.
 */
export async function GET() {
  try {
    const ctx = await getCurrentAccount();
    const admin = supabaseAdmin();

    const isAgent = ctx.role === 'agent';

    let leadQuery = admin
      .from('meta_lead_logs')
      .select('id, full_name, phone, email, college, course, city, lead_status, assigned_to, whatsapp_sent')
      .eq('account_id', ctx.accountId)
      .order('created_at', { ascending: false })
      .limit(150);

    if (isAgent) {
      leadQuery = leadQuery.eq('assigned_to', ctx.userId);
    }

    const [playbooks, leadsRes, emailCfg, waPhone, aiCfgRes] = await Promise.all([
      loadCounsellingPlaybooks(admin, ctx.accountId),
      leadQuery,
      loadEmailConfig(admin, ctx.accountId).catch(() => null),
      getWorkspaceWhatsAppPhone(admin, ctx.accountId),
      admin
        .from('ai_configs')
        .select('is_active, auto_reply_enabled, api_key')
        .eq('account_id', ctx.accountId)
        .maybeSingle(),
    ]);

    return NextResponse.json({
      success: true,
      playbooks,
      leads: leadsRes.data || [],
      channels: {
        whatsappPhone: waPhone.displayPhone,
        waLink: waPhone.waLink,
        emailConfigured: Boolean(emailCfg?.apiKey),
        fromEmail: emailCfg?.fromEmail || null,
        aiConfigured: Boolean(aiCfgRes.data?.api_key),
        aiAutoReplyEnabled: Boolean(aiCfgRes.data?.auto_reply_enabled),
      },
    });
  } catch (err) {
    console.error('[GET /api/counselling/generate] error:', err);
    return toErrorResponse(err);
  }
}

/**
 * POST /api/counselling/generate
 * Scrapes the university/course website (when supplied) and uses AI + CRM context to
 * generate structured counselling points, pitch, objection handlers, WhatsApp reply & Email drafts.
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
    const websiteUrl =
      typeof body?.websiteUrl === 'string' ? body.websiteUrl.trim() : '';
    const studentName =
      typeof body?.studentName === 'string' ? body.studentName.trim() : undefined;
    const additionalNotes =
      typeof body?.additionalNotes === 'string' ? body.additionalNotes.trim() : undefined;

    if (!universityName || !courseName) {
      return NextResponse.json(
        { error: 'University Name and Course Name are required.' },
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

    const { kit, source, scrapeResult } = await generateCounsellingKit({
      db: admin,
      accountId: ctx.accountId,
      universityName,
      courseName,
      websiteUrl,
      studentName,
      counselorName,
      additionalNotes,
    });

    return NextResponse.json({
      success: true,
      source,
      scrapeStatus: scrapeResult
        ? {
            ok: scrapeResult.ok,
            url: scrapeResult.url,
            title: scrapeResult.title,
            highlightsCount: scrapeResult.highlightsFound.length,
            error: scrapeResult.error,
          }
        : null,
      kit,
    });
  } catch (err) {
    console.error('[POST /api/counselling/generate] error:', err);
    return toErrorResponse(err);
  }
}
