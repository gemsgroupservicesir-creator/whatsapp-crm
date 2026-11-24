import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';
import {
  loadAgentDailyReport,
  loadAllAgentDailyReportsForDate,
  loadAgentNotesForDate,
  computeAgentSystemMetrics,
  createDefaultAgentDailyReport,
  getTodayDateString,
  type AgentDailyReport,
} from '@/lib/reports/agent-reports';

export async function GET(req: NextRequest) {
  try {
    const ctx = await getCurrentAccount();
    const { searchParams } = new URL(req.url);

    const dateParam = searchParams.get('date') || getTodayDateString();
    const requestedAgentId = searchParams.get('agentId');

    const isAdmin = ctx.role === 'owner' || ctx.role === 'admin';

    // Fetch caller profile
    const { data: callerProfile } = await ctx.supabase
      .from('profiles')
      .select('user_id, full_name, email, avatar_url, account_role')
      .eq('user_id', ctx.userId)
      .maybeSingle();

    const callerName = callerProfile?.full_name || callerProfile?.email?.split('@')[0] || 'Counselor';

    // Fetch all account members for roster/selection
    const { data: rawMembers } = await ctx.supabase
      .from('profiles')
      .select('user_id, full_name, email, avatar_url, account_role')
      .eq('account_id', ctx.accountId)
      .order('full_name', { ascending: true });

    const teamMembers = (rawMembers || []).map((m) => ({
      userId: m.user_id,
      fullName: m.full_name || m.email?.split('@')[0] || 'Member',
      email: m.email || '',
      avatarUrl: m.avatar_url || null,
      role: m.account_role,
    }));

    // If not admin, restrict to caller's own report
    let targetAgentId = requestedAgentId;
    if (!isAdmin) {
      targetAgentId = ctx.userId;
    } else if (!targetAgentId) {
      // Default admin view to 'all' or first agent
      targetAgentId = 'all';
    }

    if (targetAgentId === 'all') {
      // Load all daily reports for date
      const allReportsList = await loadAllAgentDailyReportsForDate(
        ctx.supabase,
        ctx.accountId,
        dateParam
      );
      const allReportsMap: Record<string, AgentDailyReport> = {};
      for (const rep of allReportsList) {
        allReportsMap[rep.user_id] = rep;
      }

      // Load all notes across agents for this date
      const allNotes = await loadAgentNotesForDate(
        ctx.supabase,
        ctx.accountId,
        dateParam
      );

      // Caller's own report for personal clock in/out header bar
      let callerReport = await loadAgentDailyReport(
        ctx.supabase,
        ctx.accountId,
        ctx.userId,
        dateParam
      );
      if (!callerReport) {
        callerReport = createDefaultAgentDailyReport(
          ctx.accountId,
          ctx.userId,
          callerName,
          callerProfile?.email || '',
          ctx.role,
          dateParam
        );
      }

      return NextResponse.json({
        caller: {
          userId: ctx.userId,
          name: callerName,
          email: callerProfile?.email || '',
          role: ctx.role,
          isAdmin,
        },
        date: dateParam,
        targetAgentId: 'all',
        teamMembers,
        callerReport,
        allReports: allReportsMap,
        notes: allNotes,
      });
    }

    // Single agent report
    const targetMember = teamMembers.find((m) => m.userId === targetAgentId) || {
      userId: targetAgentId,
      fullName: callerName,
      email: callerProfile?.email || '',
      role: 'agent',
    };

    let report = await loadAgentDailyReport(
      ctx.supabase,
      ctx.accountId,
      targetAgentId,
      dateParam
    );

    if (!report) {
      report = createDefaultAgentDailyReport(
        ctx.accountId,
        targetAgentId,
        targetMember.fullName,
        targetMember.email,
        targetMember.role,
        dateParam
      );
    }

    // Dynamically compute system metrics
    const metrics = await computeAgentSystemMetrics(
      ctx.supabase,
      ctx.accountId,
      targetAgentId,
      targetMember.fullName,
      dateParam
    );
    report.system_metrics = metrics;

    // Load notes added by this agent on this date
    const notes = await loadAgentNotesForDate(
      ctx.supabase,
      ctx.accountId,
      dateParam,
      targetAgentId,
      targetMember.fullName
    );

    // Also get caller report for quick clock in/out if caller is an agent
    let callerReport = report;
    if (ctx.userId !== targetAgentId) {
      callerReport =
        (await loadAgentDailyReport(
          ctx.supabase,
          ctx.accountId,
          ctx.userId,
          dateParam
        )) ||
        createDefaultAgentDailyReport(
          ctx.accountId,
          ctx.userId,
          callerName,
          callerProfile?.email || '',
          ctx.role,
          dateParam
        );
    }

    return NextResponse.json({
      caller: {
        userId: ctx.userId,
        name: callerName,
        email: callerProfile?.email || '',
        role: ctx.role,
        isAdmin,
      },
      date: dateParam,
      targetAgentId,
      targetMember,
      teamMembers,
      report,
      callerReport,
      notes,
      metrics,
    });
  } catch (err) {
    console.error('[GET /api/reports/agent] error:', err);
    return toErrorResponse(err);
  }
}
