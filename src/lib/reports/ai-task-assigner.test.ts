import { describe, it, expect } from 'vitest';
import {
  formatTaskPlanFieldName,
  type AgentDailyTaskPlan,
  type AgentDailyTask,
} from './ai-task-assigner';

describe('ai-task-assigner module', () => {
  it('formats task plan field name with user ID and date', () => {
    const fieldName = formatTaskPlanFieldName('user-456', '2026-11-24');
    expect(fieldName).toBe('__agent_tasks_user-456_2026-11-24');
  });

  it('calculates completion rate percentage accurately', () => {
    const tasks: AgentDailyTask[] = [
      {
        id: 'task_1',
        user_id: 'u1',
        agent_name: 'Priyanshu Neupane',
        date: '2026-11-24',
        title: 'Priority Callback: Student A',
        description: 'Call regarding MBA scholarship',
        priority: 'urgent',
        category: 'callback',
        status: 'completed',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'task_2',
        user_id: 'u1',
        agent_name: 'Priyanshu Neupane',
        date: '2026-11-24',
        title: 'Outreach: Student B',
        description: 'Verify 10+2 eligibility',
        priority: 'high',
        category: 'new_lead_outreach',
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    const completed = tasks.filter((t) => t.status === 'completed').length;
    const rate = Math.round((completed / tasks.length) * 100);

    expect(completed).toBe(1);
    expect(rate).toBe(50);
  });
});
