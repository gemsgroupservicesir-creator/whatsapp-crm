import type { SupabaseClient } from '@supabase/supabase-js';
import { parseLeadNotes, type LeadNote } from '@/lib/leads/notes';
import { loadAiConfig } from '@/lib/ai/config';
import { generateReply } from '@/lib/ai/generate';
import { getWorkspaceWhatsAppPhone } from '@/lib/whatsapp/wa-phone';

export type TaskPriority = 'urgent' | 'high' | 'medium' | 'low';
export type TaskCategory =
  | 'new_lead_outreach'
  | 'callback'
  | 'document_collection'
  | 'fee_consultation'
  | 'follow_up'
  | 'general';
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'skipped';

export interface AgentDailyTask {
  id: string; // e.g. "task_..."
  user_id: string;
  agent_name: string;
  date: string; // YYYY-MM-DD
  title: string;
  description: string;
  priority: TaskPriority;
  category: TaskCategory;
  lead_id?: string;
  lead_name?: string;
  lead_phone?: string;
  course?: string;
  college?: string;
  status: TaskStatus;
  completed_at?: string;
  due_time?: string;
  ai_rationale?: string;
  wa_link?: string;
  created_at: string;
  updated_at: string;
}

export interface AgentDailyTaskPlan {
  id: string; // "__agent_tasks_${userId}_${date}"
  user_id: string;
  agent_name: string;
  agent_email: string;
  agent_role: string;
  date: string;
  strategic_focus: string;
  suggested_call_target: number;
  suggested_lead_target: number;
  suggested_conversion_target: number;
  tasks: AgentDailyTask[];
  tasks_completed_count: number;
  total_tasks_count: number;
  completion_rate_percent: number;
  assigned_by: 'ai_system' | 'admin';
  assigned_at: string;
  updated_at: string;
}

export function formatTaskPlanFieldName(userId: string, date: string): string {
  return `__agent_tasks_${userId}_${date}`;
}

/**
 * Loads an agent's daily task plan for a target date.
 */
export async function loadAgentTaskPlan(
  db: SupabaseClient,
  accountId: string,
  userId: string,
  date: string
): Promise<AgentDailyTaskPlan | null> {
  const fieldName = formatTaskPlanFieldName(userId, date);
  const { data } = await db
    .from('custom_fields')
    .select('field_options')
    .eq('account_id', accountId)
    .eq('field_name', fieldName)
    .maybeSingle();

  if (data?.field_options && typeof data.field_options === 'object') {
    const plan = data.field_options as AgentDailyTaskPlan;
    // Recompute completion rate dynamically
    const completed = plan.tasks.filter((t) => t.status === 'completed').length;
    plan.tasks_completed_count = completed;
    plan.total_tasks_count = plan.tasks.length;
    plan.completion_rate_percent =
      plan.total_tasks_count > 0 ? Math.round((completed / plan.total_tasks_count) * 100) : 0;
    return plan;
  }

  return null;
}

/**
 * Saves or updates an agent's daily task plan.
 */
