import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';
import {
  loadAgentTaskPlan,
  loadAllAgentTaskPlansForDate,
  saveAgentTaskPlan,
  updateAgentTaskStatus,
  type AgentDailyTask,
} from '@/lib/reports/ai-task-assigner';
import { getTodayDateString } from '@/lib/reports/agent-reports';

export async function GET(req: NextRequest) {
  try {
    const ctx = await getCurrentAccount();
    const { searchParams } = new URL(req.url);

    const date = searchParams.get('date') || getTodayDateString();
    const requestedAgentId = searchParams.get('agentId') || ctx.userId;

    const isAdmin = ctx.role === 'owner' || ctx.role === 'admin';

    // If admin requests 'all', return plans for all agents
    if (isAdmin && requestedAgentId === 'all') {
      const allPlans = await loadAllAgentTaskPlansForDate(ctx.supabase, ctx.accountId, date);
      return NextResponse.json({
        date,
        allPlans,
        isAdmin,
      });
    }

    // Single agent plan
    const targetUserId = isAdmin ? requestedAgentId : ctx.userId;
    const plan = await loadAgentTaskPlan(ctx.supabase, ctx.accountId, targetUserId, date);

    return NextResponse.json({
      date,
      plan,
      isAdmin,
    });
  } catch (err) {
    console.error('[GET /api/reports/tasks] error:', err);
    return toErrorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await getCurrentAccount();
    const body = await req.json();

    const {
      action = 'update_status',
      taskId,
      status,
      date = getTodayDateString(),
      agentId,
      customTask,
    } = body;

    const isAdmin = ctx.role === 'owner' || ctx.role === 'admin';
    const targetUserId = isAdmin && agentId ? agentId : ctx.userId;

    if (action === 'update_status') {
      if (!taskId || !status) {
        return NextResponse.json(
          { error: 'taskId and status are required' },
          { status: 400 }
        );
      }

      const updatedPlan = await updateAgentTaskStatus(
        ctx.supabase,
        ctx.accountId,
        targetUserId,
        date,
        taskId,
        status
      );

      return NextResponse.json({
        success: true,
        plan: updatedPlan,
      });
    }

    if (action === 'add_custom_task') {
      if (!customTask || !customTask.title) {
        return NextResponse.json(
          { error: 'Task title is required' },
          { status: 400 }
        );
      }

      const plan = await loadAgentTaskPlan(ctx.supabase, ctx.accountId, targetUserId, date);
      if (!plan) {
        return NextResponse.json(
          { error: 'No active task plan found for this date. Generate tasks first.' },
          { status: 404 }
        );
      }

      const newTask: AgentDailyTask = {
        id: `task_custom_${Date.now()}`,
        user_id: targetUserId,
        agent_name: plan.agent_name,
        date,
        title: customTask.title.trim(),
        description: (customTask.description || '').trim(),
        priority: customTask.priority || 'medium',
        category: customTask.category || 'general',
        status: 'pending',
        due_time: customTask.due_time || 'By 5:00 PM',
        ai_rationale: 'Task added manually by counselor or admin.',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      plan.tasks.unshift(newTask);
      await saveAgentTaskPlan(ctx.supabase, ctx.accountId, targetUserId, plan);

      return NextResponse.json({
        success: true,
        plan,
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    console.error('[POST /api/reports/tasks] error:', err);
    return toErrorResponse(err);
  }
}
