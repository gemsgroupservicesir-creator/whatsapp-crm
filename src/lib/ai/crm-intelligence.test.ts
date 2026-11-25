import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

const h = vi.hoisted(() => ({
  loadAiConfig: vi.fn(),
  generateReply: vi.fn(),
  loadEmailConfig: vi.fn(),
  applyLeadAssignmentRules: vi.fn(),
  bulkSendLeadWhatsAppMessages: vi.fn(),
  loadCounsellingPlaybooks: vi.fn(),
  generateDailyAiTasksForAccount: vi.fn(),
  loadAllAgentTaskPlansForDate: vi.fn(),
  loadAllAgentDailyReportsForDate: vi.fn(),
}));

vi.mock('./config', () => ({ loadAiConfig: h.loadAiConfig }));
vi.mock('./generate', () => ({ generateReply: h.generateReply }));
vi.mock('@/lib/email/config', () => ({ loadEmailConfig: h.loadEmailConfig }));
vi.mock('@/lib/leads/meta-leads', async () => {
  const actual = await vi.importActual<typeof import('@/lib/leads/meta-leads')>('@/lib/leads/meta-leads');
  return {
    ...actual,
    applyLeadAssignmentRules: h.applyLeadAssignmentRules,
    bulkSendLeadWhatsAppMessages: h.bulkSendLeadWhatsAppMessages,
  };
});
vi.mock('@/lib/counselling/engine', () => ({
  loadCounsellingPlaybooks: h.loadCounsellingPlaybooks,
  syncPlaybookToKnowledgeBase: vi.fn().mockResolvedValue({ documentId: 'doc-1' }),
}));
vi.mock('@/lib/reports/ai-task-assigner', () => ({
  generateDailyAiTasksForAccount: h.generateDailyAiTasksForAccount,
  loadAllAgentTaskPlansForDate: h.loadAllAgentTaskPlansForDate,
}));
vi.mock('@/lib/reports/agent-reports', () => ({
  getTodayDateString: () => '2026-11-25',
  loadAllAgentDailyReportsForDate: h.loadAllAgentDailyReportsForDate,
}));

import {
  runCrmIntelligenceScan,
  applyCrmRecommendation,
  updateRecommendationStatus,
} from './crm-intelligence';

function createIntelligenceMockDb() {
  let storedReport: unknown = null;
  const insertedRules: Record<string, unknown>[] = [];

  const db = {
    insertedRules,
    from: vi.fn((table: string) => {
      switch (table) {
        case 'meta_lead_logs':
          return {
            select: () => ({
              eq: () => ({
                order: () => ({
                  limit: () =>
                    Promise.resolve({
                      data: [
                        {
                          id: 'l-1',
                          full_name: 'Riya',
                          email: 'riya@example.com',
                          college: 'NIT Rourkela',
                          course: 'B.Sc Nursing',
                          campaign_name: 'Nursing Campaign',
                          form_name: 'Form A',
                          assigned_to: null,
                          lead_status: 'new',
                          whatsapp_sent: true,
                          notes: null,
                          created_at: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
                        },
                        {
                          id: 'l-2',
                          full_name: 'Aman',
                          email: 'aman@example.com',
                          college: 'NIT Rourkela',
                          course: 'B.Sc Nursing',
                          campaign_name: 'Nursing Campaign',
                          form_name: 'Form A',
                          assigned_to: null,
                          lead_status: 'interested',
                          whatsapp_sent: true,
                          notes: null,
                          created_at: new Date().toISOString(),
                        },
                      ],
                      error: null,
                    }),
                }),
              }),
            }),
          };
        case 'lead_assignment_rules':
          return {
            select: () => ({
              eq: () => ({
                eq: () => Promise.resolve({ data: [], error: null }),
              }),
            }),
            insert: (row: Record<string, unknown>) => {
              insertedRules.push(row);
              return Promise.resolve({ error: null });
            },
          };
        case 'conversations':
          return {
            select: () => ({
              eq: () => ({
                order: () => ({
                  limit: () =>
                    Promise.resolve({
                      data: [
                        {
                          id: 'conv-1',
                          status: 'open',
                          unread_count: 1,
                          assigned_agent_id: null,
                          last_inbound_at: new Date().toISOString(),
                          last_reply_at: null,
                          ai_autoreply_disabled: false,
                        },
                      ],
                      error: null,
                    }),
                }),
              }),
            }),
          };
        case 'messages':
          return {
            select: () => ({
              in: () => ({
                order: () => ({
                  limit: () =>
                    Promise.resolve({
                      data: [
                        {
                          sender_type: 'agent',
                          content_text: 'Hi',
                          status: 'failed',
                          error_code: 131031,
                          error_title: 'Business Account locked',
                          created_at: new Date().toISOString(),
                        },
                      ],
                      error: null,
                    }),
                }),
              }),
            }),
          };
        case 'deals':
          return {
            select: () => ({
              eq: () => ({
                limit: () => Promise.resolve({ data: [{ id: 'd-1', status: 'open' }], error: null }),
              }),
            }),
          };
        case 'profiles':
          return {
            select: () => ({
              eq: () =>
                Promise.resolve({
                  data: [
                    { user_id: 'u-1', full_name: 'Aarti', email: 'aarti@gems.edu', account_role: 'agent' },
                  ],
                  error: null,
                }),
            }),
          };
        case 'ai_knowledge_documents':
          return {
            select: () => ({
              eq: () => Promise.resolve({ count: 0, data: [], error: null }),
            }),
          };
        case 'flows':
        case 'automations':
          return {
            select: () => ({
              eq: () => ({
                eq: () => Promise.resolve({ count: 0, error: null }),
              }),
            }),
          };
        case 'ai_configs':
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: { is_active: true, auto_reply_enabled: true, api_key: 'enc' },
                    error: null,
                  }),
              }),
            }),
          };
        case 'whatsapp_config':
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: { id: 'wa-1' }, error: null }),
              }),
            }),
          };
        case 'custom_fields':
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: () =>
                    Promise.resolve({
                      data: storedReport ? { id: 'cf-1', field_options: storedReport } : null,
                      error: null,
                    }),
                }),
              }),
            }),
            insert: (row: { field_options: unknown }) => {
              storedReport = row.field_options;
              return Promise.resolve({ error: null });
            },
            update: (patch: { field_options: unknown }) => ({
              eq: () => {
                storedReport = patch.field_options;
                return Promise.resolve({ error: null });
              },
            }),
          };
        default:
          throw new Error(`Unexpected table: ${table}`);
      }
    }),
  } as unknown as SupabaseClient & { insertedRules: Record<string, unknown>[] };

  return db;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.loadAiConfig.mockResolvedValue(null);
  h.loadEmailConfig.mockResolvedValue({ apiKey: 'res', autoEmailEnabled: true });
  h.loadCounsellingPlaybooks.mockResolvedValue([]);
  h.loadAllAgentDailyReportsForDate.mockResolvedValue([]);
  h.loadAllAgentTaskPlansForDate.mockResolvedValue({});
  h.applyLeadAssignmentRules.mockResolvedValue({ assignedCount: 2, matchedLeads: [] });
});

