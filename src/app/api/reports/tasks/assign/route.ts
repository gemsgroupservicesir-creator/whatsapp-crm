import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';
import {
  generateDailyAiTasksForAccount,
} from '@/lib/reports/ai-task-assigner';
import { getTodayDateString } from '@/lib/reports/agent-reports';

export async function POST(req: NextRequest) {
  try {
    const ctx = await getCurrentAccount();
    const body = await req.json().catch(() => ({}));

    const date = body.date || getTodayDateString();
    const isAdmin = ctx.role === 'owner' || ctx.role === 'admin';

    // If caller is non-admin, they can only generate for themselves
    let targetAgentId = body.agentId;
    if (!isAdmin) {
      targetAgentId = ctx.userId;
    }

    const plans = await generateDailyAiTasksForAccount(
      ctx.supabase,
      ctx.accountId,
      date,
      targetAgentId
    );

    const planValues = Object.values(plans);
    const totalTasks = planValues.reduce((sum, p) => sum + p.tasks.length, 0);

    return NextResponse.json({
      success: true,
      message: `AI successfully generated and assigned ${totalTasks} daily tasks across ${planValues.length} agents.`,
      count: totalTasks,
      agentCount: planValues.length,
      plans,
      date,
    });
  } catch (err) {
    console.error('[POST /api/reports/tasks/assign] error:', err);
    return toErrorResponse(err);
  }
}
