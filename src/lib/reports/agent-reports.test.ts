import { describe, it, expect } from 'vitest';
import {
  formatReportFieldName,
  getTodayDateString,
  createDefaultAgentDailyReport,
} from './agent-reports';

describe('agent-reports module', () => {
  it('formats custom field name correctly with userId and date', () => {
    const fieldName = formatReportFieldName('user-123', '2026-11-24');
    expect(fieldName).toBe('__agent_report_user-123_2026-11-24');
  });

  it('produces valid YYYY-MM-DD for today', () => {
    const today = getTodayDateString();
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('creates default daily report with empty metrics and not_started status', () => {
    const report = createDefaultAgentDailyReport(
      'acc-1',
      'user-1',
      'Priyanshu Neupane',
      'priyanshu@gems.com',
      'agent',
      '2026-11-24'
    );

    expect(report.account_id).toBe('acc-1');
    expect(report.user_id).toBe('user-1');
    expect(report.user_name).toBe('Priyanshu Neupane');
    expect(report.date).toBe('2026-11-24');
    expect(report.session_status).toBe('not_started');
    expect(report.clock_in_at).toBeNull();
    expect(report.clock_out_at).toBeNull();
    expect(report.work_of_the_day).toBeNull();
    expect(report.work_done_report).toBeNull();
    expect(report.admin_review).toBeNull();
    expect(report.system_metrics.notes_added_count).toBe(0);
  });
});
