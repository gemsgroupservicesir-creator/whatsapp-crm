import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/ai/admin-client';
import {
  askCrmIntelligence,
  collectCrmIntelligenceSnapshot,
  loadCrmIntelligenceReport,
  runCrmIntelligenceScan,
  updateRecommendationStatus,
} from '@/lib/ai/crm-intelligence';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/ai/intelligence
 * Returns the stored CRM-wide AI intelligence report + live snapshot metrics.
 * Automatically runs an initial scan if the workspace has never been scanned.
 */
export async function GET() {
  try {
    const ctx = await getCurrentAccount();
    const admin = supabaseAdmin();

    let report = await loadCrmIntelligenceReport(admin, ctx.accountId);
    if (!report) {
      report = await runCrmIntelligenceScan(admin, ctx.accountId, ctx.userId);
    } else {
      // Refresh live snapshot counters without overwriting AI recommendations
      report.snapshot = await collectCrmIntelligenceSnapshot(admin, ctx.accountId);
    }

    return NextResponse.json({
      success: true,
      report,
      role: ctx.role,
    });
  } catch (err) {
    console.error('[GET /api/ai/intelligence] error:', err);
    return toErrorResponse(err);
  }
}

/**
 * POST /api/ai/intelligence
 * Actions:
 *  - action: 'scan' -> Runs full CRM-wide AI learning scan & generates recommendations
 *  - action: 'ask' -> Answers an operational question against live CRM data
 *  - action: 'dismiss' | 'reopen' -> Updates recommendation status
 */
export async function POST(req: NextRequest) {
  try {
    const ctx = await getCurrentAccount();
    const admin = supabaseAdmin();
    const body = await req.json().catch(() => ({}));
    const action = typeof body?.action === 'string' ? body.action : 'scan';

    if (action === 'ask') {
      const question = typeof body?.question === 'string' ? body.question.trim() : '';
      if (!question) {
        return NextResponse.json({ error: 'Question is required' }, { status: 400 });
      }
      const result = await askCrmIntelligence(admin, ctx.accountId, question);
      return NextResponse.json({
        success: true,
        ...result,
      });
    }

    if (action === 'dismiss' || action === 'reopen') {
      const recommendationId =
        typeof body?.recommendationId === 'string' ? body.recommendationId.trim() : '';
      if (!recommendationId) {
        return NextResponse.json({ error: 'recommendationId is required' }, { status: 400 });
      }
      const nextStatus = action === 'dismiss' ? 'dismissed' : 'pending';
      const report = await updateRecommendationStatus(
        admin,
        ctx.accountId,
        ctx.userId,
        recommendationId,
        nextStatus
      );
      return NextResponse.json({
        success: true,
        report,
      });
    }

    // Default: run full CRM learning scan
    const report = await runCrmIntelligenceScan(admin, ctx.accountId, ctx.userId);
    return NextResponse.json({
      success: true,
      report,
    });
  } catch (err) {
    console.error('[POST /api/ai/intelligence] error:', err);
    return toErrorResponse(err);
  }
}
