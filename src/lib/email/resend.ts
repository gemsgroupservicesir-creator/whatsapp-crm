/**
 * Resend Email Delivery Engine
 *
 * Lightweight, zero-dependency email sending via the official Resend REST API (https://resend.com).
 * Supports automated admissions welcome emails, counselor notifications, and manual outreach.
 */

export interface ResendEmailOptions {
  apiKey: string;
  from: string;
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  tags?: { name: string; value: string }[];
}

export interface ResendSendResult {
  success: boolean;
  id?: string;
  error?: string;
}

export interface LeadEmailContext {
  fullName?: string | null;
  email: string;
  phone?: string | null;
  college?: string | null;
  course?: string | null;
  city?: string | null;
  campaignName?: string | null;
  counselorName?: string | null;
  counselorPhone?: string | null;
  counselorEmail?: string | null;
}

const RESEND_API_URL = 'https://api.resend.com/emails';

/**
 * Sends an email using the Resend HTTP REST API.
 */
export async function sendEmailWithResend(
  options: ResendEmailOptions
): Promise<ResendSendResult> {
  const { apiKey, from, to, subject, html, text, replyTo, tags } = options;

  if (!apiKey || !apiKey.trim()) {
    return { success: false, error: 'Resend API key is missing' };
  }

  const recipients = Array.isArray(to) ? to : [to];
  const validRecipients = recipients
    .map((e) => e.trim())
    .filter((e) => e.includes('@'));

  if (validRecipients.length === 0) {
    return { success: false, error: 'No valid recipient email address provided' };
  }

  const body: Record<string, unknown> = {
    from: from.trim(),
    to: validRecipients,
    subject: subject.trim(),
    html: html.trim(),
  };

  if (text && text.trim()) {
    body.text = text.trim();
  }

  if (replyTo && replyTo.trim()) {
    body.reply_to = replyTo.trim();
  }

  if (tags && tags.length > 0) {
    body.tags = tags;
  }

  try {
    const res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      const errMsg =
        data?.message ||
        data?.error ||
        `Resend API error (HTTP ${res.status}): ${res.statusText}`;
      console.error('[Resend] Send email failed:', errMsg);
      return { success: false, error: errMsg };
    }

    return {
      success: true,
      id: data?.id,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Resend] Network/timeout error:', message);
    return { success: false, error: message };
  }
}

/**
 * Renders an admissions welcome email tailored to the student and program.
 */
export function renderLeadWelcomeEmail(
  context: LeadEmailContext,
  customSubject?: string
): { subject: string; html: string; text: string } {
  const studentName = (context.fullName || 'Student').trim();
  const firstName = studentName.split(' ')[0] || studentName;
  const course = (context.course || 'Higher Education').trim();
  const college = (context.college || 'GEMS Education Partner Institutions').trim();
  const counselor = (context.counselorName || 'Senior Admissions Counselor').trim();
  let counselorPhone = (context.counselorPhone || '+91 89718 71113').trim();
  if (!counselorPhone || counselorPhone.includes('000000') || counselorPhone.includes('980-0000')) {
    counselorPhone = '+91 89718 71113';
  }
  const cleanPhone = counselorPhone.replace(/[^0-9]/g, '');
  const waLink = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(
    `Hello ${counselor}, I received your admissions welcome email regarding ${course}. I would like more details!`
  )}`;

  const subject = customSubject
    ? customSubject
        .replace(/\{\{name\}\}/gi, firstName)
        .replace(/\{\{course\}\}/gi, course)
        .replace(/\{\{college\}\}/gi, college)
        .replace(/\{\{year\}\}/gi, '2027/28')
    : `Welcome to GEMS Admissions — ${course} Inquiry (${college})`;

  const text = `Dear ${studentName},

Thank you for your interest in ${course} at ${college}!

We have received your admission enquiry. Our admissions counseling team is here to guide you through every step of your application, eligibility assessment, fee structure, and scholarship opportunities.

YOUR DESIGNATED ADMISSIONS COUNSELOR:
- Counselor: ${counselor}
- WhatsApp: ${counselorPhone}
- Direct WhatsApp Chat: ${waLink}

NEXT STEPS:
1. Review your eligibility for ${course}.
2. Explore available merit scholarships (up to 50% tuition concession).
3. Schedule an in-person or video counseling session.

If you have any questions right away, feel free to reply directly to this email or reach out to us on WhatsApp at ${counselorPhone}.

