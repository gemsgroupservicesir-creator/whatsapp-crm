import type { SupabaseClient } from '@supabase/supabase-js';
import { loadAiConfig } from './config';
import { generateReply } from './generate';
import { loadEmailConfig } from '@/lib/email/config';
import { parseLeadNotes } from '@/lib/leads/notes';
import {
  applyLeadAssignmentRules,
  bulkSendLeadWhatsAppMessages,
  matchesLeadAssignmentRule,
} from '@/lib/leads/meta-leads';
import {
  loadCounsellingPlaybooks,
  syncPlaybookToKnowledgeBase,
} from '@/lib/counselling/engine';
import {
  generateDailyAiTasksForAccount,
  loadAllAgentTaskPlansForDate,
} from '@/lib/reports/ai-task-assigner';
import {
  getTodayDateString,
  loadAllAgentDailyReportsForDate,
} from '@/lib/reports/agent-reports';

export type RecommendationCategory =
  | 'leads_routing'
  | 'counselling_playbook'
  | 'whatsapp_automation'
  | 'email_followup'
  | 'knowledge_base'
  | 'agent_workload'
  | 'delivery_health';

export type RecommendationImpact = 'critical' | 'high' | 'medium' | 'low';

export type RecommendationActionType =
  | 'auto_assign_unassigned_leads'
  | 'create_assignment_rule'
  | 'enable_ai_autoreply'
  | 'generate_daily_tasks'
  | 'sync_counselling_kb'
  | 'retry_lead_whatsapp'
  | 'navigate';

export interface CrmRecommendationAction {
  type: RecommendationActionType;
  label: string;
  href?: string;
  payload?: Record<string, string>;
}

export interface CrmRecommendation {
  id: string;
  title: string;
  category: RecommendationCategory;
  impact: RecommendationImpact;
  finding: string;
  recommendation: string;
  estimatedTimeSaved: string;
  status: 'pending' | 'applied' | 'dismissed';
  appliedAt?: string;
  actionResult?: string;
  action: CrmRecommendationAction;
  source: 'system' | 'ai';
}

export interface CrmLearningInsight {
  topic: string;
  insight: string;
  evidence: string;
}

export interface CrmIntelligenceSnapshot {
  capturedAt: string;
  leads: {
    total: number;
    newCount: number;
    staleUncontactedCount: number;
    unassignedCount: number;
    interestedCount: number;
    convertedCount: number;
    missingEmailCount: number;
    failedWhatsappWelcomeCount: number;
    topCourses: Array<{ name: string; count: number }>;
    topColleges: Array<{ name: string; count: number }>;
    topCampaigns: Array<{ name: string; count: number }>;
    uncoveredCourses: Array<{ name: string; count: number; sampleUniversity?: string }>;
  };
  messaging: {
    totalConversations: number;
    unreadConversationsCount: number;
    awaitingReplyCount: number;
    handoffPausedCount: number;
    failedOutboundCount: number;
    topFailureReasons: Array<{ code: string; title: string; count: number }>;
    recentCustomerSnippets: string[];
  };
  deals: {
    total: number;
    openCount: number;
    wonCount: number;
    lostCount: number;
  };
  automation: {
    aiConfigured: boolean;
    aiActive: boolean;
    aiAutoReplyEnabled: boolean;
    whatsappConfigured: boolean;
    emailConfigured: boolean;
    autoEmailEnabled: boolean;
    kbDocumentCount: number;
    activeAssignmentRulesCount: number;
    activeFlowsCount: number;
    activeAutomationsCount: number;
    counsellingPlaybooksCount: number;
    unsyncedPlaybooksCount: number;
  };
  team: {
    totalMembers: number;
    presentTodayCount: number;
    tasksAssignedTodayCount: number;
    tasksCompletedTodayCount: number;
    agentWorkloads: Array<{ userId: string; name: string; leadCount: number }>;
  };
  recentNotesExcerpts: string[];
}

export interface CrmIntelligenceReport {
  id: string;
  lastScannedAt: string;
  scanCount: number;
  healthScore: number;
  executiveSummary: string;
  snapshot: CrmIntelligenceSnapshot;
  learnings: CrmLearningInsight[];
  knowledgeGaps: string[];
  recommendations: CrmRecommendation[];
  learnedHistory: string[];
}

export const CRM_INTELLIGENCE_FIELD_NAME = '__crm_ai_intelligence__';

/**
 * Collects a holistic, real-time telemetry snapshot across every core table in the CRM.
 */
