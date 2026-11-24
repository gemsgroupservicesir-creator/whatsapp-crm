import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { toErrorResponse } from '@/lib/auth/account';
import { loadAiConfig } from '@/lib/ai/config';
import { generateGemini } from '@/lib/ai/providers/gemini';
import { SUPPORTED_TEMPLATE_VARIABLES } from '@/lib/email/templates';

export const dynamic = 'force-dynamic';

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * POST /api/email/templates/ai-generate
 *
 * Uses Gemini AI to draft a complete, production-ready, responsive HTML
 * email template based on a natural language prompt and desired category.
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
      .select('account_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!profile?.account_id) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const userPrompt = String(body.prompt || '').trim();
    const category = String(body.category || 'general').trim();

    if (!userPrompt) {
      return NextResponse.json({ error: 'A prompt describing what template to generate is required.' }, { status: 400 });
    }

    const aiConfig = await loadAiConfig(admin, profile.account_id).catch(() => null);
    const apiKey = aiConfig?.apiKey || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: 'Gemini AI is not configured for this workspace. Please add your Gemini API key in Settings.' },
        { status: 400 }
      );
    }

    const variablesList = SUPPORTED_TEMPLATE_VARIABLES.map(
      (v) => `${v.tag} — ${v.description}`
    ).join('\n');

    const systemPrompt = `You are an expert Educational Admissions Copywriter and Email Designer at GEMS Education.
You design high-converting, professional, and visually engaging HTML email templates for college and university admissions in Nepal & India.
Your templates are responsive, mobile-friendly, and use inline CSS styles for high deliverability.`;

    const modelPrompt = `Design a complete, responsive HTML email template based on this instruction:
"${userPrompt}"

Category: ${category}

AVAILABLE DYNAMIC VARIABLES (USE THEM NATURALLY IN SUBJECT AND HTML):
${variablesList}

CRITICAL DESIGN GUIDELINES:
1. Subject line: Catchy, professional, and relevant (incorporating {{course}} or {{college}} where appropriate).
2. HTML Body:
   - Centered container max-width 600px, background #ffffff, border #e2e8f0, border-radius 12px.
   - Header: Gradient banner with GEMS Education Admissions branding.
   - Content: Professional typography (system font stack), clear paragraphs, feature boxes, and bullet lists.
   - Counselor Card: Showing {{counselor}} with WhatsApp button (<a href="{{wa_link}}" class="btn-wa">...</a>).
   - Footer: Admissions contact details with {{counselor_phone}}.
   - Valid inline CSS.

OUTPUT FORMAT:
Return valid JSON only (do NOT include markdown code fences or anything outside the JSON object):
{
  "name": "Template Name (e.g. B.Tech Merit Scholarship Guide)",
  "category": "${category}",
  "subject": "Email Subject Line",
  "description": "Brief 1-sentence description of when to use this template",
  "bodyHtml": "<!DOCTYPE html><html>...complete HTML...</html>",
  "bodyText": "Complete plain text fallback version"
}`;

    const model = aiConfig?.model || 'gemini-3.5-flash-lite';
    const result = await generateGemini({
      apiKey,
      model,
      systemPrompt,
      messages: [{ role: 'user', content: modelPrompt }],
      timeoutMs: 15_000,
    });

    if (!result?.text) {
      return NextResponse.json({ error: 'AI returned an empty response. Please try again.' }, { status: 500 });
    }

    let cleanJson = result.text.trim();
    if (cleanJson.startsWith('```')) {
      cleanJson = cleanJson
        .replace(/^```(?:json)?\n?/, '')
        .replace(/\n?```$/, '')
        .trim();
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(cleanJson);
    } catch {
      return NextResponse.json(
        { error: 'Failed to parse AI-generated template JSON. Please re-generate.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      template: {
        name: String(parsed.name || 'AI Generated Template').trim(),
        category: (parsed.category as string) || category,
        subject: String(parsed.subject || 'Admissions Update').trim(),
        description: String(parsed.description || userPrompt).trim(),
        bodyHtml: String(parsed.bodyHtml || '').trim(),
        bodyText: String(parsed.bodyText || '').trim(),
        variables: ['name', 'course', 'college', 'counselor', 'counselor_phone', 'wa_link'],
      },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