Warm regards,
Admissions Office
GEMS Education Nepal & India Admissions
Website: https://gems.edu.np
`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -2px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; }
    .header { background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%); color: #ffffff; padding: 32px 28px; text-align: left; }
    .header h1 { margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.02em; }
    .header p { margin: 8px 0 0 0; font-size: 14px; opacity: 0.9; }
    .content { padding: 28px; }
    .lead-box { background-color: #f0fdf4; border-left: 4px solid #16a34a; padding: 14px 16px; border-radius: 6px; margin: 18px 0; }
    .counselor-card { background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 18px; margin: 24px 0; }
    .counselor-header { font-size: 13px; text-transform: uppercase; font-weight: 700; color: #64748b; letter-spacing: 0.05em; margin-bottom: 8px; }
    .counselor-name { font-size: 17px; font-weight: 700; color: #0f172a; }
    .steps { margin: 20px 0; padding-left: 20px; }
    .steps li { margin-bottom: 8px; line-height: 1.5; }
    .btn { display: inline-block; background-color: #2563eb; color: #ffffff !important; text-decoration: none; padding: 13px 24px; font-weight: 600; border-radius: 6px; text-align: center; margin-top: 10px; }
    .btn-wa { background-color: #25D366; color: #ffffff !important; margin-left: 8px; }
    .footer { background-color: #f1f5f9; padding: 20px 28px; font-size: 12px; color: #64748b; text-align: center; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.85; margin-bottom: 4px;">Admissions & Career Counseling</div>
      <h1>Welcome to GEMS Education</h1>
      <p>Direct Admissions Partner for Top Universities in India & Nepal</p>
    </div>

    <div class="content">
      <p style="font-size: 16px; line-height: 1.6;">Dear <strong>${studentName}</strong>,</p>

      <p style="font-size: 15px; line-height: 1.6; color: #334155;">
        Thank you for your interest in <strong>${course}</strong> at <strong>${college}</strong>. We have received your admission enquiry and our counseling team has reviewed your profile!
      </p>

      <div class="lead-box">
        <div style="font-weight: 600; color: #166534; font-size: 14px;">🎓 Enquiry Details Received:</div>
        <div style="font-size: 13.5px; color: #1e293b; margin-top: 4px;">
          • <strong>Program:</strong> ${course}<br>
          • <strong>Institution:</strong> ${college}<br>
          ${context.campaignName ? `• <strong>Admissions Campaign:</strong> ${context.campaignName}<br>` : ''}
          ${context.city ? `• <strong>Preferred City / Location:</strong> ${context.city}<br>` : ''}
        </div>
      </div>

      <div class="counselor-card">
        <div class="counselor-header">Your Designated Admissions Advisor</div>
        <div class="counselor-name">${counselor}</div>
        <p style="font-size: 13.5px; color: #475569; margin: 6px 0 14px 0;">
          Assigned to provide personalized guidance on admission requirements, semester fees, and scholarship applications.
        </p>
        <div>
          <a href="${waLink}" class="btn btn-wa" target="_blank" rel="noopener noreferrer">
            💬 Chat on WhatsApp (${counselorPhone})
          </a>
        </div>
      </div>

      <h3 style="font-size: 15px; margin-top: 24px; color: #0f172a;">Next Steps for Your Admission:</h3>
      <ol class="steps" style="font-size: 14px; color: #475569;">
        <li><strong>Eligibility Assessment:</strong> Review your academic scores for direct admission and scholarship quota.</li>
        <li><strong>Fee Structure & Syllabus:</strong> Download the detailed program syllabus and fee installment breakdown.</li>
        <li><strong>Seat Reservation:</strong> Secure your admission seat before deadline.</li>
      </ol>

      <p style="font-size: 14px; color: #64748b; line-height: 1.5; margin-top: 24px;">
        Have immediate questions? Simply reply directly to this email or connect with your advisor on WhatsApp.
      </p>
    </div>

    <div class="footer">
      <p style="margin: 0 0 6px 0;"><strong>GEMS Education Admissions Office</strong></p>
      <p style="margin: 0 0 4px 0;">Kathmandu, Nepal • Admissions Support: ${counselorPhone}</p>
      <p style="margin: 0;">This email was sent in response to your educational enquiry.</p>
    </div>
  </div>
</body>
</html>`;

  return { subject, html, text };
}
