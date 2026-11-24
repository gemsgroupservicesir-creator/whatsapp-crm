import { describe, it, expect } from 'vitest';
import {
  formatReportFieldName,
  getTodayDateString,
  createDefaultAgentDailyReport,
  getDateRangeList,
  buildDailyAttendanceRegister,
  generateAttendanceCsv,
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

  it('generates a descending list of dates within range', () => {
    const dates = getDateRangeList('2026-11-20', '2026-11-24');
    expect(dates).toEqual([
      '2026-11-24',
      '2026-11-23',
      '2026-11-22',
      '2026-11-21',
      '2026-11-20',
    ]);
  });

  it('builds attendance register accurately with present and absent members', () => {
    const members = [
      { userId: 'u1', fullName: 'Mamata Yadav', email: 'mamata@gems.com', role: 'agent' },
      { userId: 'u2', fullName: 'Priyanshu Neupane', email: 'priyanshu@gems.com', role: 'agent' },
    ];

    const reports = [
      {
        ...createDefaultAgentDailyReport('acc-1', 'u1', 'Mamata Yadav', 'mamata@gems.com', 'agent', '2026-11-24'),
        clock_in_at: '2026-11-24T09:15:00.000Z',
        clock_out_at: '2026-11-24T18:00:00.000Z',
        session_status: 'clocked_out' as const,
        total_working_minutes: 525,
      },
    ];

    const { records, summary } = buildDailyAttendanceRegister(members, reports, ['2026-11-24']);
    expect(records.length).toBe(2);

    const mamata = records.find((r) => r.user_id === 'u1')!;
    expect(mamata.status).toBe('present_completed');
    expect(mamata.total_working_minutes).toBe(525);

    const priyanshu = records.find((r) => r.user_id === 'u2')!;
    expect(priyanshu.clock_in_at).toBeNull();

    expect(summary.totalWorkMinutes).toBe(525);
    expect(summary.totalPresentDays).toBe(1);
  });

  it('generates valid CSV format for attendance export', () => {
    const records = [
      {
        id: 'u1_2026-11-24',
        date: '2026-11-24',
        user_id: 'u1',
        user_name: 'Mamata Yadav',
        user_email: 'mamata@gems.com',
        user_role: 'agent',
        status: 'present_completed' as const,
        clock_in_at: '2026-11-24T09:15:00.000Z',
        clock_out_at: '2026-11-24T18:00:00.000Z',
        total_working_minutes: 525,
        work_location: 'office' as const,
        has_work_of_the_day: true,
        has_work_done_report: true,
        notes_count: 5,
        admin_status: 'approved' as const,
      },
    ];

    const csv = generateAttendanceCsv(records);
    expect(csv).toContain('Date,Agent Name,Email');
    expect(csv).toContain('"Mamata Yadav"');
    expect(csv).toContain('"2026-11-24"');
  });
});
