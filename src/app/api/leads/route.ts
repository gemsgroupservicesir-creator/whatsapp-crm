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
 * GET /api/leads
 * Returns workspace leads with agent assignments, metrics, and filters.
 */
export async function GET(request: Request) {
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
      .select('account_id, account_role, full_name')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!profile?.account_id) {
      return NextResponse.json({ error: 'No active workspace found' }, { status: 400 });
    }

    const accountId = profile.account_id;
    const url = new URL(request.url);
    const tab = url.searchParams.get('tab') || 'all'; // 'all' | 'my' | 'unassigned'
    const status = url.searchParams.get('status');
    const college = url.searchParams.get('college');
    const course = url.searchParams.get('course');
    const agentId = url.searchParams.get('agentId');
    const search = url.searchParams.get('search')?.trim().toLowerCase();

    // 1. Fetch team members/agents for assignment dropdown
    const { data: teamProfiles } = await admin
      .from('profiles')
      .select('user_id, full_name, email, account_role')
      .eq('account_id', accountId)
      .order('full_name', { ascending: true });

    const agents = (teamProfiles || []).map((p) => ({
      userId: p.user_id,
      fullName: p.full_name || p.email || 'Agent',
      email: p.email,
      role: p.account_role,
    }));

    const agentMap = new Map(agents.map((a) => [a.userId, a]));

    // 2. Fetch leads
    let query = admin
      .from('meta_lead_logs')
      .select('*')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false });

    if (tab === 'my') {
      query = query.eq('assigned_to', user.id);
    } else if (tab === 'unassigned') {
      query = query.is('assigned_to', null);
    } else if (agentId) {
      query = query.eq('assigned_to', agentId);
    }

    if (status && status !== 'all') {
      query = query.eq('lead_status', status);
    }

    if (college && college !== 'all') {
      query = query.eq('college', college);
    }

    if (course && course !== 'all') {
      query = query.eq('course', course);
    }

    const { data: rawLeads, error: leadsError } = await query.limit(200);

    if (leadsError) {
      console.error('[GET /api/leads] query error:', leadsError);
      return NextResponse.json({ error: leadsError.message }, { status: 500 });
    }

    let leads = rawLeads || [];

    // In-memory text search over name, phone, email, college, course, form
    if (search) {
      leads = leads.filter((l) => {
        const text = `${l.full_name || ''} ${l.phone || ''} ${l.email || ''} ${l.college || ''} ${l.course || ''} ${l.form_name || ''}`.toLowerCase();
        return text.includes(search);
      });
    }

    // Attach assigned agent metadata
    const enrichedLeads = leads.map((l) => ({
      ...l,
      assigned_agent: l.assigned_to ? agentMap.get(l.assigned_to) || null : null,
    }));

    // 3. Stats for header cards
    const { data: allAccountLeads } = await admin
      .from('meta_lead_logs')
      .select('id, assigned_to, lead_status, college, course, form_name')
      .eq('account_id', accountId);

    const all = allAccountLeads || [];
    const stats = {
      total: all.length,
      myLeads: all.filter((l) => l.assigned_to === user.id).length,
      unassigned: all.filter((l) => !l.assigned_to).length,
      converted: all.filter((l) => l.lead_status === 'enrolled').length,
    };

    // Extract unique filter choices
    const colleges = Array.from(new Set(all.map((l) => l.college).filter(Boolean))).sort();
    const courses = Array.from(new Set(all.map((l) => l.course).filter(Boolean))).sort();
    const forms = Array.from(new Set(all.map((l) => l.form_name).filter(Boolean))).sort();

    return NextResponse.json({
      leads: enrichedLeads,
      stats,
      agents,
      colleges,
      courses,
      forms,
      currentUserId: user.id,
      userRole: profile.account_role,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * PATCH /api/leads
 * Updates a lead's assignment, status, or notes.
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

    const body = await request.json().catch(() => null);
    if (!body || !body.id) {
      return NextResponse.json({ error: 'Lead id is required' }, { status: 400 });
    }

    const leadId = String(body.id);
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if ('assigned_to' in body) {
      updates.assigned_to = body.assigned_to || null;
      updates.assigned_at = body.assigned_to ? new Date().toISOString() : null;
    }

    if (typeof body.lead_status === 'string') {
      updates.lead_status = body.lead_status;
    }

    if (typeof body.notes === 'string') {
      updates.notes = body.notes;
    }

    if (typeof body.college === 'string') {
      updates.college = body.college.trim();
    }

    if (typeof body.course === 'string') {
      updates.course = body.course.trim();
    }

    const { data: updatedLead, error: updateError } = await admin
      .from('meta_lead_logs')
      .update(updates)
      .eq('id', leadId)
      .eq('account_id', profile.account_id)
      .select('*')
      .maybeSingle();

    if (updateError || !updatedLead) {
      return NextResponse.json({ error: updateError?.message || 'Lead not found' }, { status: 404 });
    }

    // Sync conversation assignment if assigned_to changed
    if ('assigned_to' in body && updatedLead.conversation_id) {
      await admin
        .from('conversations')
        .update({ assigned_agent_id: body.assigned_to || null })
        .eq('id', updatedLead.conversation_id);
    }

    return NextResponse.json({ success: true, lead: updatedLead });
  } catch (err) {
    return toErrorResponse(err);
  }
}
