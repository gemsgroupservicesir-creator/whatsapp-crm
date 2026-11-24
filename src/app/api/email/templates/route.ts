import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { toErrorResponse } from '@/lib/auth/account';
import {
  loadEmailTemplates,
  saveEmailTemplates,
  DEFAULT_EMAIL_TEMPLATES,
  type EmailTemplate,
} from '@/lib/email/templates';

export const dynamic = 'force-dynamic';

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * GET /api/email/templates
 * Returns all custom and starter email templates for the active workspace.
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
      .select('account_id, account_role, full_name, email')
      .eq('user_id', user.id)
      .maybeSingle();

    let effectiveAccountId = profile?.account_id;

    if (!effectiveAccountId) {
      const { data: owned } = await admin
        .from('accounts')
        .select('id')
        .eq('owner_user_id', user.id)
        .limit(1)
        .maybeSingle();
      if (owned?.id) effectiveAccountId = owned.id;
    }

    if (!effectiveAccountId) {
      const { data: member } = await admin
        .from('account_members')
        .select('account_id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();
      if (member?.account_id) effectiveAccountId = member.account_id;
    }

    if (!effectiveAccountId) {
      const { data: anyAcc } = await admin
        .from('accounts')
        .select('id')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (anyAcc?.id) effectiveAccountId = anyAcc.id;
    }

    if (!effectiveAccountId) {
      return NextResponse.json({ error: 'No active workspace found' }, { status: 400 });
    }

    const templates = await loadEmailTemplates(admin, effectiveAccountId);

    return NextResponse.json({
      success: true,
      templates: templates || DEFAULT_EMAIL_TEMPLATES,
      count: templates.length,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * POST /api/email/templates
 * Creates or updates an email template in the workspace.
 * Body can be a single template { template: EmailTemplate } or bulk { templates: EmailTemplate[] }.
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

    const body = await request.json().catch(() => ({}));
    let effectiveAccountId = body.accountId || profile?.account_id;

    if (!effectiveAccountId) {
      const { data: owned } = await admin
        .from('accounts')
        .select('id')
        .eq('owner_user_id', user.id)
        .limit(1)
        .maybeSingle();
      if (owned?.id) effectiveAccountId = owned.id;
    }

    if (!effectiveAccountId) {
      return NextResponse.json({ error: 'No active workspace found' }, { status: 400 });
    }

    const currentTemplates = await loadEmailTemplates(admin, effectiveAccountId);

    if (Array.isArray(body.templates)) {
      // Bulk update
      await saveEmailTemplates(admin, effectiveAccountId, user.id, body.templates);
      return NextResponse.json({ success: true, count: body.templates.length });
    }

    const item: Partial<EmailTemplate> = body.template || body;

    if (!item.name || !item.subject || !item.bodyHtml) {
      return NextResponse.json(
        { error: 'Template name, subject line, and HTML body are required.' },
        { status: 400 }
      );
    }

    const templateId = item.id || `tmpl-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const newTemplate: EmailTemplate = {
      id: templateId,
      name: item.name.trim(),
      category: item.category || 'general',
      subject: item.subject.trim(),
      bodyHtml: item.bodyHtml.trim(),
      bodyText: item.bodyText?.trim(),
      description: item.description?.trim(),
      isDefault: Boolean(item.isDefault),
      variables: Array.isArray(item.variables) ? item.variables : [],
      created_at: item.created_at || now,
      updated_at: now,
    };

    // If marked default for category, unset other defaults in same category
    let updatedList = currentTemplates.map((t) => {
      if (newTemplate.isDefault && t.category === newTemplate.category && t.id !== templateId) {
        return { ...t, isDefault: false };
      }
      return t;
    });

    const existingIdx = updatedList.findIndex((t) => t.id === templateId);
    if (existingIdx >= 0) {
      updatedList[existingIdx] = newTemplate;
    } else {
      updatedList.push(newTemplate);
    }

    await saveEmailTemplates(admin, effectiveAccountId, user.id, updatedList);

    return NextResponse.json({
      success: true,
      template: newTemplate,
      templates: updatedList,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * DELETE /api/email/templates?id=<templateId>
 * Deletes a template by ID.
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

    const { searchParams } = new URL(request.url);
    const templateId = searchParams.get('id');

    if (!templateId) {
      return NextResponse.json({ error: 'id parameter is required' }, { status: 400 });
    }

    const admin = getAdminClient();
    const { data: profile } = await admin
      .from('profiles')
      .select('account_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!profile?.account_id) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 400 });
    }

    const currentTemplates = await loadEmailTemplates(admin, profile.account_id);
    const updatedList = currentTemplates.filter((t) => t.id !== templateId);

    await saveEmailTemplates(admin, profile.account_id, user.id, updatedList);

    return NextResponse.json({
      success: true,
      deletedId: templateId,
      templates: updatedList,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
