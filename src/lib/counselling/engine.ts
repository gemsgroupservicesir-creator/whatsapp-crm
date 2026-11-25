import type { SupabaseClient } from '@supabase/supabase-js';
import { loadAiConfig, loadEmbeddingsKey } from '@/lib/ai/config';
import { generateReply } from '@/lib/ai/generate';
import { ingestDocument } from '@/lib/ai/knowledge';
import { loadEmailConfig } from '@/lib/email/config';
import { sendEmailWithResend } from '@/lib/email/resend';
import { parseLeadNotes, serializeLeadNotes, type LeadNote } from '@/lib/leads/notes';
import { parseInternationalPhone } from '@/lib/whatsapp/phone-utils';
import { resolveConversationByPhone } from '@/lib/whatsapp/resolve-conversation';
import { sendMessageToConversation } from '@/lib/whatsapp/send-message';
import { getWorkspaceWhatsAppPhone } from '@/lib/whatsapp/wa-phone';
import { scrapeUniversityWebsite, type WebsiteScrapeResult } from './scraper';

export type CounsellingPointCategory =
  | 'highlights'
  | 'eligibility'
  | 'fees_scholarship'
  | 'career_outcomes'
  | 'admission_process';

export interface CounsellingPoint {
  category: CounsellingPointCategory;
  title: string;
  detail: string;
}

export interface CounsellingObjection {
  question: string;
  answer: string;
}

export interface CounsellingEmailDraft {
  subject: string;
  headline: string;
  bodyText: string;
  bodyHtml: string;
  summaryPoints: string[];
}

export interface CounsellingPlaybook {
  id: string;
  universityName: string;
  courseName: string;
  websiteUrl: string;
  websiteTitle?: string;
  websiteSynced: boolean;
  websiteNote?: string;
  additionalNotes?: string;
  universityOverview: string;
  counsellingPoints: CounsellingPoint[];
  openingPitch: string;
  objectionHandlers: CounsellingObjection[];
  whatsappReplyDraft: string;
  emailDraft: CounsellingEmailDraft;
  autoWhatsappEnabled: boolean;
  autoEmailEnabled: boolean;
  kbDocumentId?: string;
  createdBy: string;
  createdByName?: string;
  createdAt: string;
  updatedAt: string;
}

export const COUNSELLING_PLAYBOOKS_FIELD_NAME = '__counselling_playbooks__';
const MAX_PLAYBOOKS = 100;

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function personalizeText(
  text: string,
  vars: {
    studentName?: string;
    universityName?: string;
    courseName?: string;
    websiteUrl?: string;
    counselorName?: string;
    counselorPhone?: string;
    waLink?: string;
  }
): string {
  const name = (vars.studentName || 'Student').trim();
  const firstName = name.split(/\s+/)[0] || name;

  return text
    .replace(/\{\{\s*student_name\s*\}\}/gi, name)
    .replace(/\{\{\s*name\s*\}\}/gi, name)
    .replace(/\{\{\s*first_name\s*\}\}/gi, firstName)
    .replace(/\[Student Name\]/gi, name)
    .replace(/\{\{\s*university\s*\}\}/gi, vars.universityName || '')
    .replace(/\{\{\s*college\s*\}\}/gi, vars.universityName || '')
    .replace(/\{\{\s*course\s*\}\}/gi, vars.courseName || '')
    .replace(/\{\{\s*website\s*\}\}/gi, vars.websiteUrl || '')
    .replace(/\{\{\s*counselor\s*\}\}/gi, vars.counselorName || 'Admissions Counselor')
    .replace(/\{\{\s*counselor_phone\s*\}\}/gi, vars.counselorPhone || '')
    .replace(/\{\{\s*wa_link\s*\}\}/gi, vars.waLink || '');
}

/**
 * Renders a branded, responsive HTML counselling email suitable for Resend delivery.
 */
