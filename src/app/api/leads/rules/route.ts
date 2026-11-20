import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { toErrorResponse } from '@/lib/auth/account';

export const dynamic = 'force-dynamic';

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * GET /api/leads/rules
 * Returns all lead auto-assignment rules for the current workspace.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = getAdminClient();
    const { data: profile } = await admin
      .from('profiles')
      .select('account_id, account_role')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!profile?.account_id) {
      return NextResponse.json({ error: 'No active workspace found' }, { status: 400 });
    }

    const accountId = profile.account_id;

    // Fetch rules
    const { data: rules, error: rulesError } = await admin
      .from('lead_assignment_rules')
      .select('*')
      .eq('account_id', accountId)
      .order('priority', { ascending: true })
      .order('created_at', { ascending: true });

    if (rulesError) {
      return NextResponse.json({ error: rulesError.message }, { status: 500 });
    }

    // Fetch team members/agents to join names
    const { data: teamProfiles } = await admin
      .from('profiles')
      .select('user_id, full_name, email, account_role')
      .eq('account_id', accountId);

    const agentMap = new Map((teamProfiles || []).map((p) => [p.user_id, p]));

    const enrichedRules = (rules || []).map((r) => ({
      ...r,
      agent: agentMap.get(r.assign_to_user_id) || null,
    }));

    return NextResponse.json({ rules: enrichedRules });
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * POST /api/leads/rules
 * Creates a new lead auto-assignment rule.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = getAdminClient();
    const { data: profile } = await admin
      .from('profiles')
      .select('account_id, account_role')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!profile?.account_id) {
      return NextResponse.json({ error: 'No active workspace found' }, { status: 400 });
    }

    if (profile.account_role !== 'owner' && profile.account_role !== 'admin') {
      return NextResponse.json({ error: 'Only admins can manage assignment rules' }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const name = String(body.name || '').trim();
    const criteriaType = String(body.criteria_type || 'college'); // 'college' | 'course' | 'form_name' | 'any'
    const operator = String(body.operator || 'contains'); // 'contains' | 'equals' | 'starts_with' | 'ends_with'
    const matchValue = String(body.match_value || '').trim();
    const assignToUserId = String(body.assign_to_user_id || '').trim();
    const priority = typeof body.priority === 'number' ? body.priority : 0;
    const isActive = body.is_active !== false;

    if (!name || !matchValue || !assignToUserId) {
      return NextResponse.json(
        { error: 'Name, match value, and assigned agent are required' },
        { status: 400 }
      );
    }

    const { data: newRule, error: insertError } = await admin
      .from('lead_assignment_rules')
      .insert({
        account_id: profile.account_id,
        name,
        criteria_type: criteriaType,
        operator,
        match_value: matchValue,
        assign_to_user_id: assignToUserId,
        priority,
        is_active: isActive,
      })
      .select('*')
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, rule: newRule });
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * PATCH /api/leads/rules
 * Updates an auto-assignment rule.
 */
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = getAdminClient();
    const { data: profile } = await admin
      .from('profiles')
      .select('account_id, account_role')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!profile?.account_id) {
      return NextResponse.json({ error: 'No active workspace found' }, { status: 400 });
    }

    if (profile.account_role !== 'owner' && profile.account_role !== 'admin') {
      return NextResponse.json({ error: 'Only admins can manage assignment rules' }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    if (!body?.id) {
      return NextResponse.json({ error: 'Rule id is required' }, { status: 400 });
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if ('name' in body) updates.name = String(body.name).trim();
    if ('criteria_type' in body) updates.criteria_type = body.criteria_type;
    if ('operator' in body) updates.operator = body.operator;
    if ('match_value' in body) updates.match_value = String(body.match_value).trim();
    if ('assign_to_user_id' in body) updates.assign_to_user_id = body.assign_to_user_id;
    if ('priority' in body) updates.priority = body.priority;
    if ('is_active' in body) updates.is_active = Boolean(body.is_active);

    const { data: updatedRule, error: updateError } = await admin
      .from('lead_assignment_rules')
      .update(updates)
      .eq('id', body.id)
      .eq('account_id', profile.account_id)
      .select('*')
      .maybeSingle();

    if (updateError || !updatedRule) {
      return NextResponse.json({ error: updateError?.message || 'Rule not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, rule: updatedRule });
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * DELETE /api/leads/rules?id={ruleId}
 * Deletes an auto-assignment rule.
 */
export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = getAdminClient();
    const { data: profile } = await admin
      .from('profiles')
      .select('account_id, account_role')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!profile?.account_id) {
      return NextResponse.json({ error: 'No active workspace found' }, { status: 400 });
    }

    if (profile.account_role !== 'owner' && profile.account_role !== 'admin') {
      return NextResponse.json({ error: 'Only admins can manage assignment rules' }, { status: 403 });
    }

    const url = new URL(request.url);
    const ruleId = url.searchParams.get('id');

    if (!ruleId) {
      return NextResponse.json({ error: 'Rule id is required' }, { status: 400 });
    }

    const { error: deleteError } = await admin
      .from('lead_assignment_rules')
      .delete()
      .eq('id', ruleId)
      .eq('account_id', profile.account_id);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
