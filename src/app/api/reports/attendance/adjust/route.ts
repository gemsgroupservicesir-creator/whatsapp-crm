import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';
import {
  loadAgentDailyReport,
  saveAgentDailyReport,
  createDefaultAgentDailyReport,
} from '@/lib/reports/agent-reports';

export async function POST(req: NextRequest) {
  try {
    const ctx = await getCurrentAccount();

    const isAdmin = ctx.role === 'owner' || ctx.role === 'admin';
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Only administrators can adjust agent attendance.' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const {
      agentId,
      date,
      action = 'mark_present',
      clockInAt,
      clockOutAt,
      location = 'office',
      note = '',
    } = body;

    if (!agentId || !date) {
      return NextResponse.json(
        { error: 'agentId and date are required.' },
        { status: 400 }
      );
    }

    const { data: adminProfile } = await ctx.supabase
      .from('profiles')
      .select('full_name, email')
      .eq('user_id', ctx.userId)
      .maybeSingle();

    const adminName = adminProfile?.full_name || 'Admin';

    const { data: targetProfile } = await ctx.supabase
      .from('profiles')
      .select('full_name, email, account_role')
      .eq('user_id', agentId)
      .maybeSingle();

    const agentName = targetProfile?.full_name || 'Counselor';

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

    if (action === 'mark_leave') {
      report.clock_in_at = null;
      report.clock_out_at = null;
      report.session_status = 'not_started';
      report.total_working_minutes = 0;
    } else {
      // mark_present or adjust_times
      const effectiveClockIn = clockInAt || report.clock_in_at || new Date(`${date}T09:30:00.000Z`).toISOString();
      const effectiveClockOut = clockOutAt || report.clock_out_at || new Date(`${date}T18:30:00.000Z`).toISOString();

      report.clock_in_at = effectiveClockIn;
      report.clock_out_at = effectiveClockOut;
      report.session_status = 'clocked_out';
      report.work_location = location as any;

      const startMs = new Date(effectiveClockIn).getTime();
      const endMs = new Date(effectiveClockOut).getTime();
      report.total_working_minutes = Math.max(0, Math.round((endMs - startMs) / (1000 * 60)));
    }

    // Attach review note explaining manual adjustment
    report.admin_review = {
      reviewed_by_id: ctx.userId,
      reviewed_by_name: adminName,
      feedback: note ? `Manual Attendance Adjustment: ${note}` : 'Attendance adjusted by Administrator.',
      status: 'approved',
      reviewed_at: new Date().toISOString(),
    };

    await saveAgentDailyReport(ctx.supabase, ctx.accountId, agentId, report);

    // Notify agent
    try {
      await ctx.supabase.from('notifications').insert({
        account_id: ctx.accountId,
        user_id: agentId,
        type: 'attendance_adjusted',
        title: `Attendance Record Updated for ${date}`,
        body: note || `Administrator ${adminName} updated your attendance record for ${date}.`,
        created_at: new Date().toISOString(),
      });
    } catch {
      // ignore
    }

    return NextResponse.json({
      success: true,
      report,
    });
  } catch (err) {
    console.error('[POST /api/reports/attendance/adjust] error:', err);
    return toErrorResponse(err);
  }
}