export function renderCounsellingEmailHtml(options: {
  subject: string;
  headline: string;
  studentName?: string;
  universityName: string;
  courseName: string;
  websiteUrl?: string;
  bodyText: string;
  summaryPoints: string[];
  counselorName: string;
  counselorPhone: string;
  waLink: string;
}): string {
  const {
    subject,
    headline,
    studentName,
    universityName,
    courseName,
    websiteUrl,
    bodyText,
    summaryPoints,
    counselorName,
    counselorPhone,
    waLink,
  } = options;

  const personalizedBody = personalizeText(bodyText, {
    studentName,
    universityName,
    courseName,
    websiteUrl,
    counselorName,
    counselorPhone,
    waLink,
  });

  const paragraphsHtml = personalizedBody
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        `<p style="margin: 0 0 14px 0; line-height: 1.65; color: #334155; font-size: 14.5px;">${escapeHtml(p).replace(/\n/g, '<br />')}</p>`
    )
    .join('\n');

  const pointsHtml = summaryPoints
    .filter(Boolean)
    .map(
      (pt) =>
        `<li style="margin-bottom: 8px; line-height: 1.5; color: #1e293b; font-size: 14px;">${escapeHtml(pt)}</li>`
    )
    .join('\n');

  const safeUrl =
    websiteUrl && /^https?:\/\//i.test(websiteUrl) ? escapeHtml(websiteUrl) : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #0f172a;">
  <div style="max-width: 620px; margin: 0 auto; background: #ffffff; border-radius: 14px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.05);">
    <div style="background: linear-gradient(135deg, #0f172a 0%, #1d4ed8 100%); color: #ffffff; padding: 28px;">
      <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.85; margin-bottom: 6px;">
        Personalized Program Counselling
      </div>
      <h1 style="margin: 0; font-size: 21px; font-weight: 700; line-height: 1.3;">${escapeHtml(headline)}</h1>
      <p style="margin: 8px 0 0 0; font-size: 13.5px; opacity: 0.9;">
        ${escapeHtml(universityName)} &bull; ${escapeHtml(courseName)}
      </p>
    </div>

    <div style="padding: 28px;">
      ${paragraphsHtml}

      ${
        pointsHtml
          ? `<div style="background-color: #f8fafc; border-left: 4px solid #2563eb; border-radius: 6px; padding: 16px 18px; margin: 20px 0;">
        <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #1d4ed8; margin-bottom: 10px;">
          Key Program Highlights
        </div>
        <ul style="margin: 0; padding-left: 18px;">
          ${pointsHtml}
        </ul>
      </div>`
          : ''
      }

      ${
        safeUrl
          ? `<div style="margin: 18px 0;">
        <a href="${safeUrl}" target="_blank" style="display: inline-block; background-color: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; padding: 10px 16px; border-radius: 8px; text-decoration: none; font-size: 13.5px; font-weight: 600;">
          Explore Official Program Details &rarr;
        </a>
      </div>`
          : ''
      }

      <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 18px; margin-top: 24px;">
        <div style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: #15803d; letter-spacing: 0.05em;">
          Your Admissions Advisor
        </div>
        <div style="font-size: 16px; font-weight: 700; color: #0f172a; margin-top: 4px;">
          ${escapeHtml(counselorName)}
        </div>
        <div style="font-size: 13px; color: #334155; margin-top: 2px;">
          WhatsApp Desk: ${escapeHtml(counselorPhone)}
        </div>
        <a href="${escapeHtml(waLink)}" target="_blank" style="display: inline-block; margin-top: 12px; background-color: #16a34a; color: #ffffff; text-decoration: none; padding: 10px 18px; border-radius: 8px; font-weight: 600; font-size: 13.5px;">
          Chat on WhatsApp Now
        </a>
      </div>
    </div>

    <div style="background-color: #f1f5f9; padding: 16px 28px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0;">
      Sent by ${escapeHtml(counselorName)} &bull; Official Admissions Counselling Desk
    </div>
  </div>
