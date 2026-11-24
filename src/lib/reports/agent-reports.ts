import type { SupabaseClient } from '@supabase/supabase-js';
import { parseLeadNotes, type LeadNote } from '@/lib/leads/notes';
import { loadEmailConfig } from '@/lib/email/config';
import { sendEmailWithResend } from '@/lib/email/resend';

export interface WorkOfTheDay {
  plan_text: string;
  target_leads_count?: number;
  target_calls_count?: number;
  priorities?: string;
  submitted_at: string;
}

export interface WorkDoneReport {
  summary_text: string;
  accomplishments?: string;
  challenges?: string;
  tomorrow_plan?: string;
  submitted_at: string;
}

export interface AdminReview {
  reviewed_by_id: string;
  reviewed_by_name: string;
  feedback: string;
  status: 'pending' | 'approved' | 'needs_attention';
  reviewed_at: string;
}

export interface DailySystemMetrics {
  notes_added_count: number;
  leads_assigned_count: number;
  leads_contacted_count: number;
  emails_sent_count: number;
  conversions_count: number;
}

export interface AgentDailyReport {
  id: string; // e.g. "__agent_report_${userId}_${date}__"
  account_id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  user_role: string;
  date: string; // "YYYY-MM-DD"

  // Attendance
  clock_in_at: string | null;
  clock_out_at: string | null;
  session_status: 'clocked_in' | 'clocked_out' | 'not_started';
  total_working_minutes: number;
  work_location: 'office' | 'remote' | 'field';

  // Work of the day & Work done
  work_of_the_day: WorkOfTheDay | null;
  work_done_report: WorkDoneReport | null;

  // Admin Feedback & Review
  admin_review: AdminReview | null;

  // Automatically computed system metrics
  system_metrics: DailySystemMetrics;

  created_at: string;
  updated_at: string;
}

export interface AgentNoteItem {
  id: string;
  lead_id: string;
  lead_name: string;
  lead_phone: string;
  course: string;
  college: string;
  campaign_name?: string;
  text: string;
  author_name: string;
  author_type: 'counselor' | 'ai_agent' | 'system';
  created_at: string;
}

export function formatReportFieldName(userId: string, date: string): string {
  return `__agent_report_${userId}_${date}`;
}

