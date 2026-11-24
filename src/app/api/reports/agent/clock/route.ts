import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';
import {
  loadAgentDailyReport,
  saveAgentDailyReport,
  createDefaultAgentDailyReport,
  notifyAdminsOfAgentReport,
  getTodayDateString,
} from '@/lib/reports/agent-reports';

export async function POST(req: NextRequest) {
  try {
    const ctx = await getCurrentAccount();
    const body = await req.json();

    const { action, location = 'office', date = getTodayDateString() } = body;

    if (action !== 'clock_in' && action !== 'clock_out') {
      return NextResponse.json(
        { error: 'Invalid action. Must be clock_in or clock_out.' },
        { status: 400 }
      );
    }

    const { data: profile } = await ctx.supabase
      .from('profiles')
      .select('full_name, email, account_role')
      .eq('user_id', ctx.userId)
      .maybeSingle();

    const agentName = profile?.full_name || profile?.email?.split('@')[0] || 'Counselor';

    let report = await loadAgentDailyReport(
      ctx.supabase,
      ctx.accountId,
      ctx.userId,
      date
    );

    if (!report) {
      report = createDefaultAgentDailyReport(
        ctx.accountId,
        ctx.userId,
        agentName,
        profile?.email || '',
        profile?.account_role || ctx.role,
        date
      );
    }

    const nowIso = new Date().toISOString();

    if (action === 'clock_in') {
      report.clock_in_at = nowIso;
      report.session_status = 'clocked_in';
      report.work_location = location as any;

      await saveAgentDailyReport(ctx.supabase, ctx.accountId, ctx.userId, report);

      await notifyAdminsOfAgentReport(
        ctx.supabase,
        ctx.accountId,
        agentName,
        'clock_in',
        `Clocked in at ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} (${location})`
      );
    } else {
      // Clock out
      report.clock_out_at = nowIso;
      report.session_status = 'clocked_out';

      if (report.clock_in_at) {
        const startMs = new Date(report.clock_in_at).getTime();
        const endMs = new Date(nowIso).getTime();
        const durationMinutes = Math.max(0, Math.round((endMs - startMs) / (1000 * 60)));
        report.total_working_minutes = durationMinutes;
      }

      await saveAgentDailyReport(ctx.supabase, ctx.accountId, ctx.userId, report);

      const hours = Math.floor(report.total_working_minutes / 60);
      const mins = report.total_working_minutes % 60;
      const durationStr = `${hours}h ${mins}m`;

      await notifyAdminsOfAgentReport(
        ctx.supabase,
        ctx.accountId,
        agentName,
        'clock_out',
        `Worked ${durationStr} today (${report.work_location})`
      );
    }

    return NextResponse.json({
      success: true,
      report,
    });
  } catch (err) {
    console.error('[POST /api/reports/agent/clock] error:', err);
    return toErrorResponse(err);
  }
}
