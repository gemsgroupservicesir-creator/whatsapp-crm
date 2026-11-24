import type { SupabaseClient } from '@supabase/supabase-js';
import { type LeadNote, parseLeadNotes, serializeLeadNotes } from '@/lib/leads/notes';
import type { AiConfig } from '@/lib/ai/types';
import { generateGemini } from '@/lib/ai/providers/gemini';
import { loadEmailConfig } from '@/lib/email/config';
import { sendEmailWithResend } from '@/lib/email/resend';
import { loadAiConfig } from '@/lib/ai/config';
import { getWorkspaceWhatsAppPhone } from '@/lib/whatsapp/wa-phone';

export interface FollowUpEmailContext {
  studentName: string;
  studentEmail: string;
  studentPhone?: string | null;
  college?: string | null;
  course?: string | null;
  city?: string | null;
  campaignName?: string | null;
  counselorName?: string | null;
  counselorPhone?: string | null;
  counselorEmail?: string | null;
  notes: LeadNote[];
  latestNoteText?: string;
  customSubject?: string;
}

export interface GeneratedFollowUpEmail {
  subject: string;
  html: string;
  text: string;
  source: 'ai' | 'fallback';
}

interface ParsedAiFollowUpResponse {
  subject?: string;
  headline?: string;
  introParagraph?: string;
  discussionPoints?: string[];
  counselorMessage?: string;
  closingParagraph?: string;
}

/**
 * Builds the responsive HTML template for a follow-up email.
 */
