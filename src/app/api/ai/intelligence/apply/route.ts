import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';
import { canEditSettings } from '@/lib/auth/roles';
import { supabaseAdmin } from '@/lib/ai/admin-client';
import { applyCrmRecommendation } from '@/lib/ai/crm-intelligence';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/ai/intelligence/apply
 * Executes a recommended workflow change in the CRM.
 */
export async function POST(req: NextRequest) {
  try {
    const ctx = await getCurrentAccount();
    if (!canEditSettings(ctx.role)) {
      return NextResponse.json(
        { error: 'Admin or Owner permission is required to apply workspace-wide CRM changes.' },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const recommendationId =
      typeof body?.recommendationId === 'string' ? body.recommendationId.trim() : '';

    if (!recommendationId) {
      return NextResponse.json({ error: 'recommendationId is required' }, { status: 400 });
    }

    const admin = supabaseAdmin();
    const { report, summary } = await applyCrmRecommendation(
      admin,
      ctx.accountId,
      ctx.userId,
      recommendationId
    );

    return NextResponse.json({
      success: true,
      summary,
      report,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('not found') || msg.includes('Missing')) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error('[POST /api/ai/intelligence/apply] error:', err);
    return toErrorResponse(err);
  }
}