export async function saveAgentTaskPlan(
  db: SupabaseClient,
  accountId: string,
  userId: string,
  plan: AgentDailyTaskPlan
): Promise<void> {
  const fieldName = formatTaskPlanFieldName(userId, plan.date);
  const completed = plan.tasks.filter((t) => t.status === 'completed').length;
  const total = plan.tasks.length;

  const payload: AgentDailyTaskPlan = {
    ...plan,
    tasks_completed_count: completed,
    total_tasks_count: total,
    completion_rate_percent: total > 0 ? Math.round((completed / total) * 100) : 0,
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
      .update({ field_options: payload })
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
 * Loads all agent task plans for an account for a given date.
 */
export async function loadAllAgentTaskPlansForDate(
  db: SupabaseClient,
  accountId: string,
  date: string
): Promise<Record<string, AgentDailyTaskPlan>> {
  const pattern = `__agent_tasks_%_${date}`;
  const { data } = await db
    .from('custom_fields')
    .select('field_options')
    .eq('account_id', accountId)
    .ilike('field_name', pattern);

  if (!data) return {};

  const plans: Record<string, AgentDailyTaskPlan> = {};
  for (const item of data) {
    if (item.field_options && typeof item.field_options === 'object') {
      const p = item.field_options as AgentDailyTaskPlan;
      if (p.user_id && p.date === date) {
        const completed = p.tasks.filter((t) => t.status === 'completed').length;
        p.tasks_completed_count = completed;
        p.total_tasks_count = p.tasks.length;
        p.completion_rate_percent =
          p.total_tasks_count > 0 ? Math.round((completed / p.total_tasks_count) * 100) : 0;
        plans[p.user_id] = p;
      }
    }
  }

  return plans;
}

/**
 * Generates and assigns intelligent daily tasks to agents for the given date.
 */
export async function generateDailyAiTasksForAccount(
  db: SupabaseClient,
  accountId: string,
  date: string,
  targetAgentId?: string
): Promise<Record<string, AgentDailyTaskPlan>> {
  // 1. Fetch available team agents
  let memberQuery = db
    .from('profiles')
    .select('user_id, full_name, email, account_role')
    .eq('account_id', accountId)
    .order('full_name', { ascending: true });

  if (targetAgentId && targetAgentId !== 'all') {
    memberQuery = memberQuery.eq('user_id', targetAgentId);
  }

  const { data: rawMembers } = await memberQuery;
  const teamMembers = (rawMembers || []).map((m) => ({
    userId: m.user_id,
    fullName: m.full_name || m.email?.split('@')[0] || 'Counselor',
    email: m.email || '',
    role: m.account_role,
  }));

  if (teamMembers.length === 0) {
    return {};
  }

  // 2. Fetch leads from meta_lead_logs
  const { data: leads } = await db
    .from('meta_lead_logs')
    .select('id, full_name, phone, course, college, campaign_name, lead_status, assigned_to, notes, created_at, updated_at')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false })
    .limit(300);

  const activeLeads = (leads || []).filter((l) => l.lead_status !== 'lost');

  // 3. Resolve official WhatsApp Cloud number
  const officialPhone = await getWorkspaceWhatsAppPhone(db, accountId);

  // Group leads by counselor assignment
  const assignedMap = new Map<string, typeof activeLeads>();
  const unassignedPool: typeof activeLeads = [];

  for (const lead of activeLeads) {
    if (lead.assigned_to) {
      const list = assignedMap.get(lead.assigned_to) || [];
      list.push(lead);
      assignedMap.set(lead.assigned_to, list);
    } else {
      unassignedPool.push(lead);
    }
  }

  // Distribute unassigned pool in round-robin across team members
  let roundRobinIdx = 0;
  for (const unassigned of unassignedPool) {
    const member = teamMembers[roundRobinIdx % teamMembers.length];
    const list = assignedMap.get(member.userId) || [];
    list.push(unassigned);
    assignedMap.set(member.userId, list);
    roundRobinIdx++;
  }

  const resultPlans: Record<string, AgentDailyTaskPlan> = {};
  const nowIso = new Date().toISOString();

  // Try to load AI config for high-level advice
  let aiConfig = null;
  try {
    aiConfig = await loadAiConfig(db, accountId, { requireActive: false });
  } catch {
    // optional
  }

  for (const member of teamMembers) {
    const agentLeads = assignedMap.get(member.userId) || [];
    const tasks: AgentDailyTask[] = [];

    // Prioritize leads:
    // 1. Hot leads: interested, token pending, or recent notes
    // 2. Uncontacted new leads
    // 3. Follow-up leads
    const hotLeads: typeof activeLeads = [];
    const newLeads: typeof activeLeads = [];
    const followUpLeads: typeof activeLeads = [];

    for (const lead of agentLeads) {
      const notes = parseLeadNotes(lead.notes);
      const hasRecentNotes = notes.length > 0;
      const notesText = notes.map((n) => n.text).join(' ').toLowerCase();

      if (
        lead.lead_status === 'interested' ||
        notesText.includes('confirm') ||
        notesText.includes('token') ||
        notesText.includes('visit') ||
        notesText.includes('fees')
      ) {
        hotLeads.push(lead);
      } else if (lead.lead_status === 'new' || !hasRecentNotes) {
        newLeads.push(lead);
      } else {
        followUpLeads.push(lead);
      }
    }

    // Limit tasks to top 12-15 high-impact items per agent per day
    const selectedLeads = [
      ...hotLeads.slice(0, 5),
      ...newLeads.slice(0, 5),
      ...followUpLeads.slice(0, 4),
    ].slice(0, 14);

    let taskIdx = 1;

    for (const lead of selectedLeads) {
      const notes = parseLeadNotes(lead.notes);
      const studentName = lead.full_name || 'Student Candidate';
      const course = lead.course || 'Degree Program';
      const college = lead.college || 'Institution';
      const cleanPhone = (lead.phone || '').replace(/[^0-9]/g, '');

      let priority: TaskPriority = 'medium';
      let category: TaskCategory = 'follow_up';
      let title = `📞 Follow up with ${studentName} (${course})`;
      let description = `Review inquiry details for ${course} at ${college} and guide on next admissions milestone.`;
      let rationale = 'Regular follow-up to maintain student engagement and answer admission questions.';
      let dueTime = 'By 4:00 PM';

      if (hotLeads.includes(lead)) {
        priority = 'urgent';
        category = 'callback';
        title = `🔥 Priority Callback: ${studentName} (${course})`;
        description = `High-intent student interested in ${course}. Focus on seat reservation, scholarship quota, and fee structure breakdown.`;
        rationale = 'High admission conversion probability. Student showed strong interest or requested fee/visit details.';
        dueTime = 'Before 12:00 PM';
      } else if (newLeads.includes(lead)) {
        priority = 'high';
        category = 'new_lead_outreach';
        title = `🎯 Initial Outreach: ${studentName} (${course})`;
        description = `First-time inquiry for ${course} at ${college}. Introduce GEMS counseling support, verify eligibility criteria, and send brochure.`;
        rationale = 'New admission enquiry received within the last 48 hours. Fast response increases conversion by 3x.';
        dueTime = 'By 1:30 PM';
      }

      if (notes.length > 0) {
        const latestNote = notes[notes.length - 1].text;
        description += ` (Previous note: "${latestNote.slice(0, 80)}")`;
      }

      const waMsg = encodeURIComponent(
        `Hello ${studentName}, I am ${member.fullName} from GEMS Education Admissions regarding your application for ${course} at ${college}. I would love to assist you with direct seat reservation and fee details!`
      );
      const waLink = cleanPhone ? `https://wa.me/${cleanPhone}?text=${waMsg}` : undefined;

      tasks.push({
        id: `task_${member.userId}_${date}_${taskIdx++}`,
        user_id: member.userId,
        agent_name: member.fullName,
        date,
        title,
        description,
        priority,
        category,
        lead_id: lead.id,
        lead_name: studentName,
        lead_phone: lead.phone,
        course,
        college,
        status: 'pending',
        due_time: dueTime,
        ai_rationale: rationale,
        wa_link: waLink,
        created_at: nowIso,
        updated_at: nowIso,
      });
    }

    // Add strategic morning objective
    let strategicFocus = `Priority for today: Complete ${tasks.filter((t) => t.priority === 'urgent' || t.priority === 'high').length} high-priority admissions calls. Target 1-2 confirmed token reservations for ${date}.`;

    // If AI generation is available, enhance strategic brief
    if (aiConfig?.apiKey && tasks.length > 0) {
      try {
        const prompt = `You are the AI Admissions Director at GEMS Education. Counselor ${member.fullName} has ${tasks.length} prioritized admissions leads for today (${tasks.filter((t) => t.priority === 'urgent').length} urgent callbacks, ${tasks.filter((t) => t.category === 'new_lead_outreach').length} new enquiries). Generate a punchy 2-sentence morning strategic coaching tip focused on converting higher education students (courses: ${Array.from(new Set(tasks.map((t) => t.course))).join(', ')}).`;

        const aiResponse = await generateReply({
          config: aiConfig,
          systemPrompt: 'You are an expert university admissions manager providing concise counselor guidance.',
          messages: [{ role: 'user', content: prompt }],
        });

        if (aiResponse?.text) {
          strategicFocus = aiResponse.text.trim();
        }
      } catch (aiErr) {
        console.warn('[ai-task-assigner] LLM generation skipped:', aiErr);
      }
    }

    const taskPlan: AgentDailyTaskPlan = {
      id: formatTaskPlanFieldName(member.userId, date),
      user_id: member.userId,
      agent_name: member.fullName,
      agent_email: member.email,
      agent_role: member.role,
      date,
      strategic_focus: strategicFocus,
      suggested_call_target: Math.max(15, tasks.length + 5),
      suggested_lead_target: tasks.length,
      suggested_conversion_target: Math.max(1, Math.round(tasks.length * 0.15)),
      tasks,
      tasks_completed_count: 0,
      total_tasks_count: tasks.length,
      completion_rate_percent: 0,
      assigned_by: 'ai_system',
      assigned_at: nowIso,
      updated_at: nowIso,
    };

    await saveAgentTaskPlan(db, accountId, member.userId, taskPlan);
    resultPlans[member.userId] = taskPlan;

    // Send in-app notification to the agent
    try {
      await db.from('notifications').insert({
        account_id: accountId,
        user_id: member.userId,
        type: 'daily_ai_tasks_assigned',
        title: `🤖 Today's AI Tasks Assigned (${tasks.length} Action Items)`,
        body: `AI assigned ${tasks.length} prioritized admissions tasks for today. Focus: "${strategicFocus.slice(0, 100)}..."`,
        created_at: nowIso,
      });
    } catch {
      // ignore
    }
  }

  // Also post an admin alert
  try {
    const { data: admins } = await db
      .from('profiles')
      .select('user_id')
      .eq('account_id', accountId)
      .in('account_role', ['owner', 'admin']);

    if (admins && admins.length > 0) {
      const totalAssignedTasks = Object.values(resultPlans).reduce(
        (sum, p) => sum + p.tasks.length,
        0
      );
      const adminNotifs = admins.map((a) => ({
        account_id: accountId,
        user_id: a.user_id,
        type: 'ai_task_distribution_summary',
        title: `⚡ AI Assigned Daily Tasks to ${teamMembers.length} Agents`,
        body: `Distributed ${totalAssignedTasks} personalized admissions calls and follow-ups for ${date}.`,
        created_at: nowIso,
      }));
      await db.from('notifications').insert(adminNotifs);
    }
  } catch {
    // ignore
  }

  return resultPlans;
}

/**
 * Updates a specific task's status (completed, pending, skipped).
 */
export async function updateAgentTaskStatus(
  db: SupabaseClient,
  accountId: string,
  userId: string,
  date: string,
  taskId: string,
  newStatus: TaskStatus
): Promise<AgentDailyTaskPlan | null> {
  const plan = await loadAgentTaskPlan(db, accountId, userId, date);
  if (!plan) return null;

  const task = plan.tasks.find((t) => t.id === taskId);
  if (task) {
    task.status = newStatus;
    task.updated_at = new Date().toISOString();
    if (newStatus === 'completed') {
      task.completed_at = new Date().toISOString();
    } else {
      task.completed_at = undefined;
    }
  }

  await saveAgentTaskPlan(db, accountId, userId, plan);
  return plan;
}