</body>
</html>`;
}

/**
 * Loads all saved Counselling Playbooks for an account.
 */
export async function loadCounsellingPlaybooks(
  db: SupabaseClient,
  accountId: string
): Promise<CounsellingPlaybook[]> {
  try {
    const { data, error } = await db
      .from('custom_fields')
      .select('field_options')
      .eq('account_id', accountId)
      .eq('field_name', COUNSELLING_PLAYBOOKS_FIELD_NAME)
      .maybeSingle();

    if (error || !data?.field_options) return [];
    const options = data.field_options as { playbooks?: CounsellingPlaybook[] };
    return Array.isArray(options.playbooks) ? options.playbooks : [];
  } catch {
    return [];
  }
}

async function persistCounsellingPlaybooks(
  db: SupabaseClient,
  accountId: string,
  userId: string,
  playbooks: CounsellingPlaybook[]
): Promise<void> {
  const bounded = playbooks.slice(0, MAX_PLAYBOOKS);
  const payload = {
    playbooks: bounded,
    updated_at: new Date().toISOString(),
  };

  const { data: existing } = await db
    .from('custom_fields')
    .select('id')
    .eq('account_id', accountId)
    .eq('field_name', COUNSELLING_PLAYBOOKS_FIELD_NAME)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await db
      .from('custom_fields')
      .update({ field_options: payload })
      .eq('id', existing.id);
    if (error) throw error;
  } else {
    const { error } = await db.from('custom_fields').insert({
      account_id: accountId,
      user_id: userId,
      field_name: COUNSELLING_PLAYBOOKS_FIELD_NAME,
      field_type: 'json',
      field_options: payload,
    });
    if (error) throw error;
  }
}

/**
 * Saves or updates a Counselling Playbook in the account library.
 */
export async function saveCounsellingPlaybook(
  db: SupabaseClient,
  accountId: string,
  userId: string,
  playbook: CounsellingPlaybook
): Promise<CounsellingPlaybook[]> {
  const existing = await loadCounsellingPlaybooks(db, accountId);
  const idx = existing.findIndex((p) => p.id === playbook.id);
  const next = [...existing];
  const updated: CounsellingPlaybook = {
    ...playbook,
    updatedAt: new Date().toISOString(),
  };
  if (idx >= 0) {
    next[idx] = updated;
  } else {
    next.unshift(updated);
  }
  await persistCounsellingPlaybooks(db, accountId, userId, next);
  return next;
}

/**
 * Deletes a Counselling Playbook by id.
 */
export async function deleteCounsellingPlaybook(
  db: SupabaseClient,
  accountId: string,
  userId: string,
  playbookId: string
): Promise<CounsellingPlaybook[]> {
  const existing = await loadCounsellingPlaybooks(db, accountId);
  const filtered = existing.filter((p) => p.id !== playbookId);
  await persistCounsellingPlaybooks(db, accountId, userId, filtered);
  return filtered;
}

/**
 * Finds the best matching active Counselling Playbook for a lead or WhatsApp inbound message.
 * Used by both WhatsApp AI Auto-Reply and Meta Lead Ingestion automation.
 */
export async function findMatchingCounsellingPlaybook(
  db: SupabaseClient,
  accountId: string,
  opts: {
    university?: string | null;
    course?: string | null;
    messageText?: string | null;
    requireAutoWhatsapp?: boolean;
    requireAutoEmail?: boolean;
  }
): Promise<CounsellingPlaybook | null> {
  try {
    const playbooks = await loadCounsellingPlaybooks(db, accountId);
    if (playbooks.length === 0) return null;

    const uniNeedle = (opts.university || '').trim().toLowerCase();
    const courseNeedle = (opts.course || '').trim().toLowerCase();
    const msgNeedle = (opts.messageText || '').trim().toLowerCase();

    let best: { playbook: CounsellingPlaybook; score: number } | null = null;

    for (const pb of playbooks) {
      if (opts.requireAutoWhatsapp && !pb.autoWhatsappEnabled) continue;
      if (opts.requireAutoEmail && !pb.autoEmailEnabled) continue;

      const pbUni = pb.universityName.trim().toLowerCase();
      const pbCourse = pb.courseName.trim().toLowerCase();
      let score = 0;

      if (pbUni && uniNeedle && (uniNeedle.includes(pbUni) || pbUni.includes(uniNeedle))) {
        score += 5;
      }
      if (pbCourse && courseNeedle && (courseNeedle.includes(pbCourse) || pbCourse.includes(courseNeedle))) {
        score += 5;
      }

      if (msgNeedle) {
        if (pbUni && msgNeedle.includes(pbUni)) score += 4;
        if (pbCourse && msgNeedle.includes(pbCourse)) score += 4;
        // Word-level partial match for multi-word university/course names
        const tokens = [...pbUni.split(/\s+/), ...pbCourse.split(/\s+/)]
          .map((t) => t.replace(/[^a-z0-9]/g, ''))
          .filter((t) => t.length >= 3);
        for (const tok of tokens) {
          if (msgNeedle.includes(tok)) score += 1;
        }
      }

      if (score >= 4 && (!best || score > best.score)) {
        best = { playbook: pb, score };
      }
    }

    return best?.playbook ?? null;
  } catch {
    return null;
  }
}

/**
 * Indexes a Counselling Playbook into `ai_knowledge_documents` & chunks so semantic/FTS RAG knows it.
 */
export async function syncPlaybookToKnowledgeBase(
  db: SupabaseClient,
  accountId: string,
  userId: string,
  playbook: CounsellingPlaybook
): Promise<{ documentId: string; warning?: string }> {
  const title = `Counselling: ${playbook.universityName} — ${playbook.courseName}`;
  const pointsLines = playbook.counsellingPoints
    .map((pt) => `- ${pt.title} (${pt.category}): ${pt.detail}`)
    .join('\n');
  const faqLines = playbook.objectionHandlers
    .map((o) => `Q: ${o.question}\nA: ${o.answer}`)
    .join('\n\n');

  const content = [
    `University: ${playbook.universityName}`,
    `Course / Program: ${playbook.courseName}`,
    playbook.websiteUrl ? `Official Website: ${playbook.websiteUrl}` : '',
    `Overview:\n${playbook.universityOverview}`,
    pointsLines ? `Counselling Points:\n${pointsLines}` : '',
    faqLines ? `Common Questions & Objections:\n${faqLines}` : '',
    playbook.additionalNotes ? `Counselor Notes:\n${playbook.additionalNotes}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  let docId = playbook.kbDocumentId;

  if (docId) {
    const { data: existingDoc } = await db
      .from('ai_knowledge_documents')
      .select('id')
      .eq('id', docId)
      .eq('account_id', accountId)
      .maybeSingle();

    if (existingDoc?.id) {
      await db
        .from('ai_knowledge_documents')
        .update({ title, content, updated_at: new Date().toISOString() })
        .eq('id', docId);
    } else {
      docId = undefined;
    }
  }

  if (!docId) {
    const { data: inserted, error } = await db
      .from('ai_knowledge_documents')
      .insert({
        account_id: accountId,
        created_by: userId,
        title,
        content,
      })
      .select('id')
      .single();

    if (error || !inserted) {
      throw new Error(`Failed to create knowledge document: ${error?.message || 'Unknown error'}`);
    }
    docId = inserted.id;
  }

  const { key: embeddingsApiKey } = await loadEmbeddingsKey(db, accountId).catch(() => ({
    key: null,
  }));

  let warning: string | undefined;
  try {
    const ingest = await ingestDocument(db, accountId, { embeddingsApiKey }, docId!, content);
    if (ingest.keywordOnly && ingest.embedError) {
      warning = 'Saved and indexed lexically (semantic embedding skipped).';
    }
  } catch (err) {
    warning = err instanceof Error ? err.message : 'Document saved; chunk indexing had a warning.';
  }

  return { documentId: docId!, warning };
}