function renderFollowUpHtml(options: {
  subject: string;
  studentName: string;
  course: string;
  college: string;
  counselorName: string;
  counselorPhone: string;
  waLink: string;
  introParagraph: string;
  discussionPoints: string[];
  counselorMessage?: string;
  closingParagraph: string;
}): string {
  const {
    subject,
    studentName,
    course,
    college,
    counselorName,
    counselorPhone,
    waLink,
    introParagraph,
    discussionPoints,
    counselorMessage,
    closingParagraph,
  } = options;

  const pointsList = discussionPoints
    .map(
      (pt) =>
        `<li style="margin-bottom: 8px; line-height: 1.5; color: #334155;">${pt}</li>`
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -2px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; }
    .header { background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); color: #ffffff; padding: 28px; text-align: left; }
    .header h1 { margin: 0; font-size: 21px; font-weight: 700; letter-spacing: -0.02em; }
    .header p { margin: 6px 0 0 0; font-size: 13.5px; opacity: 0.9; }
    .content { padding: 28px; }
    .lead-box { background-color: #f0fdf4; border-left: 4px solid #16a34a; padding: 14px 16px; border-radius: 6px; margin: 18px 0; }
    .notes-box { background-color: #f8fafc; border-left: 4px solid #2563eb; padding: 16px; border-radius: 6px; margin: 18px 0; border-top: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; }
    .counselor-card { background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 18px; margin: 24px 0; }
    .counselor-header { font-size: 12px; text-transform: uppercase; font-weight: 700; color: #64748b; letter-spacing: 0.05em; margin-bottom: 6px; }
    .counselor-name { font-size: 16px; font-weight: 700; color: #0f172a; }
    .btn-wa { display: inline-block; background-color: #25D366; color: #ffffff !important; text-decoration: none; padding: 12px 22px; font-weight: 600; border-radius: 6px; text-align: center; margin-top: 10px; font-size: 14px; }
    .footer { background-color: #f1f5f9; padding: 20px 28px; font-size: 12px; color: #64748b; text-align: center; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.85; margin-bottom: 4px;">
        📌 Admissions Counseling Follow-Up
      </div>
      <h1>${college}</h1>
      <p>Direct Admissions Partner for Top Universities in India & Nepal</p>
    </div>

    <div class="content">
      <p style="font-size: 15.5px; line-height: 1.6; margin-top: 0;">
        Dear <strong>${studentName}</strong>,
      </p>

      <p style="font-size: 14.5px; line-height: 1.6; color: #334155;">
        ${introParagraph}
      </p>

      <div class="notes-box">
        <div style="font-weight: 700; color: #1e3a8a; font-size: 13.5px; margin-bottom: 10px;">
          📋 Counseling Discussion & Academic Highlights:
        </div>
        <ul style="margin: 0; padding-left: 20px; font-size: 13.5px;">
          ${pointsList}
        </ul>
      </div>

      ${
        counselorMessage
          ? `<div style="background-color: #eff6ff; border-radius: 8px; padding: 14px 16px; margin: 18px 0; font-size: 13.5px; color: #1e40af; border: 1px solid #bfdbfe;">
              <strong>Counselor Note:</strong> ${counselorMessage}
            </div>`
          : ''
      }

      <div class="counselor-card">
        <div class="counselor-header">Your Designated Admissions Advisor</div>
        <div class="counselor-name">${counselorName}</div>
        <p style="font-size: 13px; color: #475569; margin: 6px 0 12px 0;">
          Directly available for 1-on-1 counseling regarding eligibility, semester fees, scholarships, and campus visits.
        </p>
        <div>
          <a href="${waLink}" class="btn-wa" target="_blank" rel="noopener noreferrer">
            💬 Chat with Counselor on WhatsApp (${counselorPhone})
          </a>
        </div>
      </div>

      <p style="font-size: 14px; line-height: 1.6; color: #475569;">
        ${closingParagraph}
      </p>

      <p style="font-size: 13.5px; color: #64748b; line-height: 1.5; margin-top: 22px;">
        Warm regards,<br>
        <strong>${counselorName}</strong><br>
        Admissions Office • GEMS Education Nepal & India<br>
        WhatsApp Support: ${counselorPhone}
      </p>
    </div>

    <div class="footer">
      <p style="margin: 0 0 6px 0;"><strong>GEMS Education Admissions Office</strong></p>
      <p style="margin: 0 0 4px 0;">Kathmandu, Nepal • Direct Admissions & Merit Scholarships</p>
      <p style="margin: 0;">This follow-up was prepared specifically according to your counseling enquiry.</p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Generates an individualized follow-up email strictly grounded in the lead's notes.
 * Uses Gemini AI if available; falls back smoothly to intelligent template generation.
 */
export async function generateNotesFollowUpEmail(
  context: FollowUpEmailContext,
  aiConfig?: AiConfig | null
): Promise<GeneratedFollowUpEmail> {
  const studentName = (context.studentName || 'Student').trim();
  const firstName = studentName.split(' ')[0] || studentName;
  const course = (context.course || 'Academic Programs').trim();
  const college = (context.college || 'GEMS Education Partner Institutions').trim();
  const counselor = (context.counselorName || 'Senior Admissions Counselor').trim();
  let counselorPhone = (context.counselorPhone || '+91 89718 71113').trim();
  if (!counselorPhone || counselorPhone.includes('000000') || counselorPhone.includes('980-0000')) {
    counselorPhone = '+91 89718 71113';
  }
  const cleanPhone = counselorPhone.replace(/[^0-9]/g, '');
  const waLink = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(
    `Hello ${counselor}, I am following up on our admissions discussion for ${course} at ${college}.`
  )}`;

  // Compile all notes into structured chronological text
  const rawNotes = parseLeadNotes(context.notes);
  const allNotes: LeadNote[] = [...rawNotes];

  if (context.latestNoteText && context.latestNoteText.trim()) {
    const isDuplicate = allNotes.some(
      (n) => n.text.trim() === context.latestNoteText?.trim()
    );
    if (!isDuplicate) {
      allNotes.push({
        id: `latest-${Date.now()}`,
        text: context.latestNoteText.trim(),
        author_name: counselor,
        author_type: 'counselor',
        created_at: new Date().toISOString(),
      });
    }
  }

  const notesSummary = allNotes
    .map((n, i) => {
      const author =
        n.author_type === 'ai_agent'
          ? 'AI Admissions Agent'
          : `Counselor (${n.author_name || 'Counselor'})`;
      return `${i + 1}. [${author}]: ${n.text}`;
    })
    .join('\n');

  // Attempt AI Generation if API key is available
  const apiKey =
    aiConfig?.apiKey ||
    process.env.GEMINI_API_KEY ||
    (aiConfig?.provider === 'gemini' ? aiConfig.apiKey : null);

  if (apiKey && allNotes.length > 0) {
    try {
      const model = aiConfig?.model || 'gemini-3.5-flash-lite';
      const prompt = `You are an expert Admissions Director at GEMS Education writing a personalized follow-up email to a student.

STUDENT DETAILS:
- Full Name: ${studentName}
- Interested Program: ${course}
- Target Institution: ${college}
- Preferred City/Region: ${context.city || 'Nepal / India'}
- Admissions Counselor: ${counselor}
- Counselor WhatsApp: ${counselorPhone}

COUNSELOR & ADMISSIONS NOTES (GROUNDING TRUTH — CRITICAL):
${notesSummary}

TASK:
Write a personalized follow-up email tailored specifically to the notes above.
Address any questions or topics mentioned in the notes (such as fee structure, scholarships, qualifying marks, parent review, entrance tests, campus facilities, or scheduled calls).
Keep it encouraging, respectful, and crystal clear.

OUTPUT FORMAT:
Return valid JSON only (do not include markdown outside the json block):
{
  "subject": "Appealing, personalized subject line mentioning the program or key discussion point",
  "introParagraph": "1-2 sentences greeting ${firstName} and directly referencing the recent counseling discussion regarding ${course}.",
  "discussionPoints": [
    "Specific highlight addressing note #1 (e.g. eligibility or scholarship detail)",
    "Specific highlight addressing note #2 (e.g. fee breakdown or curriculum aspect)",
    "Clear actionable step (e.g. seat booking or submitting marksheets)"
  ],
  "counselorMessage": "Short supportive message from Counselor ${counselor}",
  "closingParagraph": "Encouraging call to action urging the student to reply or connect via WhatsApp."
}`;

      const aiResult = await generateGemini({
        apiKey,
        model,
        systemPrompt:
          'You are a professional educational admissions counselor. You write helpful, empathetic, and personalized emails based strictly on student counseling notes.',
        messages: [{ role: 'user', content: prompt }],
        timeoutMs: 12_000,
      });

      if (aiResult?.text) {
        // Strip markdown fences if present
        let cleanText = aiResult.text.trim();
        if (cleanText.startsWith('```')) {
          cleanText = cleanText
            .replace(/^```(?:json)?\n?/, '')
            .replace(/\n?```$/, '')
            .trim();
        }

        const parsed: ParsedAiFollowUpResponse = JSON.parse(cleanText);

        const subject =
          context.customSubject ||
          parsed.subject ||
          `Follow-up regarding your ${course} Admissions Inquiry — ${college}`;

        const introParagraph =
          parsed.introParagraph ||
          `Thank you for speaking with our admissions team regarding ${course} at ${college}. We have reviewed the details of your inquiry and prepared this personalized update for you.`;

        const discussionPoints =
          Array.isArray(parsed.discussionPoints) && parsed.discussionPoints.length > 0
            ? parsed.discussionPoints
            : allNotes.map((n) => n.text);

        const counselorMessage = parsed.counselorMessage;
        const closingParagraph =
          parsed.closingParagraph ||
          `If you have any questions or would like to reserve your admission seat, feel free to reply directly to this email or message Counselor ${counselor} on WhatsApp.`;

        const html = renderFollowUpHtml({
          subject,
          studentName,
          course,
          college,
          counselorName: counselor,
          counselorPhone,
          waLink,
          introParagraph,
          discussionPoints,
          counselorMessage,
          closingParagraph,
        });

        const plainTextPoints = discussionPoints.map((p) => `• ${p}`).join('\n');
        const text = `Dear ${studentName},

${introParagraph}

COUNSELING HIGHLIGHTS & ACTION ITEMS:
${plainTextPoints}

${counselorMessage ? `Counselor Message: ${counselorMessage}\n` : ''}
${closingParagraph}

YOUR DESIGNATED COUNSELOR:
- Name: ${counselor}
- WhatsApp: ${counselorPhone} (${waLink})

Warm regards,
Admissions Office • GEMS Education Nepal
`;

        return {
          subject,
          html,
          text,
          source: 'ai',
        };
      }
    } catch (err) {
      console.warn('[FollowUpEmail] AI generation failed or timed out, falling back to smart template:', err);
    }
  }

  // Fallback: Smart template grounded in notes
  const subject =
    context.customSubject ||
    `Follow-up on your ${course} Inquiry — ${college} Admissions`;

  const fallbackPoints: string[] = [];

  if (allNotes.length > 0) {
    allNotes.forEach((n) => {
      fallbackPoints.push(n.text);
    });
  } else {
    fallbackPoints.push(`Review eligibility criteria for ${course} at ${college}.`);
    fallbackPoints.push(`Explore merit scholarship concessions (up to 50% tuition waiver).`);
    fallbackPoints.push(`Schedule an in-depth counseling call to confirm fee installments and seat reservation.`);
  }

  const introParagraph = `Thank you for taking the time to connect with our admissions desk regarding your interest in <strong>${course}</strong> at <strong>${college}</strong>. Following our counseling discussion, we have compiled the key details and next steps for your application.`;

  const closingParagraph = `We want to ensure you have complete clarity before making your final decision. If you or your parents need additional information regarding fee structure, hostel facilities, or syllabus, please reply to this email or chat directly with Counselor ${counselor} on WhatsApp.`;

  const html = renderFollowUpHtml({
    subject,
    studentName,
    course,
    college,
    counselorName: counselor,
    counselorPhone,
    waLink,
    introParagraph,
    discussionPoints: fallbackPoints,
    counselorMessage: `We are committed to guiding you towards the best academic pathway for ${course}. Feel free to reach out anytime!`,
    closingParagraph,
  });

  const textPoints = fallbackPoints.map((p) => `• ${p}`).join('\n');
  const text = `Dear ${studentName},

${introParagraph.replace(/<[^>]+>/g, '')}

COUNSELING DISCUSSION & NOTES SUMMARY:
${textPoints}

YOUR DESIGNATED ADMISSIONS COUNSELOR:
- Counselor: ${counselor}
- WhatsApp: ${counselorPhone}
- Direct WhatsApp Link: ${waLink}

${closingParagraph}

Warm regards,
${counselor}
Admissions Office • GEMS Education Nepal & India
`;

  return {
    subject,
    html,
    text,
    source: 'fallback',
  };
}

export interface SendLeadFollowUpResult {
  success: boolean;
  emailSent: boolean;
  id?: string;
  subject?: string;
  recipient?: string;
  error?: string;
  source?: 'ai' | 'fallback';
  updatedNotes?: LeadNote[];
}

/**
 * Loads a lead, compiles its notes, generates a tailored follow-up email,
 * and sends it via Resend. Also updates lead timeline notes and raw_data.
 */
export async function sendLeadFollowUpEmail(params: {
  admin: SupabaseClient;
  accountId: string;
  leadId: string;
  currentUserId?: string;
  latestNoteText?: string;
  customSubject?: string;
}): Promise<SendLeadFollowUpResult> {
  const { admin, accountId, leadId, currentUserId, latestNoteText, customSubject } = params;

  // 1. Fetch the lead
  const { data: lead, error: leadError } = await admin
    .from('meta_lead_logs')
    .select('*')
    .eq('id', leadId)
    .maybeSingle();

  if (leadError || !lead) {
    return { success: false, emailSent: false, error: leadError?.message || 'Lead not found' };
  }

  if (!lead.email || !lead.email.includes('@')) {
    return {
      success: false,
      emailSent: false,
      error: 'Lead does not have a valid email address recorded',
    };
  }

  // 2. Load email config
  const emailConfig = await loadEmailConfig(admin, accountId);
  if (!emailConfig?.apiKey) {
    return {
      success: false,
      emailSent: false,
      error: 'Resend API key is not configured for this workspace',
    };
  }

  // 3. Load AI config (swallow error if none)
  const aiConfig = await loadAiConfig(admin, accountId).catch(() => null);

  // 4. Resolve counselor details with workspace WhatsApp Cloud AI number
  const waPhone = await getWorkspaceWhatsAppPhone(admin, accountId);
  let counselorName = 'Senior Admissions Counselor';
  let counselorPhone = waPhone.displayPhone;
  let counselorEmail: string | undefined;

  const counselorUserId = lead.assigned_to || currentUserId;
  if (counselorUserId) {
    const { data: profile } = await admin
      .from('profiles')
      .select('full_name, email')
      .eq('user_id', counselorUserId)
      .maybeSingle();

    if (profile) {
      counselorName = profile.full_name || counselorName;
      counselorEmail = profile.email || undefined;
    }
  }

  // 5. Generate follow-up email tailored to notes
  const generated = await generateNotesFollowUpEmail(
    {
      studentName: lead.full_name,
      studentEmail: lead.email,
      studentPhone: lead.phone,
      college: lead.college,
      course: lead.course,
      city: lead.city,
      campaignName: lead.campaign_name,
      counselorName,
      counselorPhone,
      counselorEmail,
      notes: parseLeadNotes(lead.notes),
      latestNoteText,
      customSubject,
    },
    aiConfig
  );

  // 6. Send email via Resend
  const sendResult = await sendEmailWithResend({
    apiKey: emailConfig.apiKey,
    from: emailConfig.fromEmail,
    to: lead.email,
    subject: generated.subject,
    html: generated.html,
    text: generated.text,
    replyTo: emailConfig.replyToEmail || counselorEmail,
  });

  if (!sendResult.success) {
    return {
      success: false,
      emailSent: false,
      error: sendResult.error || 'Failed to dispatch email via Resend',
    };
  }

  // 7. Append automated system note and log delivery
  const existingNotes = parseLeadNotes(lead.notes);
  const newTimelineNote: LeadNote = {
    id: crypto.randomUUID(),
    text: `📧 Auto follow-up email sent to ${lead.email} ("${generated.subject}") tailored to counseling notes.`,
    author_name: 'AI Admissions Agent',
    author_type: 'system',
    created_at: new Date().toISOString(),
  };

  const updatedNotes = [...existingNotes, newTimelineNote];
  const currentRaw = lead.raw_data && typeof lead.raw_data === 'object' ? lead.raw_data : {};
  const updatedRaw = {
    ...currentRaw,
    email_delivery: {
      sent: true,
      sent_at: new Date().toISOString(),
      message_id: sendResult.id,
      to: lead.email,
      subject: generated.subject,
    },
    last_follow_up_email: {
      sent: true,
      sent_at: new Date().toISOString(),
      message_id: sendResult.id,
      subject: generated.subject,
      to: lead.email,
      source: generated.source,
    },
  };

  await admin
    .from('meta_lead_logs')
    .update({
      notes: serializeLeadNotes(updatedNotes),
      raw_data: updatedRaw,
      updated_at: new Date().toISOString(),
    })
    .eq('id', lead.id);

  return {
    success: true,
    emailSent: true,
    id: sendResult.id,
    subject: generated.subject,
    recipient: lead.email,
    source: generated.source,
    updatedNotes,
  };
}
