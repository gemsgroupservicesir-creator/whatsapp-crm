import type { SupabaseClient } from '@supabase/supabase-js';
import { parseLeadNotes, type LeadNote } from '@/lib/leads/notes';

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