describe('CRM-wide AI Intelligence engine', () => {
  it('scans the whole CRM and detects locks, unassigned leads, uncovered rules, and playbook gaps', async () => {
    const db = createIntelligenceMockDb();
    const report = await runCrmIntelligenceScan(db, 'acct-1', 'u-1');

    expect(report.snapshot.leads.total).toBe(2);
    expect(report.snapshot.leads.unassignedCount).toBe(2);
    expect(report.snapshot.leads.staleUncontactedCount).toBe(1);
    expect(report.snapshot.messaging.failedOutboundCount).toBe(1);

    const ids = report.recommendations.map((r) => r.id);
    expect(ids).toContain('rec-whatsapp-business-lock');
    expect(ids).toContain('rec-unassigned-leads');
    expect(ids).toContain('rec-counselling-top-course');
    expect(ids.some((id) => id.startsWith('rec-rule-course-'))).toBe(true);
  });

  it('applies a create_assignment_rule recommendation and logs it to learnedHistory', async () => {
    const db = createIntelligenceMockDb();
    const report = await runCrmIntelligenceScan(db, 'acct-1', 'u-1');
    const ruleRec = report.recommendations.find((r) => r.action.type === 'create_assignment_rule');
    expect(ruleRec).toBeDefined();

    const applied = await applyCrmRecommendation(db, 'acct-1', 'u-1', ruleRec!.id);
    expect(db.insertedRules).toHaveLength(1);
    expect(db.insertedRules[0].match_value).toBe('B.Sc Nursing');
    expect(applied.summary).toContain('B.Sc Nursing');
    expect(applied.report.learnedHistory.some((hItem) => hItem.includes('Applied'))).toBe(true);
  });

  it('dismisses and reopens recommendations cleanly', async () => {
    const db = createIntelligenceMockDb();
    const report = await runCrmIntelligenceScan(db, 'acct-1', 'u-1');
    const rec = report.recommendations[0];

    const dismissed = await updateRecommendationStatus(db, 'acct-1', 'u-1', rec.id, 'dismissed');
    expect(dismissed.recommendations.find((r) => r.id === rec.id)?.status).toBe('dismissed');

    const reopened = await updateRecommendationStatus(db, 'acct-1', 'u-1', rec.id, 'pending');
    expect(reopened.recommendations.find((r) => r.id === rec.id)?.status).toBe('pending');
  });
});