export async function collectCrmIntelligenceSnapshot(
  db: SupabaseClient,
  accountId: string
): Promise<CrmIntelligenceSnapshot> {
  const today = getTodayDateString();
  const nowMs = Date.now();
  const staleCutoffMs = nowMs - 24 * 60 * 60 * 1000;

  const [
    leadsRes,
    rulesRes,
    convsRes,
    dealsRes,
    profilesRes,
    kbRes,
    flowsRes,
    autosRes,
    aiCfgRes,
    waCfgRes,
    emailCfg,
    playbooks,
    reportsToday,
    taskPlansToday,
  ] = await Promise.all([
    db
      .from('meta_lead_logs')
      .select(
        'id, full_name, email, college, course, campaign_name, form_name, assigned_to, lead_status, whatsapp_sent, ai_followup_status, notes, created_at'
      )
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(500),
    db
      .from('lead_assignment_rules')
      .select('id, name, criteria_type, operator, match_value, assign_to_user_id, is_active')
      .eq('account_id', accountId)
      .eq('is_active', true),
    db
      .from('conversations')
      .select('id, status, unread_count, assigned_agent_id, last_inbound_at, last_reply_at, ai_autoreply_disabled')
      .eq('account_id', accountId)
      .order('updated_at', { ascending: false })
      .limit(200),
    db
      .from('deals')
      .select('id, status')
      .eq('account_id', accountId)
      .limit(500),
    db
      .from('profiles')
      .select('user_id, full_name, email, account_role')
      .eq('account_id', accountId),
    db
      .from('ai_knowledge_documents')
      .select('id, title', { count: 'exact' })
      .eq('account_id', accountId),
    db
      .from('flows')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountId)
      .eq('is_active', true),
    db
      .from('automations')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountId)
      .eq('is_active', true),
    db
      .from('ai_configs')
      .select('is_active, auto_reply_enabled, api_key')
      .eq('account_id', accountId)
      .maybeSingle(),
    db
      .from('whatsapp_config')
      .select('id')
      .eq('account_id', accountId)
      .maybeSingle(),
    loadEmailConfig(db, accountId).catch(() => null),
    loadCounsellingPlaybooks(db, accountId).catch(() => []),
    loadAllAgentDailyReportsForDate(db, accountId, today).catch(() => []),
    loadAllAgentTaskPlansForDate(db, accountId, today).catch(() => ({})),
  ]);

  const leads = leadsRes.data || [];
  const rules = rulesRes.data || [];
  const convs = convsRes.data || [];
  const deals = dealsRes.data || [];
  const members = profilesRes.data || [];

  // Messages belong to conversations (messages has no direct account_id column)
  const convIds = convs.map((c) => c.id).slice(0, 100);
  let messages: Array<{
    sender_type: string;
    content_text: string | null;
    status: string | null;
    error_code: number | null;
    error_title: string | null;
    created_at: string;
  }> = [];

  if (convIds.length > 0) {
    const { data: msgRows } = await db
      .from('messages')
      .select('sender_type, content_text, status, error_code, error_title, created_at')
      .in('conversation_id', convIds)
      .order('created_at', { ascending: false })
      .limit(200);
    messages = msgRows || [];
  }

  // Analyze leads
  let newCount = 0;
  let staleUncontactedCount = 0;
  let unassignedCount = 0;
  let interestedCount = 0;
  let convertedCount = 0;
  let missingEmailCount = 0;
  let failedWhatsappWelcomeCount = 0;

  const courseCounts = new Map<string, { count: number; college?: string }>();
  const collegeCounts = new Map<string, number>();
  const campaignCounts = new Map<string, number>();
  const leadCountsByAgent = new Map<string, number>();
  const recentNotesExcerpts: string[] = [];

  for (const lead of leads) {
    if (lead.lead_status === 'new' || !lead.lead_status) newCount++;
    if (lead.lead_status === 'interested') interestedCount++;
    if (lead.lead_status === 'converted') convertedCount++;
    if (!lead.assigned_to) {
      unassignedCount++;
    } else {
      leadCountsByAgent.set(lead.assigned_to, (leadCountsByAgent.get(lead.assigned_to) || 0) + 1);
    }
    if (!lead.email || !lead.email.includes('@')) missingEmailCount++;
    if (lead.whatsapp_sent === false && lead.lead_status !== 'lost') {
      failedWhatsappWelcomeCount++;
    }

    const parsedNotes = parseLeadNotes(lead.notes);
    const createdMs = lead.created_at ? new Date(lead.created_at).getTime() : 0;
    if ((lead.lead_status === 'new' || !lead.lead_status) && parsedNotes.length === 0 && createdMs > 0 && createdMs < staleCutoffMs) {
      staleUncontactedCount++;
    }
    for (const n of parsedNotes.slice(-2)) {
      if (recentNotesExcerpts.length < 25 && n.text) {
        recentNotesExcerpts.push(`[${lead.course || 'General'}] ${n.text.slice(0, 160)}`);
      }
    }

    if (lead.course) {
      const cName = String(lead.course).trim();
      const prev = courseCounts.get(cName) || { count: 0, college: lead.college || undefined };
      courseCounts.set(cName, {
        count: prev.count + 1,
        college: prev.college || lead.college || undefined,
      });
    }
    if (lead.college) {
      const col = String(lead.college).trim();
      collegeCounts.set(col, (collegeCounts.get(col) || 0) + 1);
    }
    if (lead.campaign_name) {
      const camp = String(lead.campaign_name).trim();
      campaignCounts.set(camp, (campaignCounts.get(camp) || 0) + 1);
    }
  }

  const topCourses = Array.from(courseCounts.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 8)
    .map(([name, info]) => ({ name, count: info.count }));

  const topColleges = Array.from(collegeCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, count]) => ({ name, count }));

  const topCampaigns = Array.from(campaignCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, count]) => ({ name, count }));

  // Check which top courses have NO active lead assignment rule covering them
  const uncoveredCourses: Array<{ name: string; count: number; sampleUniversity?: string }> = [];
  for (const [courseName, info] of courseCounts.entries()) {
    if (info.count < 2) continue;
    const isCovered = rules.some((rule) =>
      matchesLeadAssignmentRule(rule, { course: courseName, college: info.college })
    );
    if (!isCovered) {
      uncoveredCourses.push({
        name: courseName,
        count: info.count,
        sampleUniversity: info.college,
      });
    }
  }
  uncoveredCourses.sort((a, b) => b.count - a.count);

  // Messaging analysis
  let unreadConversationsCount = 0;
  let awaitingReplyCount = 0;
  let handoffPausedCount = 0;
  for (const c of convs) {
    if ((c.unread_count || 0) > 0) unreadConversationsCount++;
    if (c.ai_autoreply_disabled) handoffPausedCount++;
    const inMs = c.last_inbound_at ? new Date(c.last_inbound_at).getTime() : 0;
    const outMs = c.last_reply_at ? new Date(c.last_reply_at).getTime() : 0;
    if (inMs > 0 && inMs > outMs) awaitingReplyCount++;
  }

  let failedOutboundCount = 0;
  const failMap = new Map<string, { code: string; title: string; count: number }>();
  const recentCustomerSnippets: string[] = [];

  for (const m of messages) {
    if (m.status === 'failed' || m.error_code) {
      failedOutboundCount++;
      const codeStr = m.error_code ? String(m.error_code) : 'unknown';
      const titleStr = m.error_title || 'Delivery failed';
      const key = `${codeStr}:${titleStr}`;
      const existing = failMap.get(key) || { code: codeStr, title: titleStr, count: 0 };
      existing.count++;
      failMap.set(key, existing);
    }
    if (m.sender_type === 'customer' && m.content_text && recentCustomerSnippets.length < 15) {
      recentCustomerSnippets.push(m.content_text.slice(0, 140));
    }
  }

  const topFailureReasons = Array.from(failMap.values()).sort((a, b) => b.count - a.count);

  // Deals
  const openCount = deals.filter((d) => d.status === 'open' || d.status === 'active').length;
  const wonCount = deals.filter((d) => d.status === 'won').length;
  const lostCount = deals.filter((d) => d.status === 'lost').length;

  // Team
  const presentTodayCount = reportsToday.filter(
    (r) => r.session_status === 'clocked_in' || r.session_status === 'clocked_out'
  ).length;
  const taskPlansList = Object.values(taskPlansToday);
  const tasksAssignedTodayCount = taskPlansList.reduce((acc, p) => acc + p.total_tasks_count, 0);
  const tasksCompletedTodayCount = taskPlansList.reduce((acc, p) => acc + p.tasks_completed_count, 0);

  const agentWorkloads = members.map((m) => ({
    userId: m.user_id,
    name: m.full_name || m.email?.split('@')[0] || 'Agent',
    leadCount: leadCountsByAgent.get(m.user_id) || 0,
  }));

  const unsyncedPlaybooksCount = playbooks.filter((p) => !p.kbDocumentId).length;

  return {
    capturedAt: new Date().toISOString(),
    leads: {
      total: leads.length,
      newCount,
      staleUncontactedCount,
      unassignedCount,
      interestedCount,
      convertedCount,
      missingEmailCount,
      failedWhatsappWelcomeCount,
      topCourses,
      topColleges,
      topCampaigns,
      uncoveredCourses: uncoveredCourses.slice(0, 5),
    },
    messaging: {
      totalConversations: convs.length,
      unreadConversationsCount,
      awaitingReplyCount,
      handoffPausedCount,
      failedOutboundCount,
      topFailureReasons,
      recentCustomerSnippets,
    },
    deals: {
      total: deals.length,
      openCount,
      wonCount,
      lostCount,
    },
    automation: {
      aiConfigured: Boolean(aiCfgRes.data?.api_key),
      aiActive: Boolean(aiCfgRes.data?.is_active),
      aiAutoReplyEnabled: Boolean(aiCfgRes.data?.auto_reply_enabled),
      whatsappConfigured: Boolean(waCfgRes.data?.id),
      emailConfigured: Boolean(emailCfg?.apiKey),
      autoEmailEnabled: Boolean(emailCfg?.autoEmailEnabled),
      kbDocumentCount: kbRes.count || 0,
      activeAssignmentRulesCount: rules.length,
      activeFlowsCount: flowsRes.count || 0,
      activeAutomationsCount: autosRes.count || 0,
      counsellingPlaybooksCount: playbooks.length,
      unsyncedPlaybooksCount,
    },
    team: {
      totalMembers: members.length,
      presentTodayCount,
      tasksAssignedTodayCount,
      tasksCompletedTodayCount,
      agentWorkloads,
    },
    recentNotesExcerpts,
  };
}