function buildFallbackCounsellingKit(args: {
  universityName: string;
  courseName: string;
  websiteUrl: string;
  scrapeResult: WebsiteScrapeResult | null;
  counselorName: string;
  counselorPhone: string;
  waLink: string;
  additionalNotes?: string;
}): Omit<CounsellingPlaybook, 'id' | 'createdBy' | 'createdAt' | 'updatedAt' | 'autoWhatsappEnabled' | 'autoEmailEnabled'> {
  const {
    universityName,
    courseName,
    websiteUrl,
    scrapeResult,
    counselorName,
    counselorPhone,
    waLink,
    additionalNotes,
  } = args;

  const siteSummary = scrapeResult?.description
    ? scrapeResult.description
    : scrapeResult?.highlightsFound.slice(0, 2).join(' ') ||
      `${universityName} offers ${courseName} with structured academic training, practical exposure, and dedicated career placement guidance.`;

  const counsellingPoints: CounsellingPoint[] = [
    {
      category: 'highlights',
      title: 'Program Positioning & Reputation',
      detail: `${courseName} at ${universityName} equips students with core domain foundations and industry-ready practical projects.${scrapeResult?.title ? ` Verified page title: "${scrapeResult.title}".` : ''}`,
    },
    {
      category: 'eligibility',
      title: 'Eligibility & Academic Prerequisites',
      detail: 'Confirm the student meets minimum qualifying examination percentage, required subject stream, and age/entrance exam prerequisites listed on the official prospectus.',
    },
    {
      category: 'fees_scholarship',
      title: 'Fee Breakdown & Merit Scholarships',
      detail: 'Share semester/annual tuition estimates, scholarship slabs based on academic merit, and flexible installment schedules clearly during the first call.',
    },
    {
      category: 'career_outcomes',
      title: 'Placements & Career Pathways',
      detail: `Highlight internships, clinical/industry labs, and graduate career roles enabled by completing ${courseName} at ${universityName}.`,
    },
    {
      category: 'admission_process',
      title: 'Step-by-Step Enrollment Checklist',
      detail: 'Collect marksheets and ID proof, verify eligibility within 24 hours, schedule a counselor session, and lock the seat prior to batch cutoff.',
    },
  ];

  if (scrapeResult?.highlightsFound && scrapeResult.highlightsFound.length > 0) {
    counsellingPoints.unshift({
      category: 'highlights',
      title: 'Extracted from Official Website',
      detail: scrapeResult.highlightsFound.slice(0, 3).join(' • '),
    });
  }

  if (additionalNotes?.trim()) {
    counsellingPoints.push({
      category: 'fees_scholarship',
      title: 'Counselor Special Remarks',
      detail: additionalNotes.trim(),
    });
  }

  const openingPitch = `Hello {{student_name}}, I am ${counselorName} from the Admissions Desk. Thank you for exploring ${courseName} at ${universityName}. I have the latest curriculum, eligibility criteria, and scholarship options ready for you—do you have 2 minutes to review your qualification so I can check which scholarship slab you qualify for?`;

  const objectionHandlers: CounsellingObjection[] = [
    {
      question: 'Is the degree recognized and accredited?',
      answer: `Verify official recognition badges directly with the student on ${websiteUrl || 'the university portal'} and share accreditation/affiliation details during counseling.`,
    },
    {
      question: 'What about scholarships or installment options?',
      answer: 'Explain merit-based tuition waivers, early-applicant priority review, and semester-wise payment milestones once marksheets are verified.',
    },
    {
      question: 'How do campus placements and internships work?',
      answer: `Walk the parent and student through industry tie-ups, practical training modules, and placement preparation support integrated into ${courseName}.`,
    },
  ];

  const websiteLine = websiteUrl ? `\nOfficial Program Link: ${websiteUrl}` : '';
  const whatsappReplyDraft = `Hello {{student_name}}! 👋\n\nHere are the verified counseling highlights for *${courseName}* at *${universityName}*:\n\n• Industry-aligned curriculum & practical training\n• Merit-based scholarship evaluation available\n• End-to-end eligibility check & admission support${websiteLine}\n\nPlease reply with your latest qualification/marks percentage so I can confirm your eligibility and send the full fee & scholarship breakdown!`;

  const subject = `${universityName} — ${courseName} Program Highlights & Counseling Guide`;
  const headline = `${courseName} at ${universityName}`;
  const bodyText = `Dear {{student_name}},\n\nThank you for connecting with us regarding ${courseName} at ${universityName}.\n\n${siteSummary}\n\nTo make your decision effortless, we have compiled key program highlights below and are available to guide you personally on eligibility verification, fee structure, and scholarship availability.\n\nReply directly to this email or message us on WhatsApp (${counselorPhone}) with your academic details for a personalized assessment.\n\nWarm regards,\n${counselorName}\nAdmissions Counseling Desk`;

  const summaryPoints = counsellingPoints.slice(0, 4).map((p) => `${p.title}: ${p.detail}`);
  const bodyHtml = renderCounsellingEmailHtml({
    subject,
    headline,
    universityName,
    courseName,
    websiteUrl,
    bodyText,
    summaryPoints,
    counselorName,
    counselorPhone,
    waLink,
  });

  return {
    universityName,
    courseName,
    websiteUrl,
    websiteTitle: scrapeResult?.title,
    websiteSynced: Boolean(scrapeResult?.ok),
    websiteNote: scrapeResult?.ok
      ? `Synced ${scrapeResult.extractedText.length.toLocaleString()} chars from website`
      : scrapeResult?.error || 'No website URL scraped',
    additionalNotes,
    universityOverview: siteSummary,
    counsellingPoints,
    openingPitch,
    objectionHandlers,
    whatsappReplyDraft,
    emailDraft: {
      subject,
      headline,
      bodyText,
      bodyHtml,
      summaryPoints,
    },
  };
}

