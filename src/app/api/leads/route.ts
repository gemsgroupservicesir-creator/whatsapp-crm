import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { toErrorResponse } from '@/lib/auth/account';
import { fetchLeadFromMetaGraphApi, processIncomingLead, syncAllLeadsToPipeline, applyLeadAssignmentRules } from '@/lib/leads/meta-leads';
import { decrypt } from '@/lib/whatsapp/encryption';
import { parseLeadNotes, serializeLeadNotes, type LeadNote } from '@/lib/leads/notes';
import { sendLeadFollowUpEmail } from '@/lib/email/follow-up';
import { loadEmailConfig } from '@/lib/email/config';

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
    const campaign = url.searchParams.get('campaign');
    const agentId = url.searchParams.get('agentId');
    const search = url.searchParams.get('search')?.trim().toLowerCase();

    const isAgent = profile.account_role === 'agent';

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

    // 2. Fetch leads (Lockdown: regular agents ONLY see leads assigned to themselves)
    let query = admin
      .from('meta_lead_logs')
      .select('*')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false });

    if (isAgent) {
      // Agents strictly see ONLY leads assigned to them; other agents' leads are never returned
      query = query.eq('assigned_to', user.id);
    } else {
      if (tab === 'my') {
        query = query.eq('assigned_to', user.id);
      } else if (tab === 'unassigned') {
        query = query.is('assigned_to', null);
      } else if (agentId) {
        query = query.eq('assigned_to', agentId);
      }
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

    if (campaign && campaign !== 'all') {
      query = query.eq('campaign_name', campaign);
    }

    const { data: rawLeads, error: leadsError } = await query.limit(200);

    if (leadsError) {
      console.error('[GET /api/leads] query error:', leadsError);
      return NextResponse.json({ error: leadsError.message }, { status: 500 });
    }

    let leads = rawLeads || [];

    // In-memory text search over name, phone, email, college, course, form, campaign, ad
    if (search) {
      leads = leads.filter((l) => {
        const text = `${l.full_name || ''} ${l.phone || ''} ${l.email || ''} ${l.college || ''} ${l.course || ''} ${l.form_name || ''} ${l.campaign_name || ''} ${l.ad_name || ''}`.toLowerCase();
        return text.includes(search);
      });
    }

    // Attach assigned agent metadata
    const enrichedLeads = leads.map((l) => ({
      ...l,
      assigned_agent: l.assigned_to ? agentMap.get(l.assigned_to) || null : null,
    }));

    // 3. Stats for header cards (Lockdown: agent stats only include their own assigned leads)
    const { data: allAccountLeads } = await admin
      .from('meta_lead_logs')
      .select('id, assigned_to, lead_status, college, course, form_name, campaign_name')
      .eq('account_id', accountId);

    const all = allAccountLeads || [];
    const myLeadsList = all.filter((l) => l.assigned_to === user.id);
    const visibleLeadsForMeta = isAgent ? myLeadsList : all;

    const stats = isAgent
      ? {
          total: myLeadsList.length,
          myLeads: myLeadsList.length,
          unassigned: 0,
          converted: myLeadsList.filter((l) => l.lead_status === 'enrolled').length,
        }
      : {
          total: all.length,
          myLeads: myLeadsList.length,
          unassigned: all.filter((l) => !l.assigned_to).length,
          converted: all.filter((l) => l.lead_status === 'enrolled').length,
        };

    // Extract unique filter choices based on visible leads and active campaign rules
    const colleges = Array.from(new Set(visibleLeadsForMeta.map((l) => l.college).filter(Boolean))).sort();
    const courses = Array.from(new Set(visibleLeadsForMeta.map((l) => l.course).filter(Boolean))).sort();
    const forms = Array.from(new Set(visibleLeadsForMeta.map((l) => l.form_name).filter(Boolean))).sort();

    const { data: campaignRules } = await admin
      .from('lead_assignment_rules')
      .select('match_value')
      .eq('account_id', profile.account_id)
      .eq('criteria_type', 'campaign_name')
      .eq('is_active', true);

    const ruleCampaigns = (campaignRules || []).map((r) => r.match_value).filter(Boolean);
    const campaigns = Array.from(
      new Set([...all.map((l) => l.campaign_name).filter(Boolean), ...ruleCampaigns])
    ).sort();
    const visibleAgents = isAgent ? agents.filter((a) => a.userId === user.id) : agents;

    return NextResponse.json({
      leads: enrichedLeads,
      stats,
      agents: visibleAgents,
      colleges,
      courses,
      forms,
      campaigns,
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
      .select('account_id, account_role, full_name')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!profile?.account_id) {
      return NextResponse.json({ error: 'No active workspace found' }, { status: 400 });
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: 'Request body required' }, { status: 400 });
    }

    // Support syncing all leads into pipeline deals
    if (body.action === 'sync_pipeline') {
      const syncedCount = await syncAllLeadsToPipeline(admin, profile.account_id);
      return NextResponse.json({ success: true, syncedCount });
    }

    // Support applying auto-assignment rules to unassigned leads
    if (body.action === 'apply_rules') {
      if (profile.account_role !== 'owner' && profile.account_role !== 'admin') {
        return NextResponse.json({ error: 'Only admins can run auto-assignment rules' }, { status: 403 });
      }
      const applyResult = await applyLeadAssignmentRules(
        admin,
        profile.account_id,
        body.onlyUnassigned !== false
      );
      return NextResponse.json({ success: true, ...applyResult });
    }

    if (!body.id) {
      return NextResponse.json({ error: 'Lead id is required' }, { status: 400 });
    }

    const leadId = String(body.id);
    const isAgent = profile.account_role === 'agent';

    if (isAgent) {
      if ('assigned_to' in body) {
        return NextResponse.json({ error: 'Permission denied: agents cannot reassign leads' }, { status: 403 });
      }

      const { data: targetLead } = await admin
        .from('meta_lead_logs')
        .select('assigned_to')
        .eq('id', leadId)
        .eq('account_id', profile.account_id)
        .maybeSingle();

      if (!targetLead || targetLead.assigned_to !== user.id) {
        return NextResponse.json(
          { error: 'Permission denied: you can only update leads assigned to you' },
          { status: 403 }
        );
      }
    }

    // Support re-fetching lead details from Meta Graph API when a valid token is provided
    if (body.action === 'retry_fetch') {
      const { data: lead } = await admin
        .from('meta_lead_logs')
        .select('*')
        .eq('id', leadId)
        .eq('account_id', profile.account_id)
        .maybeSingle();

      if (!lead || !lead.leadgen_id) {
        return NextResponse.json({ error: 'Leadgen ID not found on this lead record' }, { status: 400 });
      }

      let pageAccessToken: string | null = null;
      const { data: leadCfg } = await admin
        .from('meta_lead_configs')
        .select('page_access_token')
        .eq('account_id', profile.account_id)
        .maybeSingle();

      if (leadCfg?.page_access_token) {
        pageAccessToken = leadCfg.page_access_token;
      } else {
        const { data: waCfg } = await admin
          .from('whatsapp_config')
          .select('access_token')
          .eq('account_id', profile.account_id)
          .maybeSingle();

        if (waCfg?.access_token) {
          try {
            pageAccessToken = decrypt(waCfg.access_token);
          } catch {
            // Ignore decrypt errors
          }
        }
      }

      if (!pageAccessToken) {
        return NextResponse.json(
          { error: 'No Meta Access Token configured. Please update your token in Settings → Meta Leads.' },
          { status: 400 }
        );
      }

      const leadData = await fetchLeadFromMetaGraphApi(lead.leadgen_id, pageAccessToken);
      if (!leadData) {
        return NextResponse.json(
          {
            error:
              'Meta Graph API rejected the token or the lead could not be fetched. Please make sure the token is active and has leads_retrieval permission.',
          },
          { status: 400 }
        );
      }

      if (!leadData.phone) {
        return NextResponse.json(
          {
            error:
              'Lead details were fetched from Meta, but no phone number or WhatsApp number was found in the submitted form fields.',
          },
          { status: 400 }
        );
      }

      const result = await processIncomingLead(profile.account_id, leadData);
      // Clean up placeholder token_required row
      await admin.from('meta_lead_logs').delete().eq('id', leadId);

      return NextResponse.json({ success: true, processed: true, result });
    }

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

    // Support appending a new note object (Counselor Note or AI Agent Note)
    if (body.new_note && typeof body.new_note === 'object' && body.new_note.text) {
      const noteText = String(body.new_note.text).trim();
      if (noteText) {
        const { data: currentLead } = await admin
          .from('meta_lead_logs')
          .select('notes')
          .eq('id', leadId)
          .eq('account_id', profile.account_id)
          .maybeSingle();

        const existingNotes = parseLeadNotes(currentLead?.notes);
        const newNote: LeadNote = {
          id: crypto.randomUUID(),
          text: noteText,
          author_name: String(body.new_note.author_name || profile.full_name || 'Counselor'),
          author_type: (body.new_note.author_type || 'counselor') as 'counselor' | 'ai_agent' | 'system',
          created_at: new Date().toISOString(),
        };
        updates.notes = serializeLeadNotes([...existingNotes, newNote]);
      }
    } else if (Array.isArray(body.notes)) {
      updates.notes = serializeLeadNotes(parseLeadNotes(body.notes));
    } else if (typeof body.notes === 'string') {
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

    // Sync deal title & assignee if updated
    if (updatedLead.contact_id) {
      let assignedProfileId: string | null = null;
      if (updatedLead.assigned_to) {
        const { data: prof } = await admin
          .from('profiles')
          .select('id')
          .eq('user_id', updatedLead.assigned_to)
          .maybeSingle();
        assignedProfileId = prof?.id || null;
      }

      const dest = updatedLead.college ? updatedLead.college.replace(/_/g, ' ').toUpperCase() : '';
      const crse = updatedLead.course ? updatedLead.course.trim() : '';
      const detail = [dest, crse].filter(Boolean).join(' • ');
      const dealTitle = detail ? `${updatedLead.full_name} • ${detail}` : `${updatedLead.full_name} • Study Inquiry`;

      await admin
        .from('deals')
        .update({
          title: dealTitle,
          assigned_to: assignedProfileId,
          updated_at: new Date().toISOString(),
        })
        .eq('account_id', profile.account_id)
        .eq('contact_id', updatedLead.contact_id);
    }

    let followUpEmailResult: { sent: boolean; id?: string; subject?: string } | null = null;
    const isAddingNewNote = Boolean(body.new_note && typeof body.new_note === 'object' && body.new_note.text);

    if (isAddingNewNote && updatedLead.email && updatedLead.email.includes('@')) {
      const emailConfig = await loadEmailConfig(admin, profile.account_id);
      const shouldSend =
        Boolean(body.send_follow_up_email) ||
        (Boolean(emailConfig?.autoFollowUpOnNote) && body.send_follow_up_email !== false);

      if (shouldSend) {
        try {
          const res = await sendLeadFollowUpEmail({
            admin,
            accountId: profile.account_id,
            leadId: updatedLead.id,
            currentUserId: user.id,
            latestNoteText: String(body.new_note.text).trim(),
            customSubject: body.custom_email_subject,
          });

          if (res.success && res.emailSent) {
            followUpEmailResult = { sent: true, id: res.id, subject: res.subject };
            if (res.updatedNotes) {
              updatedLead.notes = serializeLeadNotes(res.updatedNotes);
            }
          }
        } catch (emailErr) {
          console.error('[LeadsRoute] Auto follow-up email dispatch error:', emailErr);
        }
      }
    }

    return NextResponse.json({
      success: true,
      lead: updatedLead,
      parsed_notes: parseLeadNotes(updatedLead.notes),
      follow_up_email: followUpEmailResult,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * DELETE /api/leads
 * Deletes one or multiple lead logs from meta_lead_logs.
 * Supports:
 * - Query param: ?id=<leadId>
 * - Query param: ?all=true (admin only)
 * - JSON body: { id: string } or { ids: string[] }
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

    const url = new URL(request.url);
    const queryId = url.searchParams.get('id');
    const queryAll = url.searchParams.get('all') === 'true';

    let leadIds: string[] = [];
    if (queryId) {
      leadIds = [queryId];
    } else if (request.headers.get('content-type')?.includes('application/json')) {
      const body = await request.json().catch(() => null);
      if (body?.id) {
        leadIds = [String(body.id)];
      } else if (Array.isArray(body?.ids)) {
        leadIds = body.ids.map(String);
      }
    }

    if (queryAll) {
      if (profile.account_role !== 'owner' && profile.account_role !== 'admin') {
        return NextResponse.json({ error: 'Only admins can delete all leads' }, { status: 403 });
      }

      const { error: delAllErr } = await admin
        .from('meta_lead_logs')
        .delete()
        .eq('account_id', profile.account_id);

      if (delAllErr) {
        return NextResponse.json({ error: delAllErr.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, message: 'All leads deleted successfully' });
    }

    if (leadIds.length === 0) {
      return NextResponse.json({ error: 'Lead id is required' }, { status: 400 });
    }

    // Role check: Only Admins and Owners can delete leads
    if (profile.account_role !== 'owner' && profile.account_role !== 'admin') {
      return NextResponse.json(
        { error: 'Permission denied: only admins or owners can delete leads' },
        { status: 403 }
      );
    }

    const { error: deleteError } = await admin
      .from('meta_lead_logs')
      .delete()
      .in('id', leadIds)
      .eq('account_id', profile.account_id);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Lead deleted successfully' });
  } catch (err) {
    return toErrorResponse(err);
  }
}