export function getTodayDateString(): string {
  // Return YYYY-MM-DD in local time
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function createDefaultAgentDailyReport(
  accountId: string,
  userId: string,
  userName: string,
  userEmail: string,
  userRole: string,
  date: string
): AgentDailyReport {
  return {
    id: formatReportFieldName(userId, date),
    account_id: accountId,
    user_id: userId,
    user_name: userName,
    user_email: userEmail,
    user_role: userRole,
    date,
    clock_in_at: null,
    clock_out_at: null,
    session_status: 'not_started',
    total_working_minutes: 0,
    work_location: 'office',
    work_of_the_day: null,
    work_done_report: null,
    admin_review: null,
    system_metrics: {
      notes_added_count: 0,
      leads_assigned_count: 0,
      leads_contacted_count: 0,
      emails_sent_count: 0,
      conversions_count: 0,
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

/**
 * Loads a single agent's daily report for a given date.
 */
export async function loadAgentDailyReport(
  db: SupabaseClient,
  accountId: string,
  userId: string,
  date: string
): Promise<AgentDailyReport | null> {
  const fieldName = formatReportFieldName(userId, date);
  const { data } = await db
    .from('custom_fields')
    .select('id, field_options, created_at, updated_at')
    .eq('account_id', accountId)
    .eq('field_name', fieldName)
    .maybeSingle();

  if (data?.field_options && typeof data.field_options === 'object') {
    return data.field_options as AgentDailyReport;
  }

  return null;
}

/**
 * Saves or updates an agent's daily report.
 */
export async function saveAgentDailyReport(
  db: SupabaseClient,
  accountId: string,
  userId: string,
  report: AgentDailyReport
): Promise<void> {
  const fieldName = formatReportFieldName(userId, report.date);
  const payload = {
    ...report,
    updated_at: new Date().toISOString(),
  };

  const { data: existing } = await db
    .from('custom_fields')
    .select('id')
    .eq('account_id', accountId)
    .eq('field_name', fieldName)
    .maybeSingle();

  if (existing?.id) {
    const { error: updateErr } = await db
      .from('custom_fields')
      .update({
        field_options: payload,
      })
      .eq('id', existing.id);

    if (updateErr) throw updateErr;
  } else {
    const { error: insertErr } = await db.from('custom_fields').insert({
      account_id: accountId,
      user_id: userId,
      field_name: fieldName,
      field_type: 'json',
      field_options: payload,
    });

    if (insertErr) throw insertErr;
  }
}

/**
 * Loads all agent daily reports for an account for a given date.
 */
export async function loadAllAgentDailyReportsForDate(
  db: SupabaseClient,
  accountId: string,
  date: string
): Promise<AgentDailyReport[]> {
  const pattern = `__agent_report_%_${date}`;
  const { data } = await db
    .from('custom_fields')
    .select('field_options')
    .eq('account_id', accountId)
    .ilike('field_name', pattern);

  if (!data) return [];

  return data
    .map((r) => r.field_options as AgentDailyReport)
    .filter((r) => r && r.date === date);
}

/**
 * Extracts all notes added by a specific agent (or all agents) for a target date.
 */
export async function loadAgentNotesForDate(
  db: SupabaseClient,
  accountId: string,
  targetDate: string, // YYYY-MM-DD
  userId?: string | null,
  userName?: string | null
): Promise<AgentNoteItem[]> {
  const { data: leads } = await db
    .from('meta_lead_logs')
    .select('id, full_name, phone, course, college, campaign_name, assigned_to, notes, created_at, updated_at')
    .eq('account_id', accountId)
    .not('notes', 'is', null);

  if (!leads || leads.length === 0) return [];

  const noteItems: AgentNoteItem[] = [];

  for (const lead of leads) {
    const parsed = parseLeadNotes(lead.notes);
    for (const note of parsed) {
      if (!note.created_at) continue;

      // Match target date (YYYY-MM-DD)
      const noteDate = note.created_at.slice(0, 10);
      if (noteDate !== targetDate) continue;

      // Filter by agent if specified
      if (userId) {
        const isAssigned = lead.assigned_to === userId;
        const isAuthorName =
          userName &&
          note.author_name &&
          (note.author_name.toLowerCase().includes(userName.toLowerCase()) ||
            userName.toLowerCase().includes(note.author_name.toLowerCase()));
        const isGenericCounselorOnAssigned =
          isAssigned && note.author_type === 'counselor';

        if (!isAssigned && !isAuthorName && !isGenericCounselorOnAssigned) {
          continue;
        }
      }

      noteItems.push({
        id: note.id,
        lead_id: lead.id,
        lead_name: lead.full_name,
        lead_phone: lead.phone,
        course: lead.course || 'Admissions',
        college: lead.college || 'Institution',
        campaign_name: lead.campaign_name || undefined,
        text: note.text,
        author_name: note.author_name || 'Counselor',
        author_type: (note.author_type as any) || 'counselor',
        created_at: note.created_at,
      });
    }
  }

  // Sort descending by created_at
  return noteItems.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

/**
 * Computes CRM activity metrics for a specific agent for a target date.
 */
export async function computeAgentSystemMetrics(
  db: SupabaseClient,
  accountId: string,
  userId: string,
  userName: string,
  targetDate: string
): Promise<DailySystemMetrics> {
  const notes = await loadAgentNotesForDate(db, accountId, targetDate, userId, userName);

  // Leads assigned to this agent
  const { data: assignedLeads } = await db
    .from('meta_lead_logs')
    .select('id, lead_status, raw_data, created_at, updated_at')
    .eq('account_id', accountId)
    .eq('assigned_to', userId);

  const leadsAssigned = assignedLeads?.length || 0;
  let emailsSent = 0;
  let conversions = 0;
  let leadsContacted = 0;

  for (const l of assignedLeads || []) {
    if (l.lead_status === 'converted' || l.lead_status === 'admission_confirmed') {
      conversions++;
    }
    if (l.lead_status && l.lead_status !== 'new') {
      leadsContacted++;
    }
    if (l.raw_data && typeof l.raw_data === 'object') {
      const emailDelivery = (l.raw_data as Record<string, any>).email_delivery;
      if (emailDelivery?.sent_at && emailDelivery.sent_at.slice(0, 10) === targetDate) {
        emailsSent++;
      }
    }
  }

  return {
    notes_added_count: notes.length,
    leads_assigned_count: leadsAssigned,
    leads_contacted_count: leadsContacted,
    emails_sent_count: emailsSent,
    conversions_count: conversions,
  };
}

/**
 * Dispatches an in-app notification to all admins/owners for an account.
 */
export async function notifyAdminsOfAgentReport(
  db: SupabaseClient,
  accountId: string,
  agentName: string,
  reportType: 'clock_in' | 'clock_out' | 'work_of_the_day' | 'work_done_report',
  summaryText: string
): Promise<void> {
  try {
    // Find all owners and admins for this account
    const { data: admins } = await db
      .from('profiles')
      .select('user_id')
      .eq('account_id', accountId)
      .in('account_role', ['owner', 'admin']);

    if (!admins || admins.length === 0) return;

    let title = '';
    let body = '';

    if (reportType === 'clock_in') {
      title = `🟢 ${agentName} Clocked In`;
      body = `${agentName} clocked in for the day at ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}.`;
    } else if (reportType === 'clock_out') {
      title = `🔴 ${agentName} Clocked Out`;
      body = `${agentName} ended their shift: ${summaryText}`;
    } else if (reportType === 'work_of_the_day') {
      title = `📝 Work of the Day from ${agentName}`;
      body = `${agentName} submitted today's plan: "${summaryText.slice(0, 120)}..."`;
    } else if (reportType === 'work_done_report') {
      title = `📋 EOD Work Report from ${agentName}`;
      body = `${agentName} submitted their daily accomplishments: "${summaryText.slice(0, 120)}..."`;
    }

    const notifications = admins.map((a) => ({
      account_id: accountId,
      user_id: a.user_id,
      type: 'agent_report_update',
      title,
      body,
      created_at: new Date().toISOString(),
    }));

    await db.from('notifications').insert(notifications);
  } catch (err) {
    console.warn('[notifyAdminsOfAgentReport] Notification error:', err);
  }
}

export interface DailyAttendanceRecord {
  id: string; // `${userId}_${date}`
  date: string; // YYYY-MM-DD
  user_id: string;
  user_name: string;
  user_email: string;
  user_role: string;
  status: 'present_active' | 'present_completed' | 'absent' | 'on_leave' | 'field_work';
  clock_in_at: string | null;
  clock_out_at: string | null;
  total_working_minutes: number;
  work_location: 'office' | 'remote' | 'field';
  has_work_of_the_day: boolean;
  work_of_the_day_preview?: string;
  has_work_done_report: boolean;
  work_done_preview?: string;
  notes_count: number;
  admin_status: 'pending' | 'approved' | 'needs_attention';
  admin_feedback?: string;
}

export interface AttendanceSummaryMetrics {
  totalWorkMinutes: number;
  averageMinutesPerPresentDay: number;
  totalPresentDays: number;
  totalAbsentDays: number;
  totalShiftsCompleted: number;
  overallAttendanceRate: number; // 0 - 100
  totalNotesLogged: number;
}

/**
 * Returns an array of YYYY-MM-DD date strings between startDate and endDate (inclusive, sorted descending).
 */
export function getDateRangeList(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
    return [endDate];
  }

  const curr = new Date(start);
  while (curr <= end) {
    const y = curr.getFullYear();
    const m = String(curr.getMonth() + 1).padStart(2, '0');
    const d = String(curr.getDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${d}`);
    curr.setDate(curr.getDate() + 1);
  }
  return dates.reverse();
}

/**
 * Loads all agent daily reports across a date range.
 */
export async function loadAttendanceHistory(
  db: SupabaseClient,
  accountId: string,
  startDate?: string,
  endDate?: string,
  userId?: string
): Promise<AgentDailyReport[]> {
  const pattern = userId ? `__agent_report_${userId}_%` : '__agent_report_%';
  const { data } = await db
    .from('custom_fields')
    .select('field_options')
    .eq('account_id', accountId)
    .ilike('field_name', pattern);

  if (!data) return [];

  let reports = data
    .map((r) => r.field_options as AgentDailyReport)
    .filter((r) => r && r.date);

  if (userId) {
    reports = reports.filter((r) => r.user_id === userId);
  }
  if (startDate) {
    reports = reports.filter((r) => r.date >= startDate);
  }
  if (endDate) {
    reports = reports.filter((r) => r.date <= endDate);
  }

  return reports.sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Assembles a comprehensive day-by-day attendance register for every team member across the selected dates.
 */
export function buildDailyAttendanceRegister(
  teamMembers: Array<{ userId: string; fullName: string; email: string; role: string }>,
  reports: AgentDailyReport[],
  dateList: string[],
  notesCountMap?: Record<string, number>
): { records: DailyAttendanceRecord[]; summary: AttendanceSummaryMetrics } {
  const reportsMap = new Map<string, AgentDailyReport>();
  for (const r of reports) {
    reportsMap.set(`${r.user_id}_${r.date}`, r);
  }

  const todayStr = getTodayDateString();
  const records: DailyAttendanceRecord[] = [];

  let totalWorkMinutes = 0;
  let totalPresentDays = 0;
  let totalAbsentDays = 0;
  let totalShiftsCompleted = 0;
  let totalNotesLogged = 0;

  for (const date of dateList) {
    const isFuture = date > todayStr;
    const isTodayDate = date === todayStr;

    for (const member of teamMembers) {
      const key = `${member.userId}_${date}`;
      const report = reportsMap.get(key);
      const notesCount = notesCountMap?.[key] || report?.system_metrics?.notes_added_count || 0;
      totalNotesLogged += notesCount;

      if (report && (report.clock_in_at || report.clock_out_at || report.work_of_the_day || report.work_done_report)) {
        let status: DailyAttendanceRecord['status'] = 'present_completed';
        if (report.session_status === 'clocked_in') {
          status = 'present_active';
        } else if (report.work_location === 'field') {
          status = 'field_work';
        }

        const duration = report.total_working_minutes || 0;
        totalWorkMinutes += duration;
        totalPresentDays++;
        if (report.session_status === 'clocked_out') {
          totalShiftsCompleted++;
        }

        records.push({
          id: key,
          date,
          user_id: member.userId,
          user_name: member.fullName,
          user_email: member.email,
          user_role: member.role,
          status,
          clock_in_at: report.clock_in_at,
          clock_out_at: report.clock_out_at,
          total_working_minutes: duration,
          work_location: report.work_location || 'office',
          has_work_of_the_day: Boolean(report.work_of_the_day),
          work_of_the_day_preview: report.work_of_the_day?.plan_text,
          has_work_done_report: Boolean(report.work_done_report),
          work_done_preview: report.work_done_report?.summary_text,
          notes_count: notesCount,
          admin_status: report.admin_review?.status || 'pending',
          admin_feedback: report.admin_review?.feedback,
        });
      } else {
        // Not clocked in
        const isAbsent = !isFuture && !isTodayDate;
        if (isAbsent) totalAbsentDays++;

        records.push({
          id: key,
          date,
          user_id: member.userId,
          user_name: member.fullName,
          user_email: member.email,
          user_role: member.role,
          status: isAbsent ? 'absent' : 'on_leave',
          clock_in_at: null,
          clock_out_at: null,
          total_working_minutes: 0,
          work_location: 'office',
          has_work_of_the_day: false,
          has_work_done_report: false,
          notes_count: notesCount,
          admin_status: 'pending',
        });
      }
    }
  }

  const totalPossibleDays = totalPresentDays + totalAbsentDays;
  const overallAttendanceRate = totalPossibleDays > 0
    ? Math.round((totalPresentDays / totalPossibleDays) * 100)
    : 100;

  const averageMinutesPerPresentDay = totalPresentDays > 0
    ? Math.round(totalWorkMinutes / totalPresentDays)
    : 0;

  return {
    records,
    summary: {
      totalWorkMinutes,
      averageMinutesPerPresentDay,
      totalPresentDays,
      totalAbsentDays,
      totalShiftsCompleted,
      overallAttendanceRate,
      totalNotesLogged,
    },
  };
}

/**
 * Generates CSV string for attendance export.
 */
export function generateAttendanceCsv(records: DailyAttendanceRecord[]): string {
  const headers = [
    'Date',
    'Agent Name',
    'Email',
    'Role',
    'Status',
    'Clock In',
    'Clock Out',
    'Duration (Hours)',
    'Duration (Minutes)',
    'Work Location',
    'Morning Plan Submitted',
    'EOD Report Submitted',
    'Notes Count',
    'Admin Review',
  ];

  const rows = records.map((r) => [
    `"${r.date}"`,
    `"${r.user_name.replace(/"/g, '""')}"`,
    `"${r.user_email}"`,
    `"${r.user_role}"`,
    `"${r.status}"`,
    `"${r.clock_in_at ? new Date(r.clock_in_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : '—'}"`,
    `"${r.clock_out_at ? new Date(r.clock_out_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : '—'}"`,
    `"${(r.total_working_minutes / 60).toFixed(1)}"`,
    `"${r.total_working_minutes}"`,
    `"${r.work_location}"`,
    `"${r.has_work_of_the_day ? 'Yes' : 'No'}"`,
    `"${r.has_work_done_report ? 'Yes' : 'No'}"`,
    `"${r.notes_count}"`,
    `"${r.admin_status}"`,
  ]);

  return [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
}

/**
 * Renders an HTML email summarizing today's attendance for the admin.
 */
export function renderDailyAttendanceDigestHtml(
  date: string,
  records: DailyAttendanceRecord[],
  accountName = 'GEMS Education'
): { subject: string; html: string; text: string } {
  const presentCount = records.filter((r) => r.status.startsWith('present') || r.status === 'field_work').length;
  const totalCount = records.length;
  const totalMinutes = records.reduce((acc, r) => acc + (r.total_working_minutes || 0), 0);
  const totalHours = Math.floor(totalMinutes / 60);
  const remainingMins = totalMinutes % 60;
  const totalNotes = records.reduce((acc, r) => acc + (r.notes_count || 0), 0);

  const subject = `Daily Attendance & Work Summary — ${date} (${accountName})`;

  const tableRows = records
    .map((r) => {
      const statusLabel =
        r.status === 'present_active'
          ? '<span style="color: #16a34a; font-weight: 600;">🟢 Active (Clocked In)</span>'
          : r.status === 'present_completed'
          ? '<span style="color: #0284c7; font-weight: 600;">Shift Ended</span>'
          : r.status === 'field_work'
          ? '<span style="color: #d97706; font-weight: 600;">🚗 Field Work</span>'
          : '<span style="color: #dc2626; font-weight: 600;">🔴 Absent / Not Started</span>';

      const clockIn = r.clock_in_at
        ? new Date(r.clock_in_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
        : '—';
      const clockOut = r.clock_out_at
        ? new Date(r.clock_out_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
        : '—';
      const duration = r.total_working_minutes
        ? `${Math.floor(r.total_working_minutes / 60)}h ${r.total_working_minutes % 60}m`
        : '0m';

      return `
        <tr style="border-bottom: 1px solid #e2e8f0; font-size: 13px;">
          <td style="padding: 10px 12px; font-weight: 600; color: #1e293b;">${r.user_name}</td>
          <td style="padding: 10px 12px;">${statusLabel}</td>
          <td style="padding: 10px 12px; color: #334155;">${clockIn}</td>
          <td style="padding: 10px 12px; color: #334155;">${clockOut}</td>
          <td style="padding: 10px 12px; font-weight: 600; color: #0f172a;">${duration}</td>
          <td style="padding: 10px 12px; text-transform: capitalize;">${r.work_location}</td>
          <td style="padding: 10px 12px; text-align: center;">${r.has_work_of_the_day ? '✅' : '❌'}</td>
          <td style="padding: 10px 12px; text-align: center;">${r.has_work_done_report ? '✅' : '❌'}</td>
          <td style="padding: 10px 12px; font-weight: 600; text-align: center; color: #2563eb;">${r.notes_count}</td>
        </tr>
      `;
    })
    .join('');

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px;">
  <div style="max-width: 750px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
    <div style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); color: #ffffff; padding: 24px;">
      <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; color: #94a3b8; margin-bottom: 4px;">Admin Attendance Digest</div>
      <h1 style="margin: 0; font-size: 22px; font-weight: 700;">Daily Agent Attendance & Work Report</h1>
      <p style="margin: 6px 0 0 0; font-size: 14px; color: #cbd5e1;">Date: <strong>${date}</strong> • Organization: <strong>${accountName}</strong></p>
    </div>

    <div style="padding: 20px 24px; background: #f1f5f9; border-bottom: 1px solid #e2e8f0; display: flex; gap: 16px;">
      <div style="flex: 1; background: #ffffff; padding: 12px 16px; border-radius: 8px; border: 1px solid #e2e8f0;">
        <div style="font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 600;">Present Today</div>
        <div style="font-size: 20px; font-weight: 700; color: #16a34a; margin-top: 2px;">${presentCount} / ${totalCount}</div>
      </div>
      <div style="flex: 1; background: #ffffff; padding: 12px 16px; border-radius: 8px; border: 1px solid #e2e8f0;">
        <div style="font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 600;">Total Team Hours</div>
        <div style="font-size: 20px; font-weight: 700; color: #0f172a; margin-top: 2px;">${totalHours}h ${remainingMins}m</div>
      </div>
      <div style="flex: 1; background: #ffffff; padding: 12px 16px; border-radius: 8px; border: 1px solid #e2e8f0;">
        <div style="font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 600;">Notes Logged</div>
        <div style="font-size: 20px; font-weight: 700; color: #2563eb; margin-top: 2px;">${totalNotes}</div>
      </div>
    </div>

    <div style="padding: 24px; overflow-x: auto;">
      <table style="width: 100%; border-collapse: collapse; text-align: left;">
        <thead>
          <tr style="background: #f8fafc; font-size: 11px; text-transform: uppercase; color: #64748b; border-bottom: 2px solid #e2e8f0;">
            <th style="padding: 10px 12px;">Agent</th>
            <th style="padding: 10px 12px;">Status</th>
            <th style="padding: 10px 12px;">Login</th>
            <th style="padding: 10px 12px;">Logout</th>
            <th style="padding: 10px 12px;">Duration</th>
            <th style="padding: 10px 12px;">Location</th>
            <th style="padding: 10px 12px; text-align: center;">Day Plan</th>
            <th style="padding: 10px 12px; text-align: center;">EOD</th>
            <th style="padding: 10px 12px; text-align: center;">Notes</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
    </div>

    <div style="padding: 16px 24px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; text-align: center;">
      Generated automatically by GEMS WhatsApp CRM • <a href="https://whatsapp-crm-beta-seven.vercel.app/reports" style="color: #2563eb; text-decoration: none; font-weight: 600;">Open Live Reports Dashboard</a>
    </div>
  </div>
</body>
</html>`;

  const text = `DAILY AGENT ATTENDANCE REPORT — ${date}\nOrganization: ${accountName}\n\nPresent: ${presentCount}/${totalCount}\nTotal Hours: ${totalHours}h ${remainingMins}m\nNotes Logged Today: ${totalNotes}\n\nLive Dashboard: https://whatsapp-crm-beta-seven.vercel.app/reports`;

  return { subject, html, text };
}

/**
 * Dispatches today's attendance summary email to the admin.
 */
export async function sendDailyAttendanceDigestToAdmin(
  db: SupabaseClient,
  accountId: string,
  date: string,
  targetAdminEmail?: string
): Promise<{ success: boolean; error?: string; recipient?: string }> {
  const emailConfig = await loadEmailConfig(db, accountId);
  if (!emailConfig?.apiKey) {
    return { success: false, error: 'Email service (Resend) is not configured with an API key.' };
  }

  let adminEmail = targetAdminEmail || '';
  if (!adminEmail) {
    const { data: adminProfile } = await db
      .from('profiles')
      .select('email')
      .eq('account_id', accountId)
      .in('account_role', ['owner', 'admin'])
      .not('email', 'is', null)
      .limit(1)
      .maybeSingle();

    adminEmail = adminProfile?.email || 'gemsgroupservices.ir@gmail.com';
  }

  // Load roster
  const { data: teamProfiles } = await db
    .from('profiles')
    .select('user_id, full_name, email, account_role')
    .eq('account_id', accountId)
    .order('full_name', { ascending: true });

  const teamMembers = (teamProfiles || []).map((p) => ({
    userId: p.user_id,
    fullName: p.full_name || p.email?.split('@')[0] || 'Counselor',
    email: p.email || '',
    role: p.account_role,
  }));

  const reports = await loadAllAgentDailyReportsForDate(db, accountId, date);
  const notes = await loadAgentNotesForDate(db, accountId, date);

  const notesCountMap: Record<string, number> = {};
  for (const n of notes) {
    const key = `${n.author_name}_${date}`;
    notesCountMap[key] = (notesCountMap[key] || 0) + 1;
  }

  const { records } = buildDailyAttendanceRegister(teamMembers, reports, [date], notesCountMap);
  const { subject, html, text } = renderDailyAttendanceDigestHtml(date, records);

  const res = await sendEmailWithResend({
    apiKey: emailConfig.apiKey,
    from: emailConfig.fromEmail,
    to: adminEmail,
    subject,
    html,
    text,
  });

  return {
    success: res.success,
    error: res.error,
    recipient: adminEmail,
  };
}