/**
 * Computes deterministic, directly executable workflow recommendations from live CRM telemetry.
 */
function buildDeterministicRecommendations(
  snapshot: CrmIntelligenceSnapshot,
  playbooks: Awaited<ReturnType<typeof loadCounsellingPlaybooks>>,
  priorStatuses: Map<string, CrmRecommendation>
): CrmRecommendation[] {
  const recs: CrmRecommendation[] = [];

  const withPrior = (rec: Omit<CrmRecommendation, 'status' | 'appliedAt' | 'actionResult'>): CrmRecommendation => {
    const prev = priorStatuses.get(rec.id);
    if (prev && prev.status === 'dismissed') {
      return { ...rec, status: 'dismissed' };
    }
    return {
      ...rec,
      status: 'pending',
    };
  };

  // 1. Meta Business Account / Delivery failures
  const lockFailure = snapshot.messaging.topFailureReasons.find((f) => f.code === '131031');
  if (lockFailure) {
    recs.push(
      withPrior({
        id: 'rec-whatsapp-business-lock',
        title: 'Resolve Meta WhatsApp Business Verification Lock (Error 131031)',
        category: 'delivery_health',
        impact: 'critical',
        finding: `${lockFailure.count} outbound WhatsApp message(s) failed with Error 131031 ("${lockFailure.title}"). Inbound customer messages are arriving, but outbound sending is locked until Meta Business Verification clears.`,
        recommendation:
          'Complete or follow up on Business Verification inside Meta Business Settings > Security Center to restore instant two-way WhatsApp delivery.',
        estimatedTimeSaved: 'Unlocks 100% outbound WA replies',
        source: 'system',
        action: {
          type: 'navigate',
          label: 'Open WhatsApp Settings',
          href: '/settings',
        },
      })
    );
  }

  // 2. Unassigned leads
  if (snapshot.leads.unassignedCount > 0) {
    recs.push(
      withPrior({
        id: 'rec-unassigned-leads',
        title: `Auto-Assign ${snapshot.leads.unassignedCount} Unassigned Lead(s) to Counselors`,
        category: 'leads_routing',
        impact: snapshot.leads.unassignedCount >= 5 ? 'critical' : 'high',
        finding: `${snapshot.leads.unassignedCount} out of ${snapshot.leads.total} leads have no assigned counselor yet, delaying first response.`,
        recommendation:
          'Run automated lead routing (matching rules + balanced round-robin across agents) so every lead receives immediate counselor ownership.',
        estimatedTimeSaved: `~${Math.max(15, snapshot.leads.unassignedCount * 3)} mins saved`,
        source: 'system',
        action: {
          type: 'auto_assign_unassigned_leads',
          label: 'Auto-Assign Now',
        },
      })
    );
  }

  // 3. Uncovered course auto-assignment rule
  const topUncovered = snapshot.leads.uncoveredCourses[0];
  const leastLoadedAgent = [...snapshot.team.agentWorkloads].sort(
    (a, b) => a.leadCount - b.leadCount
  )[0];
  if (topUncovered && leastLoadedAgent) {
    recs.push(
      withPrior({
        id: `rec-rule-course-${topUncovered.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        title: `Create Auto-Assign Rule for Top Course: "${topUncovered.name}"`,
        category: 'leads_routing',
        impact: 'high',
        finding: `${topUncovered.count} leads are interested in "${topUncovered.name}", yet no active assignment rule automatically routes these leads.`,
        recommendation: `Automatically create a rule routing "${topUncovered.name}" leads to ${leastLoadedAgent.name} (currently balancing ${leastLoadedAgent.leadCount} leads) with AI chat enabled.`,
        estimatedTimeSaved: '~30 mins/day',
        source: 'system',
        action: {
          type: 'create_assignment_rule',
          label: `Route to ${leastLoadedAgent.name}`,
          payload: {
            criteriaType: 'course',
            matchValue: topUncovered.name,
            assignToUserId: leastLoadedAgent.userId,
            agentName: leastLoadedAgent.name,
          },
        },
      })
    );
  }

  // 4. Counselling Playbook Gap for Top Course
  const topCourse = snapshot.leads.topCourses[0];
  const topUniversity = snapshot.leads.topColleges[0];
  if (topCourse) {
    const hasPlaybook = playbooks.some(
      (pb) =>
        pb.courseName.toLowerCase().includes(topCourse.name.toLowerCase()) ||
        topCourse.name.toLowerCase().includes(pb.courseName.toLowerCase())
    );
    if (!hasPlaybook) {
      const uni = topUniversity?.name || 'GEMS Partner University';
      recs.push(
        withPrior({
          id: 'rec-counselling-top-course',
          title: `Automate Counselling Kit for "${topCourse.name}" (${topCourse.count} Leads)`,
          category: 'counselling_playbook',
          impact: 'high',
          finding: `"${topCourse.name}" is your highest-demand program (${topCourse.count} leads), but there is no saved Agent Counselling Playbook automating its WhatsApp replies & emails yet.`,
          recommendation:
            'Open Agent Counselling with the university, course, and official website link to generate structured talking points and automate WhatsApp + Email responses.',
          estimatedTimeSaved: '~1.5 hrs/day',
          source: 'system',
          action: {
            type: 'navigate',
            label: 'Create Counselling Playbook',
            href: `/counselling?university=${encodeURIComponent(uni)}&course=${encodeURIComponent(topCourse.name)}`,
          },
        })
      );
    }
  }

  // 5. Unsynced Counselling Playbooks to Knowledge Base
  if (snapshot.automation.unsyncedPlaybooksCount > 0) {
    recs.push(
      withPrior({
        id: 'rec-sync-counselling-kb',
        title: `Sync ${snapshot.automation.unsyncedPlaybooksCount} Counselling Playbook(s) to AI Knowledge Base`,
        category: 'knowledge_base',
        impact: 'high',
        finding: `${snapshot.automation.unsyncedPlaybooksCount} saved counselling playbook(s) are not yet indexed in your AI Knowledge Base vector/FTS store.`,
        recommendation:
          'Index your saved university & course playbooks so WhatsApp AI Auto-Reply answers specific student questions directly from your verified course details.',
        estimatedTimeSaved: '~40 mins/day',
        source: 'system',
        action: {
          type: 'sync_counselling_kb',
          label: 'Sync Playbooks to KB',
        },
      })
    );
  }

  // 6. AI Auto-Reply disabled while conversations await replies
  if (
    snapshot.automation.aiConfigured &&
    (!snapshot.automation.aiActive || !snapshot.automation.aiAutoReplyEnabled)
  ) {
    recs.push(
      withPrior({
        id: 'rec-enable-ai-autoreply',
        title: 'Enable AI Auto-Reply Assistant for Instant 24/7 Student Responses',
        category: 'whatsapp_automation',
        impact: 'high',
        finding: `Your AI provider key is configured, but automated WhatsApp replies are turned off while ${snapshot.messaging.awaitingReplyCount} chat(s) await a response.`,
        recommendation:
          'Turn on AI Auto-Reply so incoming inquiries are answered instantly using your knowledge base and Agent Counselling playbooks.',
        estimatedTimeSaved: '~2 hrs/day',
        source: 'system',
        action: {
          type: 'enable_ai_autoreply',
          label: 'Enable AI Auto-Reply',
        },
      })
    );
  }

  // 7. Daily AI Tasks not assigned today
  if (snapshot.team.totalMembers > 0 && snapshot.team.tasksAssignedTodayCount === 0) {
    recs.push(
      withPrior({
        id: 'rec-generate-daily-tasks',
        title: 'Assign Today’s AI-Prioritized Tasks to All Counselors',
        category: 'agent_workload',
        impact: 'medium',
        finding: `0 daily action tasks have been generated for your ${snapshot.team.totalMembers} team member(s) today, leaving ${snapshot.leads.interestedCount} interested & ${snapshot.leads.staleUncontactedCount} stale new leads unprioritized.`,
        recommendation:
          'Generate and push prioritized callback & follow-up task lists for every agent with one-click WhatsApp outreach links.',
        estimatedTimeSaved: '~35 mins morning planning',
        source: 'system',
        action: {
          type: 'generate_daily_tasks',
          label: 'Assign AI Tasks Now',
        },
      })
    );
  }

  // 8. Stale new leads follow-up
  if (snapshot.leads.staleUncontactedCount > 0) {
    recs.push(
      withPrior({
        id: 'rec-stale-leads-followup',
        title: `Follow Up ${snapshot.leads.staleUncontactedCount} Uncontacted Lead(s) Older Than 24h`,
        category: 'email_followup',
        impact: snapshot.leads.staleUncontactedCount >= 5 ? 'high' : 'medium',
        finding: `${snapshot.leads.staleUncontactedCount} new lead(s) created over 24 hours ago still have zero counselor notes logged.`,
        recommendation:
          'Launch personalized AI follow-up emails and WhatsApp counselling templates from the Leads or Counselling workspace to re-engage cold inquiries.',
        estimatedTimeSaved: '~45 mins/day',
        source: 'system',
        action: {
          type: 'navigate',
          label: 'Review Stale Leads',
          href: '/leads',
        },
      })
    );
  }

  return recs;
}

/**
 * Computes an operational CRM health score (0-100).
 */
function calculateHealthScore(snapshot: CrmIntelligenceSnapshot): number {
  let score = 100;
  if (!snapshot.automation.whatsappConfigured) score -= 18;
  if (!snapshot.automation.emailConfigured) score -= 10;
  if (!snapshot.automation.aiConfigured) score -= 10;
  if (!snapshot.automation.aiAutoReplyEnabled) score -= 7;
  if (snapshot.leads.unassignedCount > 0) score -= Math.min(18, snapshot.leads.unassignedCount * 2);
  if (snapshot.leads.staleUncontactedCount > 0) score -= Math.min(14, snapshot.leads.staleUncontactedCount * 2);
  if (snapshot.messaging.awaitingReplyCount > 0) score -= Math.min(10, snapshot.messaging.awaitingReplyCount * 2);
  if (snapshot.messaging.failedOutboundCount > 0) score -= Math.min(15, snapshot.messaging.failedOutboundCount * 3);
  if (snapshot.automation.counsellingPlaybooksCount === 0 && snapshot.leads.total > 0) score -= 6;
  return Math.max(15, Math.min(100, Math.round(score)));
}

/**
 * Loads the persisted CRM AI Intelligence report for an account (if any).
 */
export async function loadCrmIntelligenceReport(
  db: SupabaseClient,
  accountId: string
): Promise<CrmIntelligenceReport | null> {
  try {
    const { data, error } = await db
      .from('custom_fields')
      .select('field_options')
      .eq('account_id', accountId)
      .eq('field_name', CRM_INTELLIGENCE_FIELD_NAME)
      .maybeSingle();

    if (error || !data?.field_options) return null;
    const report = data.field_options as CrmIntelligenceReport;
    return report && Array.isArray(report.recommendations) ? report : null;
  } catch {
    return null;
  }
}

async function saveCrmIntelligenceReport(
  db: SupabaseClient,
  accountId: string,
  userId: string,
  report: CrmIntelligenceReport
): Promise<void> {
  const { data: existing } = await db
    .from('custom_fields')
    .select('id')
    .eq('account_id', accountId)
    .eq('field_name', CRM_INTELLIGENCE_FIELD_NAME)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await db
      .from('custom_fields')
      .update({ field_options: report })
      .eq('id', existing.id);
    if (error) throw error;
  } else {
    const { error } = await db.from('custom_fields').insert({
      account_id: accountId,
      user_id: userId,
      field_name: CRM_INTELLIGENCE_FIELD_NAME,
      field_type: 'json',
      field_options: report,
    });
    if (error) throw error;
  }
}

/**
 * Runs a full CRM-wide AI learning scan: inspects all tables, merges continuous learning
 * memory, executes LLM deep analysis when configured, and persists recommendations.
 */
export async function runCrmIntelligenceScan(
  db: SupabaseClient,
  accountId: string,
  userId: string
): Promise<CrmIntelligenceReport> {
  const [snapshot, playbooks, previousReport] = await Promise.all([
    collectCrmIntelligenceSnapshot(db, accountId),
    loadCounsellingPlaybooks(db, accountId).catch(() => []),
    loadCrmIntelligenceReport(db, accountId),
  ]);

  const priorMap = new Map<string, CrmRecommendation>(
    (previousReport?.recommendations || []).map((r) => [r.id, r])
  );
  const learnedHistory = previousReport?.learnedHistory || [];

  const deterministicRecs = buildDeterministicRecommendations(snapshot, playbooks, priorMap);
  const healthScore = calculateHealthScore(snapshot);

  let executiveSummary = `Scanned ${snapshot.leads.total} leads, ${snapshot.messaging.totalConversations} WhatsApp conversations, ${snapshot.deals.total} deals, and ${snapshot.team.totalMembers} team members. ${deterministicRecs.filter((r) => r.status === 'pending').length} high-impact optimization(s) detected to streamline admissions workflows.`;

  let learnings: CrmLearningInsight[] = [
    {
      topic: 'Top Student Demand',
      insight: snapshot.leads.topCourses.length > 0
        ? `Highest inbound demand is concentrated in ${snapshot.leads.topCourses.slice(0, 3).map((c) => `${c.name} (${c.count})`).join(', ')}.`
        : 'Lead course volume is still accumulating; tagging courses on incoming leads will sharpen routing.',
      evidence: `${snapshot.leads.total} total leads analyzed across ${snapshot.leads.topColleges.length} institution(s).`,
    },
    {
      topic: 'Messaging & Response Pipeline',
      insight: `${snapshot.messaging.awaitingReplyCount} active conversation(s) await a response; ${snapshot.messaging.failedOutboundCount} outbound message failures detected.`,
      evidence: snapshot.messaging.topFailureReasons.length > 0
        ? `Primary failure reason: ${snapshot.messaging.topFailureReasons[0].title} (${snapshot.messaging.topFailureReasons[0].code}).`
        : 'No systemic WhatsApp error codes detected.',
    },
    {
      topic: 'Automation Readiness',
      insight: `${snapshot.automation.activeAssignmentRulesCount} auto-assignment rule(s), ${snapshot.automation.counsellingPlaybooksCount} counselling playbook(s), and ${snapshot.automation.kbDocumentCount} knowledge base document(s) active.`,
      evidence: `AI Auto-Reply is ${snapshot.automation.aiAutoReplyEnabled ? 'enabled' : 'disabled'}; Resend Email is ${snapshot.automation.emailConfigured ? 'configured' : 'not configured'}.`,
    },
  ];

  let knowledgeGaps: string[] = [];
  if (snapshot.leads.uncoveredCourses.length > 0) {
    knowledgeGaps = snapshot.leads.uncoveredCourses.map(
      (c) => `Dedicated FAQ & Counselling Playbook needed for ${c.name} (${c.count} inquiries)`
    );
  }

  let aiExtraRecs: CrmRecommendation[] = [];

  // Deep LLM synthesis when AI key is available
  try {
    const aiConfig = await loadAiConfig(db, accountId, { requireActive: false });
    if (aiConfig?.apiKey) {
      const compactTelemetry = {
        leads: snapshot.leads,
        messaging: {
          totalConversations: snapshot.messaging.totalConversations,
          unreadConversationsCount: snapshot.messaging.unreadConversationsCount,
          awaitingReplyCount: snapshot.messaging.awaitingReplyCount,
          failedOutboundCount: snapshot.messaging.failedOutboundCount,
          topFailureReasons: snapshot.messaging.topFailureReasons,
          sampleCustomerQuestions: snapshot.messaging.recentCustomerSnippets.slice(0, 10),
        },
        deals: snapshot.deals,
        automation: snapshot.automation,
        team: snapshot.team,
        sampleCounselorNotes: snapshot.recentNotesExcerpts.slice(0, 12),
        alreadyAppliedHistory: learnedHistory.slice(-10),
        existingSystemFindings: deterministicRecs.map((r) => r.title),
      };

      const aiRes = await generateReply({
        config: aiConfig,
        systemPrompt:
          'You are the Chief AI Operations & Admissions Strategist analyzing a complete Education CRM database. Return ONLY valid JSON.',
        messages: [
          {
            role: 'user',
            content: `Analyze this entire CRM telemetry snapshot, counselor notes, and customer message patterns. Learn what is slowing counselors down or hurting conversions, and return concise actionable JSON:

${JSON.stringify(compactTelemetry, null, 2)}

Return JSON format:
{
  "executiveSummary": "2-3 sentence sharp diagnosis of CRM efficiency and conversion opportunities",
  "learnings": [
    { "topic": "Short theme", "insight": "What AI learned from leads/notes/messages", "evidence": "Exact numbers or themes observed" }
  ],
  "knowledgeGaps": ["Specific university/course or objection missing from KB"],
  "additionalRecommendations": [
    {
      "title": "Actionable workflow change not already in existingSystemFindings",
      "category": "email_followup" | "whatsapp_automation" | "counselling_playbook" | "agent_workload" | "knowledge_base",
      "impact": "high" | "medium",
      "finding": "Specific pattern observed in CRM data",
      "recommendation": "Exact step to make counselor work easier",
      "estimatedTimeSaved": "~30 mins/day",
      "href": "/counselling" | "/leads" | "/inbox" | "/reports" | "/settings"
    }
  ]
}`,
          },
        ],
      });

      if (aiRes?.text) {
        const cleaned = aiRes.text
          .trim()
          .replace(/^```(?:json)?\s*/i, '')
          .replace(/\s*```$/i, '');
        const first = cleaned.indexOf('{');
        const last = cleaned.lastIndexOf('}');
        if (first >= 0 && last > first) {
          const parsed = JSON.parse(cleaned.slice(first, last + 1)) as Record<string, unknown>;
          if (typeof parsed.executiveSummary === 'string' && parsed.executiveSummary.trim()) {
            executiveSummary = parsed.executiveSummary.trim();
          }
          if (Array.isArray(parsed.learnings) && parsed.learnings.length > 0) {
            learnings = parsed.learnings
              .filter((l): l is Record<string, unknown> => Boolean(l && typeof l === 'object'))
              .map((l) => ({
                topic: String(l.topic || 'CRM Insight'),
                insight: String(l.insight || ''),
                evidence: String(l.evidence || ''),
              }))
              .filter((l) => l.insight);
          }
          if (Array.isArray(parsed.knowledgeGaps)) {
            const gaps = parsed.knowledgeGaps.map((g) => String(g || '').trim()).filter(Boolean);
            if (gaps.length > 0) knowledgeGaps = gaps;
          }
          if (Array.isArray(parsed.additionalRecommendations)) {
            const validCats = new Set<RecommendationCategory>([
              'leads_routing',
              'counselling_playbook',
              'whatsapp_automation',
              'email_followup',
              'knowledge_base',
              'agent_workload',
              'delivery_health',
            ]);
            aiExtraRecs = parsed.additionalRecommendations
              .filter((r): r is Record<string, unknown> => Boolean(r && typeof r === 'object'))
              .slice(0, 3)
              .map((r, idx) => {
                const href = typeof r.href === 'string' && r.href.startsWith('/') ? r.href : '/counselling';
                const impact: RecommendationImpact =
                  r.impact === 'critical' || r.impact === 'medium' || r.impact === 'low'
                    ? r.impact
                    : 'high';
                return {
                  id: `rec-ai-${idx}-${String(r.title || 'opt').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 28)}`,
                  title: String(r.title || 'AI Workflow Optimization'),
                  category: validCats.has(r.category as RecommendationCategory)
                    ? (r.category as RecommendationCategory)
                    : 'whatsapp_automation',
                  impact,
                  finding: String(r.finding || ''),
                  recommendation: String(r.recommendation || ''),
                  estimatedTimeSaved: String(r.estimatedTimeSaved || '~30 mins/day'),
                  status: 'pending' as const,
                  source: 'ai' as const,
                  action: {
                    type: 'navigate' as const,
                    label: href === '/counselling' ? 'Open Counselling' : `Go to ${href.replace('/', '')}`,
                    href,
                  },
                };
              })
              .filter((r) => r.title && r.recommendation);
          }
        }
      }
    }
  } catch (err) {
    console.warn('[crm-intelligence] Deep AI analysis fell back to deterministic scan:', err);
  }

  // Carry over recently applied recommendations for audit visibility
  const previouslyApplied = (previousReport?.recommendations || [])
    .filter((r) => r.status === 'applied' && !deterministicRecs.some((d) => d.id === r.id));

  const mergedRecs = [...deterministicRecs, ...aiExtraRecs, ...previouslyApplied.slice(0, 5)];

  const report: CrmIntelligenceReport = {
    id: CRM_INTELLIGENCE_FIELD_NAME,
    lastScannedAt: new Date().toISOString(),
    scanCount: (previousReport?.scanCount || 0) + 1,
    healthScore,
    executiveSummary,
    snapshot,
    learnings,
    knowledgeGaps,
    recommendations: mergedRecs,
    learnedHistory: learnedHistory.slice(-30),
  };

  await saveCrmIntelligenceReport(db, accountId, userId, report);
  return report;
}

/**
 * Executes a specific recommendation's change on the CRM backend and logs it into learning history.
 */
export async function applyCrmRecommendation(
  db: SupabaseClient,
  accountId: string,
  userId: string,
  recommendationId: string
): Promise<{ report: CrmIntelligenceReport; summary: string }> {
  let report = await loadCrmIntelligenceReport(db, accountId);
  if (!report) {
    report = await runCrmIntelligenceScan(db, accountId, userId);
  }

  const target = report.recommendations.find((r) => r.id === recommendationId);
  if (!target) {
    throw new Error('Recommendation not found. Please re-scan the CRM.');
  }

  let summary = '';
  const { action } = target;

  switch (action.type) {
    case 'auto_assign_unassigned_leads': {
      // First apply matching rules
      const ruleResult = await applyLeadAssignmentRules(db, accountId);
      let roundRobinCount = 0;

      // Distribute any remaining unassigned leads evenly across team members
      const { data: members } = await db
        .from('profiles')
        .select('user_id, full_name')
        .eq('account_id', accountId)
        .in('account_role', ['agent', 'admin', 'owner']);

      const { data: stillUnassigned } = await db
        .from('meta_lead_logs')
        .select('id, conversation_id')
        .eq('account_id', accountId)
        .is('assigned_to', null)
        .limit(200);

      if (members && members.length > 0 && stillUnassigned && stillUnassigned.length > 0) {
        const now = new Date().toISOString();
        for (let i = 0; i < stillUnassigned.length; i++) {
          const lead = stillUnassigned[i];
          const assignee = members[i % members.length];
          await db
            .from('meta_lead_logs')
            .update({ assigned_to: assignee.user_id, assigned_at: now, updated_at: now })
            .eq('id', lead.id);
          if (lead.conversation_id) {
            await db
              .from('conversations')
              .update({ assigned_agent_id: assignee.user_id })
              .eq('id', lead.conversation_id);
          }
          roundRobinCount++;
        }
      }

      summary = `Auto-assigned ${ruleResult.assignedCount} lead(s) via rules and ${roundRobinCount} remaining lead(s) via balanced round-robin.`;
      break;
    }

    case 'create_assignment_rule': {
      const matchValue = action.payload?.matchValue || '';
      const assignToUserId = action.payload?.assignToUserId || userId;
      const criteriaType = action.payload?.criteriaType || 'course';
      const agentName = action.payload?.agentName || 'Counselor';

      if (!matchValue) {
        throw new Error('Missing rule criteria value');
      }

      const { error: ruleErr } = await db.from('lead_assignment_rules').insert({
        account_id: accountId,
        name: `AI Route: ${matchValue} → ${agentName}`,
        criteria_type: criteriaType,
        operator: 'contains',
        match_value: matchValue,
        assign_to_user_id: assignToUserId,
        priority: 5,
        is_active: true,
        followup_template_name: 'education_admissions_welcome',
        ai_auto_chat_enabled: true,
      });

      if (ruleErr) throw ruleErr;

      const applied = await applyLeadAssignmentRules(db, accountId);
      summary = `Created active rule for "${matchValue}" -> ${agentName} and routed ${applied.assignedCount} matching lead(s).`;
      break;
    }

    case 'enable_ai_autoreply': {
      const { error: aiErr } = await db
        .from('ai_configs')
        .update({ is_active: true, auto_reply_enabled: true })
        .eq('account_id', accountId);

      if (aiErr) throw aiErr;
      summary = 'Enabled AI Assistant & 24/7 WhatsApp Auto-Reply across the workspace.';
      break;
    }

    case 'generate_daily_tasks': {
      const today = getTodayDateString();
      const plans = await generateDailyAiTasksForAccount(db, accountId, today);
      const count = Object.values(plans).reduce((s, p) => s + p.tasks.length, 0);
      summary = `Generated and assigned ${count} AI-prioritized tasks across ${Object.keys(plans).length} team member(s).`;
      break;
    }

    case 'sync_counselling_kb': {
      const playbooks = await loadCounsellingPlaybooks(db, accountId);
      let synced = 0;
      for (const pb of playbooks) {
        if (!pb.kbDocumentId) {
          const res = await syncPlaybookToKnowledgeBase(db, accountId, userId, pb);
          pb.kbDocumentId = res.documentId;
          synced++;
        }
      }
      if (synced > 0) {
        // Persist updated kbDocumentId back to playbooks store
        const { saveCounsellingPlaybook } = await import('@/lib/counselling/engine');
        for (const pb of playbooks) {
          if (pb.kbDocumentId) {
            await saveCounsellingPlaybook(db, accountId, userId, pb);
          }
        }
      }
      summary = `Synchronized ${synced} Counselling Playbook(s) into the AI Knowledge Base.`;
      break;
    }

    case 'retry_lead_whatsapp': {
      const res = await bulkSendLeadWhatsAppMessages(db, accountId, {
        onlyFailed: true,
        limit: 25,
        senderUserId: userId,
      });
      summary = `Attempted WhatsApp outreach: ${res.sentCount} sent, ${res.failedCount} failed.`;
      break;
    }

    case 'navigate':
    default: {
      summary = `Marked "${target.title}" as acknowledged/reviewed.`;
      break;
    }
  }

  target.status = 'applied';
  target.appliedAt = new Date().toISOString();
  target.actionResult = summary;
  report.learnedHistory = [
    ...(report.learnedHistory || []),
    `[${target.appliedAt.slice(0, 10)}] Applied "${target.title}": ${summary}`,
  ].slice(-30);

  // Refresh lightweight snapshot metrics after applying change
  report.snapshot = await collectCrmIntelligenceSnapshot(db, accountId);
  report.healthScore = calculateHealthScore(report.snapshot);

  await saveCrmIntelligenceReport(db, accountId, userId, report);
  return { report, summary };
}

/**
 * Answers free-form operational questions grounded in the entire live CRM snapshot & insights.
 */
export async function askCrmIntelligence(
  db: SupabaseClient,
  accountId: string,
  question: string
): Promise<{ answer: string; source: 'ai' | 'fallback' }> {
  const snapshot = await collectCrmIntelligenceSnapshot(db, accountId);
  const aiConfig = await loadAiConfig(db, accountId, { requireActive: false }).catch(() => null);

  if (!aiConfig?.apiKey) {
    const q = question.toLowerCase();
    if (q.includes('lead') || q.includes('course')) {
      return {
        source: 'fallback',
        answer: `You currently have ${snapshot.leads.total} leads (${snapshot.leads.unassignedCount} unassigned, ${snapshot.leads.staleUncontactedCount} stale >24h). Top courses in demand: ${snapshot.leads.topCourses.map((c) => `${c.name} (${c.count})`).join(', ') || 'none recorded yet'}.`,
      };
    }
    return {
      source: 'fallback',
      answer: `CRM Overview: ${snapshot.leads.total} leads, ${snapshot.messaging.awaitingReplyCount} chats awaiting reply, ${snapshot.automation.counsellingPlaybooksCount} counselling playbooks, and health score ${calculateHealthScore(snapshot)}/100. Configure an AI key in Setup to unlock deep conversational Q&A.`,
    };
  }

  try {
    const res = await generateReply({
      config: aiConfig,
      systemPrompt:
        'You are the Workspace AI CRM Intelligence Advisor. Answer concisely using ONLY verified numbers and notes from the live CRM snapshot provided. Recommend concrete CRM tabs (Leads, Agent Counselling, Inbox, Reports, Settings) where relevant.',
      messages: [
        {
          role: 'user',
          content: `LIVE CRM TELEMETRY:\n${JSON.stringify(
            {
              leads: snapshot.leads,
              messaging: snapshot.messaging,
              deals: snapshot.deals,
              automation: snapshot.automation,
              team: snapshot.team,
              sampleNotes: snapshot.recentNotesExcerpts.slice(0, 10),
            },
            null,
            2
          )}\n\nUSER QUESTION: ${question}`,
        },
      ],
    });

    if (res?.text) {
      return { source: 'ai', answer: res.text.trim() };
    }
  } catch (err) {
    console.warn('[crm-intelligence] ask failed:', err);
  }

  return {
    source: 'fallback',
    answer: `Based on live telemetry: ${snapshot.leads.total} total leads (${snapshot.leads.unassignedCount} unassigned), ${snapshot.messaging.awaitingReplyCount} chats awaiting reply, ${snapshot.messaging.failedOutboundCount} failed WhatsApp deliveries, and ${snapshot.automation.counsellingPlaybooksCount} Counselling Playbooks saved.`,
  };
}

/**
 * Updates a recommendation's status ('dismissed' or 'pending') and persists the report.
 */
export async function updateRecommendationStatus(
  db: SupabaseClient,
  accountId: string,
  userId: string,
  recommendationId: string,
  status: 'dismissed' | 'pending'
): Promise<CrmIntelligenceReport> {
  const report = await loadCrmIntelligenceReport(db, accountId);
  if (!report) {
    throw new Error('No CRM intelligence report found. Run a scan first.');
  }

  const target = report.recommendations.find((r) => r.id === recommendationId);
  if (!target) {
    throw new Error('Recommendation not found.');
  }

  target.status = status;
  if (status === 'dismissed') {
    report.learnedHistory = [
      ...(report.learnedHistory || []),
      `[${new Date().toISOString().slice(0, 10)}] Dismissed "${target.title}"`,
    ].slice(-30);
  }

  await saveCrmIntelligenceReport(db, accountId, userId, report);
  return report;
}
