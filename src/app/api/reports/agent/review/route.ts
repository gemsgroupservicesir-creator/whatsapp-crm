import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';
import {
  loadAgentDailyReport,
  saveAgentDailyReport,
  createDefaultAgentDailyReport,
  getTodayDateString,
  type AdminReview,
} from '@/lib/reports/agent-reports';

export async function POST(req: NextRequest) {
  try {
    const ctx = await getCurrentAccount();

    const isAdmin = ctx.role === 'owner' || ctx.role === 'admin';
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Only administrators and owners can review daily reports.' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { agentId, date = getTodayDateString(), status, feedback } = body;

    if (!agentId) {
      return NextResponse.json({ error: 'Missing agentId parameter.' }, { status: 400 });
    }

    if (status !== 'approved' && status !== 'needs_attention') {
      return NextResponse.json(
        { error: 'Status must be approved or needs_attention.' },
        { status: 400 }
      );
    }

    const { data: adminProfile } = await ctx.supabase
      .from('profiles')
      .select('full_name, email')
      .eq('user_id', ctx.userId)
      .maybeSingle();

    const adminName = adminProfile?.full_name || adminProfile?.email?.split('@')[0] || 'Administrator';

    // Target agent profile
    const { data: targetProfile } = await ctx.supabase
      .from('profiles')
      .select('full_name, email, account_role')
      .eq('user_id', agentId)
      .maybeSingle();

    const agentName = targetProfile?.full_name || targetProfile?.email?.split('@')[0] || 'Counselor';

    let report = await loadAgentDailyReport(
      ctx.supabase,
      ctx.accountId,
      agentId,
      date
    );

    if (!report) {
      report = createDefaultAgentDailyReport(
        ctx.accountId,
        agentId,
        agentName,
        targetProfile?.email || '',
        targetProfile?.account_role || 'agent',
        date
      );
    }

    const review: AdminReview = {
      reviewed_by_id: ctx.userId,
      reviewed_by_name: adminName,
      feedback: (feedback || '').trim(),
      status,
      reviewed_at: new Date().toISOString(),
    };

    report.admin_review = review;
    await saveAgentDailyReport(ctx.supabase, ctx.accountId, agentId, report);

    // Notify the agent in-app
    try {
      await ctx.supabase.from('notifications').insert({
        account_id: ctx.accountId,
        user_id: agentId,
        type: 'agent_report_review',
        title: status === 'approved' ? `✅ Daily Report Approved by ${adminName}` : `⚠️ Daily Report Feedback from ${adminName}`,
        body: review.feedback || (status === 'approved' ? 'Your work report for today was approved.' : 'Please check feedback on your daily report.'),
        created_at: new Date().toISOString(),
      });
    } catch (notifErr) {
      console.warn('[review route] Failed to notify agent:', notifErr);
    }

    return NextResponse.json({
      success: true,
      report,
    });
  } catch (err) {
    console.error('[POST /api/reports/agent/review] error:', err);
    return toErrorResponse(err);
  }
}
