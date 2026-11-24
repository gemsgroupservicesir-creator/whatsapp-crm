import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';
import {
  loadAgentDailyReport,
  saveAgentDailyReport,
  createDefaultAgentDailyReport,
  notifyAdminsOfAgentReport,
  getTodayDateString,
  type WorkOfTheDay,
  type WorkDoneReport,
} from '@/lib/reports/agent-reports';

export async function POST(req: NextRequest) {
  try {
    const ctx = await getCurrentAccount();
    const body = await req.json();

    const { type, date = getTodayDateString() } = body;

    if (type !== 'work_of_the_day' && type !== 'work_done_report') {
      return NextResponse.json(
        { error: 'Invalid report type. Must be work_of_the_day or work_done_report.' },
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

    if (type === 'work_of_the_day') {
      const planText = (body.plan_text || '').trim();
      if (!planText) {
        return NextResponse.json(
          { error: 'Please enter your work of the day plan.' },
          { status: 400 }
        );
      }

      const workOfTheDay: WorkOfTheDay = {
        plan_text: planText,
        target_leads_count: Number(body.target_leads_count) || undefined,
        target_calls_count: Number(body.target_calls_count) || undefined,
        priorities: (body.priorities || '').trim() || undefined,
        submitted_at: nowIso,
      };

      report.work_of_the_day = workOfTheDay;
      await saveAgentDailyReport(ctx.supabase, ctx.accountId, ctx.userId, report);

      await notifyAdminsOfAgentReport(
        ctx.supabase,
        ctx.accountId,
        agentName,
        'work_of_the_day',
        planText
      );
    } else {
      // type === 'work_done_report'
      const summaryText = (body.summary_text || '').trim();
      if (!summaryText) {
        return NextResponse.json(
          { error: 'Please enter your work done summary.' },
          { status: 400 }
        );
      }

      const workDoneReport: WorkDoneReport = {
        summary_text: summaryText,
        accomplishments: (body.accomplishments || '').trim() || undefined,
        challenges: (body.challenges || '').trim() || undefined,
        tomorrow_plan: (body.tomorrow_plan || '').trim() || undefined,
        submitted_at: nowIso,
      };

      report.work_done_report = workDoneReport;
      await saveAgentDailyReport(ctx.supabase, ctx.accountId, ctx.userId, report);

      await notifyAdminsOfAgentReport(
        ctx.supabase,
        ctx.accountId,
        agentName,
        'work_done_report',
        summaryText
      );
    }

    return NextResponse.json({
      success: true,
      report,
    });
  } catch (err) {
    console.error('[POST /api/reports/agent/work] error:', err);
    return toErrorResponse(err);
  }
}
