import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';
import {
  loadAttendanceHistory,
  buildDailyAttendanceRegister,
  getDateRangeList,
  getTodayDateString,
  loadAgentNotesForDate,
} from '@/lib/reports/agent-reports';

export async function GET(req: NextRequest) {
  try {
    const ctx = await getCurrentAccount();
    const { searchParams } = new URL(req.url);

    const today = getTodayDateString();
    const endDate = searchParams.get('endDate') || today;

    // Default to last 7 days if startDate is not provided
    let startDate = searchParams.get('startDate');
    if (!startDate) {
      const d = new Date(endDate);
      d.setDate(d.getDate() - 6);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      startDate = `${y}-${m}-${day}`;
    }

    const requestedAgentId = searchParams.get('agentId') || 'all';
    const isAdmin = ctx.role === 'owner' || ctx.role === 'admin';

    // Roster query
    const { data: rawMembers } = await ctx.supabase
      .from('profiles')
      .select('user_id, full_name, email, avatar_url, account_role')
      .eq('account_id', ctx.accountId)
      .order('full_name', { ascending: true });

    const allTeamMembers = (rawMembers || []).map((m) => ({
      userId: m.user_id,
      fullName: m.full_name || m.email?.split('@')[0] || 'Member',
      email: m.email || '',
      avatarUrl: m.avatar_url || null,
      role: m.account_role,
    }));

    // Scope check: non-admins can only see their own attendance
    let filterAgentId = requestedAgentId;
    if (!isAdmin) {
      filterAgentId = ctx.userId;
    }

    const filteredMembers =
      filterAgentId !== 'all'
        ? allTeamMembers.filter((m) => m.userId === filterAgentId)
        : allTeamMembers;

    const dateList = getDateRangeList(startDate, endDate);

    // Fetch reports across date range
    const reports = await loadAttendanceHistory(
      ctx.supabase,
      ctx.accountId,
      startDate,
      endDate,
      filterAgentId !== 'all' ? filterAgentId : undefined
    );

    // Fetch notes across date range for accurate count
    const { data: rawLeads } = await ctx.supabase
      .from('meta_lead_logs')
      .select('assigned_to, notes, created_at')
      .eq('account_id', ctx.accountId)
      .not('notes', 'is', null);

    const notesCountMap: Record<string, number> = {};
    for (const lead of rawLeads || []) {
      if (!lead.notes) continue;
      try {
        const parsed = typeof lead.notes === 'string' ? JSON.parse(lead.notes) : lead.notes;
        if (Array.isArray(parsed)) {
          for (const note of parsed) {
            if (note.created_at) {
              const dateStr = note.created_at.slice(0, 10);
              if (dateStr >= startDate && dateStr <= endDate) {
                if (lead.assigned_to) {
                  const key = `${lead.assigned_to}_${dateStr}`;
                  notesCountMap[key] = (notesCountMap[key] || 0) + 1;
                }
              }
            }
          }
        }
      } catch {
        // ignore JSON parse error
      }
    }

    const { records, summary } = buildDailyAttendanceRegister(
      filteredMembers,
      reports,
      dateList,
      notesCountMap
    );

    return NextResponse.json({
      caller: {
        userId: ctx.userId,
        role: ctx.role,
        isAdmin,
      },
      dateRange: {
        startDate,
        endDate,
      },
      selectedAgentId: filterAgentId,
      teamMembers: allTeamMembers,
      records,
      summary,
    });
  } catch (err) {
    console.error('[GET /api/reports/attendance] error:', err);
    return toErrorResponse(err);
  }
}