function parseJsonObjectFromModelText(raw: string): Record<string, unknown> | null {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        const sliced = cleaned.slice(firstBrace, lastBrace + 1);
        const parsed = JSON.parse(sliced);
        return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Generates an AI Counselling Kit by scraping the university/course website,
 * pulling CRM notes context for that university/course, and generating structured
 * counselling points + automated WhatsApp reply + automated email draft.
 */
export async function generateCounsellingKit(args: {
  db: SupabaseClient;
  accountId: string;
  universityName: string;
  courseName: string;
  websiteUrl?: string;
  studentName?: string;
  counselorName?: string;
  additionalNotes?: string;
}): Promise<{
  kit: Omit<CounsellingPlaybook, 'id' | 'createdBy' | 'createdAt' | 'updatedAt' | 'autoWhatsappEnabled' | 'autoEmailEnabled'>;
  source: 'ai' | 'fallback';
  scrapeResult: WebsiteScrapeResult | null;
}> {
  const {
    db,
    accountId,
    universityName,
    courseName,
    websiteUrl = '',
    counselorName = 'Senior Admissions Counselor',
    additionalNotes,
  } = args;

  const waPhone = await getWorkspaceWhatsAppPhone(db, accountId);

  // 1. Scrape website if URL is provided
  let scrapeResult: WebsiteScrapeResult | null = null;
  if (websiteUrl.trim()) {
    scrapeResult = await scrapeUniversityWebsite(websiteUrl.trim());
  }

  const effectiveUrl = scrapeResult?.url || websiteUrl.trim();

  // 2. Pull any CRM insights from previous leads/notes mentioning this course or university
  let crmPastNotes = '';
  try {
    const { data: relatedLeads } = await db
      .from('meta_lead_logs')
      .select('college, course, notes')
      .eq('account_id', accountId)
      .not('notes', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(40);

    if (relatedLeads && relatedLeads.length > 0) {
      const uniLow = universityName.toLowerCase();
      const courseLow = courseName.toLowerCase();
      const relevantNotes: string[] = [];
      for (const l of relatedLeads) {
        const lCol = (l.college || '').toLowerCase();
        const lCourse = (l.course || '').toLowerCase();
        if (
          (uniLow && (lCol.includes(uniLow) || uniLow.includes(lCol))) ||
          (courseLow && (lCourse.includes(courseLow) || courseLow.includes(lCourse)))
        ) {
          const parsed = parseLeadNotes(l.notes);
          for (const n of parsed.slice(-2)) {
            relevantNotes.push(n.text.slice(0, 180));
          }
        }
      }
      if (relevantNotes.length > 0) {
        crmPastNotes = relevantNotes.slice(0, 8).join('\n- ');
      }
    }
  } catch {
    // non-fatal
  }

  const fallback = buildFallbackCounsellingKit({
    universityName,
    courseName,
    websiteUrl: effectiveUrl,
    scrapeResult,
    counselorName,
    counselorPhone: waPhone.displayPhone,
    waLink: waPhone.waLink,
    additionalNotes,
  });

  // 3. Load AI Config
  let aiConfig = null;
  try {
    aiConfig = await loadAiConfig(db, accountId, { requireActive: false });
  } catch {
    aiConfig = null;
  }

  if (!aiConfig?.apiKey) {
    return { kit: fallback, source: 'fallback', scrapeResult };
  }

  const websiteSection = scrapeResult?.ok
    ? `WEBSITE EXTRACT (${scrapeResult.url}):\nTitle: ${scrapeResult.title || 'N/A'}\nMeta Description: ${scrapeResult.description || 'N/A'}\nKey Lines:\n${scrapeResult.highlightsFound.join('\n')}\n\nFull Page Excerpt:\n${scrapeResult.extractedText.slice(0, 4800)}`
    : effectiveUrl
      ? `WEBSITE URL PROVIDED: ${effectiveUrl} (Note: website could not be scraped automatically: ${scrapeResult?.error || 'unavailable'}. Use general verified knowledge without inventing fake fees or rankings.)`
      : 'No website URL provided.';

  const systemPrompt =
    'You are an Expert Higher Education Admissions & Career Counselling Strategist. Return ONLY strict valid JSON with no markdown wrappers or commentary.';

  const userPrompt = `Generate a complete Admissions Counselling Kit & Automated Communication Pack for an admissions counselor.

INPUTS:
- University / Institution: ${universityName}
- Course / Program: ${courseName}
- Website Link: ${effectiveUrl || 'Not specified'}
- Counselor Name: ${counselorName}
- WhatsApp Cloud Number: ${waPhone.displayPhone} (${waPhone.waLink})
- Extra Counselor Guidance: ${additionalNotes || 'None'}

${websiteSection}

${crmPastNotes ? `PAST CRM COUNSELOR NOTES FOR SIMILAR INQUIRIES:\n- ${crmPastNotes}` : ''}

Return a JSON object matching this exact structure:
{
  "universityOverview": "2-3 sentence crisp overview of the university and program based on the website/inputs",
  "counsellingPoints": [
    { "category": "highlights", "title": "Short title", "detail": "Concrete talking point for the agent" },
    { "category": "eligibility", "title": "Short title", "detail": "Eligibility & qualification guidance" },
    { "category": "fees_scholarship", "title": "Short title", "detail": "Fee & scholarship guidance (do not invent unverified exact rupees if not in website text)" },
    { "category": "career_outcomes", "title": "Short title", "detail": "Placements, skills, & career roles" },
    { "category": "admission_process", "title": "Short title", "detail": "Steps to apply & enroll" }
  ],
  "openingPitch": "Warm 30-second opening pitch using {{student_name}} placeholder",
  "objectionHandlers": [
    { "question": "Common parent/student objection 1", "answer": "Persuasive factual response" },
    { "question": "Common parent/student objection 2", "answer": "Persuasive factual response" },
    { "question": "Common parent/student objection 3", "answer": "Persuasive factual response" }
  ],
  "whatsappReplyDraft": "Concise, friendly WhatsApp message using {{student_name}}, bullet points, the website link if given, and a question to keep the student engaged",
  "emailDraft": {
    "subject": "Engaging subject line mentioning university & course",
    "headline": "Short email header headline",
    "bodyText": "3 well-written paragraphs using {{student_name}} salutation, tailored to the program and website highlights",
    "summaryPoints": ["Point 1", "Point 2", "Point 3", "Point 4"]
  }
}`;

  try {
    const aiRes = await generateReply({
      config: aiConfig,
      systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const parsed = aiRes?.text ? parseJsonObjectFromModelText(aiRes.text) : null;
    if (!parsed) {
      return { kit: fallback, source: 'fallback', scrapeResult };
    }

    const validCategories = new Set<CounsellingPointCategory>([
      'highlights',
      'eligibility',
      'fees_scholarship',
      'career_outcomes',
      'admission_process',
    ]);

    const counsellingPoints: CounsellingPoint[] = Array.isArray(parsed.counsellingPoints)
      ? parsed.counsellingPoints
          .filter((p): p is Record<string, unknown> => Boolean(p && typeof p === 'object'))
          .map((p) => ({
            category: validCategories.has(p.category as CounsellingPointCategory)
              ? (p.category as CounsellingPointCategory)
              : 'highlights',
            title: String(p.title || 'Counselling Point').trim(),
            detail: String(p.detail || '').trim(),
          }))
          .filter((p) => p.detail.length > 0)
      : fallback.counsellingPoints;

    const objectionHandlers: CounsellingObjection[] = Array.isArray(parsed.objectionHandlers)
      ? parsed.objectionHandlers
          .filter((o): o is Record<string, unknown> => Boolean(o && typeof o === 'object'))
          .map((o) => ({
            question: String(o.question || '').trim(),
            answer: String(o.answer || '').trim(),
          }))
          .filter((o) => o.question && o.answer)
      : fallback.objectionHandlers;

    const rawEmail = (parsed.emailDraft && typeof parsed.emailDraft === 'object'
      ? parsed.emailDraft
      : {}) as Record<string, unknown>;

    const emailSubject =
      typeof rawEmail.subject === 'string' && rawEmail.subject.trim()
        ? rawEmail.subject.trim()
        : fallback.emailDraft.subject;
    const emailHeadline =
      typeof rawEmail.headline === 'string' && rawEmail.headline.trim()
        ? rawEmail.headline.trim()
        : fallback.emailDraft.headline;
    const emailBodyText =
      typeof rawEmail.bodyText === 'string' && rawEmail.bodyText.trim()
        ? rawEmail.bodyText.trim()
        : fallback.emailDraft.bodyText;
    const summaryPoints = Array.isArray(rawEmail.summaryPoints)
      ? rawEmail.summaryPoints.map((s) => String(s || '').trim()).filter(Boolean)
      : fallback.emailDraft.summaryPoints;

    const emailHtml = renderCounsellingEmailHtml({
      subject: emailSubject,
      headline: emailHeadline,
      universityName,
      courseName,
      websiteUrl: effectiveUrl,
      bodyText: emailBodyText,
      summaryPoints,
      counselorName,
      counselorPhone: waPhone.displayPhone,
      waLink: waPhone.waLink,
    });

    const kit = {
      ...fallback,
      universityOverview:
        typeof parsed.universityOverview === 'string' && parsed.universityOverview.trim()
          ? parsed.universityOverview.trim()
          : fallback.universityOverview,
      counsellingPoints:
        counsellingPoints.length > 0 ? counsellingPoints : fallback.counsellingPoints,
      openingPitch:
        typeof parsed.openingPitch === 'string' && parsed.openingPitch.trim()
          ? parsed.openingPitch.trim()
          : fallback.openingPitch,
      objectionHandlers:
        objectionHandlers.length > 0 ? objectionHandlers : fallback.objectionHandlers,
      whatsappReplyDraft:
        typeof parsed.whatsappReplyDraft === 'string' && parsed.whatsappReplyDraft.trim()
          ? parsed.whatsappReplyDraft.trim()
          : fallback.whatsappReplyDraft,
      emailDraft: {
        subject: emailSubject,
        headline: emailHeadline,
        bodyText: emailBodyText,
        bodyHtml: emailHtml,
        summaryPoints,
      },
    };

    return { kit, source: 'ai', scrapeResult };
  } catch (err) {
    console.warn('[counselling/engine] AI generation failed, returning website-backed fallback:', err);
    return { kit: fallback, source: 'fallback', scrapeResult };
  }
}

export interface CounsellingAutomationRecipientResult {
  leadId?: string;
  name: string;
  phone?: string;
  email?: string;
  whatsappSent: boolean;
  whatsappMode?: 'text' | 'template';
  whatsappError?: string;
  emailSent: boolean;
  emailError?: string;
}

/**
 * Automates dispatching tailored Counselling WhatsApp Reply & Email to target leads or recipients.
 */
export async function automateCounsellingOutreach(args: {
  db: SupabaseClient;
  accountId: string;
  userId: string;
  counselorName: string;
  universityName: string;
  courseName: string;
  websiteUrl?: string;
  whatsappMessage: string;
  emailSubject: string;
  emailHeadline?: string;
  emailBodyText: string;
  emailSummaryPoints: string[];
  sendWhatsApp: boolean;
  sendEmail: boolean;
  leadIds?: string[];
  customRecipient?: { name?: string; phone?: string; email?: string };
}): Promise<{
  results: CounsellingAutomationRecipientResult[];
  whatsappSuccessCount: number;
  emailSuccessCount: number;
}> {
  const {
    db,
    accountId,
    userId,
    counselorName,
    universityName,
    courseName,
    websiteUrl = '',
    whatsappMessage,
    emailSubject,
    emailHeadline,
    emailBodyText,
    emailSummaryPoints,
    sendWhatsApp,
    sendEmail,
    leadIds = [],
    customRecipient,
  } = args;

  const waPhone = await getWorkspaceWhatsAppPhone(db, accountId);
  const emailConfig = sendEmail ? await loadEmailConfig(db, accountId).catch(() => null) : null;

  interface TargetRow {
    leadId?: string;
    name: string;
    phone?: string | null;
    email?: string | null;
    conversationId?: string | null;
    existingNotes?: unknown;
  }

  const targets: TargetRow[] = [];

  if (leadIds.length > 0) {
    const { data: leadRows } = await db
      .from('meta_lead_logs')
      .select('id, full_name, phone, email, conversation_id, notes')
      .eq('account_id', accountId)
      .in('id', leadIds);

    for (const l of leadRows || []) {
      targets.push({
        leadId: l.id,
        name: l.full_name || 'Student',
        phone: l.phone,
        email: l.email,
        conversationId: l.conversation_id,
        existingNotes: l.notes,
      });
    }
  }

  if (customRecipient && (customRecipient.phone?.trim() || customRecipient.email?.trim())) {
    targets.push({
      name: customRecipient.name?.trim() || 'Student',
      phone: customRecipient.phone?.trim() || null,
      email: customRecipient.email?.trim() || null,
    });
  }

  const results: CounsellingAutomationRecipientResult[] = [];
  let whatsappSuccessCount = 0;
  let emailSuccessCount = 0;

  for (const target of targets) {
    const recResult: CounsellingAutomationRecipientResult = {
      leadId: target.leadId,
      name: target.name,
      phone: target.phone || undefined,
      email: target.email || undefined,
      whatsappSent: false,
      emailSent: false,
    };

    const personalizedVars = {
      studentName: target.name,
      universityName,
      courseName,
      websiteUrl,
      counselorName,
      counselorPhone: waPhone.displayPhone,
      waLink: waPhone.waLink,
    };

    // 1. Automate WhatsApp Reply
    if (sendWhatsApp) {
      const rawPhone = (target.phone || '').trim();
      const prefixed = rawPhone.startsWith('+') ? rawPhone : `+${rawPhone.replace(/\D/g, '')}`;
      const digits = parseInternationalPhone(prefixed);

      if (!digits) {
        recResult.whatsappError = 'Invalid or missing student WhatsApp phone number';
      } else {
        const formattedPhone = `+${digits}`;
        try {
          let conversationId = target.conversationId || null;
          if (!conversationId) {
            const resolved = await resolveConversationByPhone(
              db,
              accountId,
              formattedPhone,
              target.name
            );
            conversationId = resolved.conversationId;
          }

          // Check whether the 24h customer session window is open
          const { data: convRow } = await db
            .from('conversations')
            .select('last_inbound_at')
            .eq('id', conversationId)
            .maybeSingle();

          const lastInboundMs = convRow?.last_inbound_at
            ? new Date(convRow.last_inbound_at).getTime()
            : 0;
          const within24h =
            lastInboundMs > 0 && Date.now() - lastInboundMs < 24 * 60 * 60 * 1000;

          const bodyToSend = personalizeText(whatsappMessage, personalizedVars);

          if (within24h) {
            await sendMessageToConversation(db, accountId, {
              conversationId,
              messageType: 'text',
              contentText: bodyToSend,
              senderId: userId,
            });
            recResult.whatsappSent = true;
            recResult.whatsappMode = 'text';
            whatsappSuccessCount++;
          } else {
            // Outside 24h session window: try sending text first only if session existed, else use approved template
            let sentTemplate = false;
            const candidateTemplates = [
              'education_admissions_welcome',
              'admissions_inquiry_received',
              'education_scholarship_inquiry',
            ];
            let lastErr = '';
            for (const tmpl of candidateTemplates) {
              try {
                await sendMessageToConversation(db, accountId, {
                  conversationId,
                  messageType: 'template',
                  templateName: tmpl,
                  templateLanguage: 'en_US',
                  templateParams: [target.name],
                  senderId: userId,
                });
                sentTemplate = true;
                recResult.whatsappSent = true;
                recResult.whatsappMode = 'template';
                whatsappSuccessCount++;
                break;
              } catch (tmplErr) {
                lastErr = tmplErr instanceof Error ? tmplErr.message : String(tmplErr);
              }
            }

            if (!sentTemplate) {
              recResult.whatsappError =
                lastErr ||
                '24h WhatsApp customer window is closed and no approved Meta template succeeded.';
            }
          }
        } catch (waErr) {
          recResult.whatsappError =
            waErr instanceof Error ? waErr.message : String(waErr);
        }
      }
    }

    // 2. Automate Counselling Email
    if (sendEmail) {
      const recipientEmail = (target.email || '').trim();
      if (!recipientEmail || !recipientEmail.includes('@')) {
        recResult.emailError = 'Invalid or missing student email address';
      } else if (!emailConfig?.apiKey) {
        recResult.emailError = 'Resend Email API is not configured in Settings';
      } else {
        const finalSubject = personalizeText(emailSubject, personalizedVars);
        const finalBodyText = personalizeText(emailBodyText, personalizedVars);
        const finalHtml = renderCounsellingEmailHtml({
          subject: finalSubject,
          headline: emailHeadline || `${courseName} at ${universityName}`,
          studentName: target.name,
          universityName,
          courseName,
          websiteUrl,
          bodyText: finalBodyText,
          summaryPoints: emailSummaryPoints,
          counselorName,
          counselorPhone: waPhone.displayPhone,
          waLink: waPhone.waLink,
        });

        const emailRes = await sendEmailWithResend({
          apiKey: emailConfig.apiKey,
          from: emailConfig.fromEmail,
          to: recipientEmail,
          subject: finalSubject,
          html: finalHtml,
          text: finalBodyText,
          replyTo: emailConfig.replyToEmail,
        });

        if (emailRes.success) {
          recResult.emailSent = true;
          emailSuccessCount++;
        } else {
          recResult.emailError = emailRes.error || 'Email delivery failed';
        }
      }
    }

    // 3. Log counselling automation action back onto lead notes
    if (target.leadId && (recResult.whatsappSent || recResult.emailSent)) {
      try {
        const existingNotes = parseLeadNotes(target.existingNotes);
        const channels: string[] = [];
        if (recResult.whatsappSent) channels.push(`WhatsApp (${recResult.whatsappMode})`);
        if (recResult.emailSent) channels.push('Email');

        const newNote: LeadNote = {
          id: crypto.randomUUID(),
          text: `🎓 Agent Counselling sent via ${channels.join(' & ')} for ${courseName} at ${universityName}${websiteUrl ? ` (${websiteUrl})` : ''}.`,
          author_name: counselorName,
          author_type: 'counselor',
          created_at: new Date().toISOString(),
        };

        await db
          .from('meta_lead_logs')
          .update({
            notes: serializeLeadNotes([...existingNotes, newNote]),
            lead_status: 'contacted',
            updated_at: new Date().toISOString(),
          })
          .eq('id', target.leadId)
          .eq('account_id', accountId);
      } catch {
        // non-fatal note update
      }
    }

    results.push(recResult);
  }

  return {
    results,
    whatsappSuccessCount,
    emailSuccessCount,
  };
}
