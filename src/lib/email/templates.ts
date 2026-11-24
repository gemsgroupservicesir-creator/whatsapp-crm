import type { SupabaseClient } from '@supabase/supabase-js';

export type EmailTemplateCategory =
  | 'welcome'
  | 'follow_up'
  | 'scholarship'
  | 'fees'
  | 'campus'
  | 'general';

export interface EmailTemplate {
  id: string;
  name: string;
  category: EmailTemplateCategory;
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  description?: string;
  isDefault?: boolean;
  variables: string[];
  created_at: string;
  updated_at: string;
}

export interface TemplateInterpolationContext {
  fullName?: string | null;
  firstName?: string | null;
  email?: string | null;
  phone?: string | null;
  college?: string | null;
  course?: string | null;
  city?: string | null;
  campaignName?: string | null;
  counselorName?: string | null;
  counselorPhone?: string | null;
  counselorEmail?: string | null;
  year?: string | null;
  notes?: string | null;
}

export const EMAIL_TEMPLATES_FIELD_NAME = '__email_templates__';

export const SUPPORTED_TEMPLATE_VARIABLES = [
  { tag: '{{name}}', description: 'Student Full Name' },
  { tag: '{{first_name}}', description: 'Student First Name' },
  { tag: '{{course}}', description: 'Selected Program / Course' },
  { tag: '{{college}}', description: 'Target College / University' },
  { tag: '{{city}}', description: 'Student Location / City' },
  { tag: '{{campaign}}', description: 'Admissions Campaign Name' },
  { tag: '{{counselor}}', description: 'Designated Counselor Name' },
  { tag: '{{counselor_phone}}', description: 'Counselor WhatsApp / Phone' },
  { tag: '{{counselor_email}}', description: 'Counselor Email Address' },
  { tag: '{{year}}', description: 'Academic Admissions Year (2027/28)' },
  { tag: '{{notes}}', description: 'Counselor & Admission Remarks' },
  { tag: '{{wa_link}}', description: 'One-Click WhatsApp Chat Link' },
];

/**
 * Default starter templates provided out-of-the-box for education & admissions CRM.
 */
export const DEFAULT_EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: 'tmpl-welcome-admissions',
    name: 'Admissions Welcome & Program Introduction',
    category: 'welcome',
    isDefault: true,
    description: 'Initial greeting sent to student leads immediately after inquiry with course and counselor details.',
    subject: 'Welcome to {{college}} — {{course}} Admissions {{year}}',
    variables: ['name', 'course', 'college', 'counselor', 'counselor_phone', 'year', 'wa_link'],
    created_at: '2026-11-20T00:00:00.000Z',
    updated_at: '2026-11-20T00:00:00.000Z',
    bodyText: `Dear {{name}},

Thank you for your interest in {{course}} at {{college}}!

We have received your admission enquiry. Our counseling team has reviewed your details and is ready to assist you with eligibility verification, fee breakdown, and scholarship criteria.

YOUR DESIGNATED ADMISSIONS COUNSELOR:
- Counselor: {{counselor}}
- WhatsApp: {{counselor_phone}}
- Direct Chat: {{wa_link}}

NEXT STEPS:
1. Verify examination eligibility and minimum score criteria.
2. Review merit scholarship slabs (up to 50% tuition waiver).
3. Schedule an in-person or video consultation with your counselor.

Reply directly to this email or connect with your advisor on WhatsApp.

Warm regards,
Admissions Office • GEMS Education Nepal & India`,
    bodyHtml: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Welcome to {{college}}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; }
    .header { background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); color: #ffffff; padding: 28px; text-align: left; }
    .content { padding: 28px; }
    .box { background-color: #f0fdf4; border-left: 4px solid #16a34a; padding: 14px 16px; border-radius: 6px; margin: 18px 0; }
    .card { background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 18px; margin: 20px 0; }
    .btn-wa { display: inline-block; background-color: #25D366; color: #ffffff !important; text-decoration: none; padding: 12px 22px; font-weight: 600; border-radius: 6px; text-align: center; margin-top: 10px; font-size: 14px; }
    .footer { background-color: #f1f5f9; padding: 18px 24px; font-size: 12px; color: #64748b; text-align: center; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.85; margin-bottom: 4px;">Admissions & Career Counseling</div>
      <h1 style="margin: 0; font-size: 20px; font-weight: 700;">Welcome to {{college}}</h1>
      <p style="margin: 4px 0 0 0; font-size: 13.5px; opacity: 0.9;">Direct Admissions Partner for Top Universities in India & Nepal</p>
    </div>
    <div class="content">
      <p style="font-size: 15.5px; margin-top: 0;">Dear <strong>{{name}}</strong>,</p>
      <p style="font-size: 14.5px; line-height: 1.6; color: #334155;">
        Thank you for your inquiry regarding <strong>{{course}}</strong> at <strong>{{college}}</strong>. We have received your admission enquiry and our counseling team has reviewed your profile!
      </p>
      <div class="box">
        <div style="font-weight: 600; color: #166534; font-size: 13.5px;">🎓 Enquiry Details Received:</div>
        <div style="font-size: 13px; color: #1e293b; margin-top: 4px;">
          • <strong>Program:</strong> {{course}}<br>
          • <strong>Institution:</strong> {{college}}<br>
          • <strong>Academic Year:</strong> {{year}}
        </div>
      </div>
      <div class="card">
        <div style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: #64748b; letter-spacing: 0.05em; margin-bottom: 6px;">Your Designated Admissions Advisor</div>
        <div style="font-size: 16px; font-weight: 700; color: #0f172a;">{{counselor}}</div>
        <p style="font-size: 13px; color: #475569; margin: 6px 0 12px 0;">
          Assigned to provide personalized guidance on fees, eligibility, syllabus, and scholarships.
        </p>
        <div>
          <a href="{{wa_link}}" class="btn-wa" target="_blank">💬 Chat on WhatsApp ({{counselor_phone}})</a>
        </div>
      </div>
      <h3 style="font-size: 14.5px; margin-top: 20px; color: #0f172a;">Next Steps for Your Admission:</h3>
      <ol style="font-size: 13.5px; color: #475569; padding-left: 20px; line-height: 1.6;">
        <li><strong>Eligibility Assessment:</strong> Review qualifying exam scores (+2 / CBSE / NEB).</li>
        <li><strong>Scholarship Breakdown:</strong> Calculate your merit concession percentage.</li>
        <li><strong>Seat Reservation:</strong> Secure admission seat before registration closes.</li>
      </ol>
      <p style="font-size: 13.5px; color: #64748b; margin-top: 20px;">
        Questions? Simply reply directly to this email or connect with your advisor on WhatsApp.
      </p>
    </div>
    <div class="footer">
      <p style="margin: 0 0 4px 0;"><strong>GEMS Education Admissions Office</strong></p>
      <p style="margin: 0;">Kathmandu, Nepal • Admissions Support: {{counselor_phone}}</p>
    </div>
  </div>
</body>
</html>`,
  },
  {
    id: 'tmpl-follow-up-notes',
    name: 'Counseling Follow-Up & Discussion Summary',
    category: 'follow_up',
    isDefault: true,
    description: 'Personalized follow-up email tailored to recent phone counseling or admission discussion notes.',
    subject: 'Follow-up regarding your {{course}} Inquiry — {{college}}',
    variables: ['name', 'course', 'college', 'notes', 'counselor', 'counselor_phone', 'wa_link'],
    created_at: '2026-11-20T00:00:00.000Z',
    updated_at: '2026-11-20T00:00:00.000Z',
    bodyText: `Dear {{name}},

Thank you for connecting with our admissions counseling desk regarding your interest in {{course}} at {{college}}.

COUNSELING DISCUSSION & HIGHLIGHTS:
{{notes}}

YOUR DESIGNATED COUNSELOR:
- Counselor: {{counselor}}
- WhatsApp: {{counselor_phone}}
- Direct WhatsApp Link: {{wa_link}}

We are committed to guiding you through every step of your application. Feel free to reply directly to this email or message us on WhatsApp with any questions.

Warm regards,
{{counselor}}
Admissions Office • GEMS Education Nepal`,
    bodyHtml: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Counseling Follow-Up</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; }
    .header { background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%); color: #ffffff; padding: 28px; text-align: left; }
    .content { padding: 28px; }
    .notes-box { background-color: #f8fafc; border-left: 4px solid #2563eb; padding: 16px; border-radius: 6px; margin: 18px 0; border-top: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; }
    .card { background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 18px; margin: 20px 0; }
    .btn-wa { display: inline-block; background-color: #25D366; color: #ffffff !important; text-decoration: none; padding: 12px 22px; font-weight: 600; border-radius: 6px; text-align: center; margin-top: 10px; font-size: 14px; }
    .footer { background-color: #f1f5f9; padding: 18px 24px; font-size: 12px; color: #64748b; text-align: center; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.85; margin-bottom: 4px;">📌 Admissions Counseling Follow-Up</div>
      <h1 style="margin: 0; font-size: 20px; font-weight: 700;">{{college}}</h1>
      <p style="margin: 4px 0 0 0; font-size: 13.5px; opacity: 0.9;">Direct Admissions Partner for Top Universities in India & Nepal</p>
    </div>
    <div class="content">
      <p style="font-size: 15.5px; margin-top: 0;">Dear <strong>{{name}}</strong>,</p>
      <p style="font-size: 14.5px; line-height: 1.6; color: #334155;">
        Thank you for speaking with our admissions team regarding <strong>{{course}}</strong> at <strong>{{college}}</strong>. Following our counseling discussion, we have compiled the key details and next steps for your application.
      </p>
      <div class="notes-box">
        <div style="font-weight: 700; color: #1e3a8a; font-size: 13.5px; margin-bottom: 8px;">📋 Counseling Discussion & Action Items:</div>
        <div style="font-size: 13.5px; line-height: 1.6; color: #334155; white-space: pre-wrap;">{{notes}}</div>
      </div>
      <div class="card">
        <div style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: #64748b; letter-spacing: 0.05em; margin-bottom: 6px;">Your Designated Admissions Advisor</div>
        <div style="font-size: 16px; font-weight: 700; color: #0f172a;">{{counselor}}</div>
        <p style="font-size: 13px; color: #475569; margin: 6px 0 12px 0;">
          Directly available for 1-on-1 counseling regarding fees, scholarship applications, and seat reservation.
        </p>
        <div>
          <a href="{{wa_link}}" class="btn-wa" target="_blank">💬 Chat with Counselor on WhatsApp ({{counselor_phone}})</a>
        </div>
      </div>
      <p style="font-size: 13.5px; line-height: 1.6; color: #475569;">
        We want to ensure you and your parents have complete clarity on fee installments and seat reservation before the upcoming intake deadline.
      </p>
      <p style="font-size: 13px; color: #64748b; margin-top: 20px;">
        Warm regards,<br>
        <strong>{{counselor}}</strong><br>
        Admissions Office • GEMS Education Nepal & India
      </p>
    </div>
    <div class="footer">
      <p style="margin: 0 0 4px 0;"><strong>GEMS Education Admissions Office</strong></p>
      <p style="margin: 0;">Kathmandu, Nepal • WhatsApp Support: {{counselor_phone}}</p>
    </div>
  </div>
</body>
</html>`,
  },
  {
    id: 'tmpl-scholarship-guide',
    name: 'Merit Scholarship & Fee Concession Guide',
    category: 'scholarship',
    description: 'Detailed scholarship eligibility criteria, percentage tiers, and fee breakdown.',
    subject: 'Merit Scholarship & Fee Concession for {{course}} — {{college}}',
    variables: ['name', 'course', 'college', 'counselor', 'counselor_phone', 'wa_link'],
    created_at: '2026-11-20T00:00:00.000Z',
    updated_at: '2026-11-20T00:00:00.000Z',
    bodyText: `Dear {{name}},

We are pleased to share merit scholarship details for {{course}} at {{college}}.

SCHOLARSHIP TIERS AVAILABLE:
• Tier 1 (>85% marks in Class 12 / NEB / CBSE): Up to 50% Tuition Fee Concession
• Tier 2 (75% - 85% marks): Up to 35% Tuition Fee Concession
• Tier 3 (65% - 75% marks): Up to 20% Tuition Fee Concession

HOW TO CLAIM YOUR SCHOLARSHIP:
1. Submit your Class 10 & 12 mark sheets for instant evaluation.
2. Complete provisional verification with Counselor {{counselor}}.
3. Lock in your scholarship grant certificate before quota seats fill.

Connect directly on WhatsApp at {{counselor_phone}} to check your exact scholarship eligibility.

Warm regards,
Scholarship Committee • GEMS Education`,
    bodyHtml: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Merit Scholarship Details</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; }
    .header { background: linear-gradient(135deg, #065f46 0%, #10b981 100%); color: #ffffff; padding: 28px; text-align: left; }
    .content { padding: 28px; }
    .tier-box { background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 18px 0; }
    .btn-wa { display: inline-block; background-color: #25D366; color: #ffffff !important; text-decoration: none; padding: 12px 22px; font-weight: 600; border-radius: 6px; text-align: center; margin-top: 10px; font-size: 14px; }
    .footer { background-color: #f1f5f9; padding: 18px 24px; font-size: 12px; color: #64748b; text-align: center; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.85; margin-bottom: 4px;">🎓 Merit Scholarship Notification</div>
      <h1 style="margin: 0; font-size: 20px; font-weight: 700;">{{college}}</h1>
      <p style="margin: 4px 0 0 0; font-size: 13.5px; opacity: 0.9;">Direct Admissions Partner for Top Universities in India & Nepal</p>
    </div>
    <div class="content">
      <p style="font-size: 15.5px; margin-top: 0;">Dear <strong>{{name}}</strong>,</p>
      <p style="font-size: 14.5px; line-height: 1.6; color: #334155;">
        We have great news! Based on your enquiry for <strong>{{course}}</strong> at <strong>{{college}}</strong>, you may qualify for our <strong>Academic Merit Scholarship Quota</strong>.
      </p>
      <div class="tier-box">
        <div style="font-weight: 700; color: #065f46; font-size: 13.5px; margin-bottom: 10px;">🌟 Scholarship Concession Tiers:</div>
        <div style="font-size: 13px; line-height: 1.7; color: #1e293b;">
          • <strong>Tier 1 (&gt;85% Marks):</strong> Up to <strong>50% Tuition Fee Concession</strong><br>
          • <strong>Tier 2 (75% – 85% Marks):</strong> Up to <strong>35% Tuition Fee Concession</strong><br>
          • <strong>Tier 3 (65% – 75% Marks):</strong> Up to <strong>20% Tuition Fee Concession</strong>
        </div>
      </div>
      <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 18px; margin: 20px 0;">
        <div style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: #64748b; margin-bottom: 4px;">Admissions & Scholarship Advisor</div>
        <div style="font-size: 16px; font-weight: 700; color: #0f172a;">{{counselor}}</div>
        <p style="font-size: 13px; color: #475569; margin: 6px 0 12px 0;">
          Submit your score card today on WhatsApp to get your exact fee concession letter.
        </p>
        <div>
          <a href="{{wa_link}}" class="btn-wa" target="_blank">💬 Verify Scholarship on WhatsApp ({{counselor_phone}})</a>
        </div>
      </div>
      <p style="font-size: 13px; color: #64748b;">
        *Note: Merit scholarship seats are allocated on a first-come, first-served basis according to university quota.
      </p>
    </div>
    <div class="footer">
      <p style="margin: 0 0 4px 0;"><strong>GEMS Education Scholarship Committee</strong></p>
      <p style="margin: 0;">Kathmandu, Nepal • Scholarship Desk: {{counselor_phone}}</p>
    </div>
  </div>
</body>
</html>`,
  },
  {
    id: 'tmpl-campus-hostel',
    name: 'Campus Life, Hostel & Facilities Overview',
    category: 'campus',
    description: 'Overview of student hostels, hygienic mess food, transport, and campus tour scheduling.',
    subject: 'Campus Life, Hostel & Transport Details for {{course}} — {{college}}',
    variables: ['name', 'course', 'college', 'counselor', 'counselor_phone', 'wa_link'],
    created_at: '2026-11-20T00:00:00.000Z',
    updated_at: '2026-11-20T00:00:00.000Z',
    bodyText: `Dear {{name}},

Many students and parents ask about campus accommodations and safety while preparing for {{course}} at {{college}}.

CAMPUS HIGHLIGHTS:
• Separate, secured hostels for boys & girls with 24/7 security & Wi-Fi.
• Multi-cuisine hygienic dining (Veg & Non-Veg options).
• Modern research labs, digital libraries, and sports complexes.
• Direct campus transportation from major transit points.

Would you like to schedule an in-person or 360° virtual campus walkthrough? Contact Counselor {{counselor}} at {{counselor_phone}} to arrange your visit.

Warm regards,
Campus Admissions Office • GEMS Education`,
    bodyHtml: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Campus Life & Facilities</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; }
    .header { background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); color: #ffffff; padding: 28px; text-align: left; }
    .content { padding: 28px; }
    .btn-wa { display: inline-block; background-color: #25D366; color: #ffffff !important; text-decoration: none; padding: 12px 22px; font-weight: 600; border-radius: 6px; text-align: center; margin-top: 10px; font-size: 14px; }
    .footer { background-color: #f1f5f9; padding: 18px 24px; font-size: 12px; color: #64748b; text-align: center; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.85; margin-bottom: 4px;">🏫 Campus & Accommodation Guide</div>
      <h1 style="margin: 0; font-size: 20px; font-weight: 700;">{{college}}</h1>
      <p style="margin: 4px 0 0 0; font-size: 13.5px; opacity: 0.9;">Direct Admissions Partner for Top Universities in India & Nepal</p>
    </div>
    <div class="content">
      <p style="font-size: 15.5px; margin-top: 0;">Dear <strong>{{name}}</strong>,</p>
      <p style="font-size: 14.5px; line-height: 1.6; color: #334155;">
        Choosing where you live during your studies in <strong>{{course}}</strong> is just as important as choosing your degree. Here is what life looks like at <strong>{{college}}</strong>:
      </p>
      <div style="background-color: #f5f3ff; border: 1px solid #ddd6fe; border-radius: 8px; padding: 16px; margin: 18px 0;">
        <div style="font-weight: 700; color: #5b21b6; font-size: 13.5px; margin-bottom: 8px;">🏡 Hostel & Student Facilities:</div>
        <div style="font-size: 13px; line-height: 1.7; color: #334155;">
          • <strong>Hostel Accommodations:</strong> AC / Non-AC rooms with attached washrooms & 24/7 security.<br>
          • <strong>Dining & Mess:</strong> Hygienic meal plans catering to multi-regional cuisines.<br>
          • <strong>Academic Infrastructure:</strong> Smart lecture halls, hi-tech labs, and expansive digital library.<br>
          • <strong>Sports & Recreation:</strong> Indoor gym, football ground, basketball court, and cafeteria.
        </div>
      </div>
      <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 18px; margin: 20px 0;">
        <div style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: #64748b; margin-bottom: 4px;">Campus Tour & Accommodation Desk</div>
        <div style="font-size: 16px; font-weight: 700; color: #0f172a;">{{counselor}}</div>
        <p style="font-size: 13px; color: #475569; margin: 6px 0 12px 0;">
          Want to schedule a campus visit or receive hostel fee photos and video walkthroughs?
        </p>
        <div>
          <a href="{{wa_link}}" class="btn-wa" target="_blank">💬 Inquire on WhatsApp ({{counselor_phone}})</a>
        </div>
      </div>
    </div>
    <div class="footer">
      <p style="margin: 0 0 4px 0;"><strong>GEMS Education Admissions Office</strong></p>
      <p style="margin: 0;">Kathmandu, Nepal • Admissions Support: {{counselor_phone}}</p>
    </div>
  </div>
</body>
</html>`,
  },
  {
    id: 'tmpl-deadline-reminder',
    name: 'Urgent Seat Reservation Deadline Reminder',
    category: 'fees',
    description: 'Urgency notice alerting students that quota seats and early scholarship deadlines are closing soon.',
    subject: 'Urgent: Admission Seat Reservation for {{course}} at {{college}} (Closing Soon)',
    variables: ['name', 'course', 'college', 'counselor', 'counselor_phone', 'wa_link'],
    created_at: '2026-11-20T00:00:00.000Z',
    updated_at: '2026-11-20T00:00:00.000Z',
    bodyText: `Dear {{name}},

This is an important admissions update regarding your inquiry for {{course}} at {{college}}.

The current round of scholarship seats and early admission quota is filling rapidly. To avoid missing out on your preferred branch and scholarship eligibility, we encourage you to confirm your seat reservation this week.

HOW TO SECURE YOUR SEAT:
1. Contact Counselor {{counselor}} immediately on WhatsApp at {{counselor_phone}}.
2. Submit your academic documents for final clearance.
3. Receive your official Provisional Admission Letter.

Direct WhatsApp Link: {{wa_link}}

Warm regards,
Admissions Directorate • GEMS Education`,
    bodyHtml: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Seat Reservation Reminder</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; }
    .header { background: linear-gradient(135deg, #b91c1c 0%, #ea580c 100%); color: #ffffff; padding: 28px; text-align: left; }
    .content { padding: 28px; }
    .alert-box { background-color: #fff7ed; border-left: 4px solid #f97316; padding: 14px 16px; border-radius: 6px; margin: 18px 0; }
    .btn-wa { display: inline-block; background-color: #25D366; color: #ffffff !important; text-decoration: none; padding: 12px 22px; font-weight: 600; border-radius: 6px; text-align: center; margin-top: 10px; font-size: 14px; }
    .footer { background-color: #f1f5f9; padding: 18px 24px; font-size: 12px; color: #64748b; text-align: center; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.85; margin-bottom: 4px;">⏰ Admissions Intake Deadline Notice</div>
      <h1 style="margin: 0; font-size: 20px; font-weight: 700;">Seat Reservation: {{course}}</h1>
      <p style="margin: 4px 0 0 0; font-size: 13.5px; opacity: 0.9;">{{college}} • Direct Admissions Quota</p>
    </div>
    <div class="content">
      <p style="font-size: 15.5px; margin-top: 0;">Dear <strong>{{name}}</strong>,</p>
      <p style="font-size: 14.5px; line-height: 1.6; color: #334155;">
        This is a priority reminder regarding your admission application for <strong>{{course}}</strong> at <strong>{{college}}</strong>.
      </p>
      <div class="alert-box">
        <div style="font-weight: 700; color: #c2410c; font-size: 13.5px;">⚠️ Admission Seats Filling Rapidly:</div>
        <p style="margin: 4px 0 0 0; font-size: 13px; color: #7c2d12; line-height: 1.6;">
          Due to high application volume from Nepal and India, scholarship quota seats are nearing capacity. We urge you to confirm your seat reservation this week to secure your enrollment.
        </p>
      </div>
      <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 18px; margin: 20px 0;">
        <div style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: #64748b; margin-bottom: 4px;">Priority Admissions Advisor</div>
        <div style="font-size: 16px; font-weight: 700; color: #0f172a;">{{counselor}}</div>
        <p style="font-size: 13px; color: #475569; margin: 6px 0 12px 0;">
          Contact your advisor immediately to lock in your provisional admission letter.
        </p>
        <div>
          <a href="{{wa_link}}" class="btn-wa" target="_blank">💬 Reserve Seat on WhatsApp ({{counselor_phone}})</a>
        </div>
      </div>
    </div>
    <div class="footer">
      <p style="margin: 0 0 4px 0;"><strong>GEMS Education Admissions Office</strong></p>
      <p style="margin: 0;">Kathmandu, Nepal • Direct Line: {{counselor_phone}}</p>
    </div>
  </div>
</body>
</html>`,
  },
];

/**
 * Loads all email templates for a workspace from custom_fields.
 * Returns default starter templates if none are saved yet.
 */
export async function loadEmailTemplates(
  db: SupabaseClient,
  accountId: string
): Promise<EmailTemplate[]> {
  try {
    const { data } = await db
      .from('custom_fields')
      .select('field_options')
      .eq('account_id', accountId)
      .eq('field_name', EMAIL_TEMPLATES_FIELD_NAME)
      .maybeSingle();

    if (
      data?.field_options &&
      typeof data.field_options === 'object' &&
      Array.isArray((data.field_options as Record<string, unknown>).templates)
    ) {
      const saved = (data.field_options as Record<string, unknown>).templates as EmailTemplate[];
      if (saved.length > 0) return saved;
    }
  } catch (err) {
    console.warn('[EmailTemplates] Failed to load templates from custom_fields:', err);
  }

  return DEFAULT_EMAIL_TEMPLATES;
}

/**
 * Saves all email templates for a workspace into custom_fields.
 */
export async function saveEmailTemplates(
  db: SupabaseClient,
  accountId: string,
  userId: string,
  templates: EmailTemplate[]
): Promise<void> {
  const { data: existing } = await db
    .from('custom_fields')
    .select('id')
    .eq('account_id', accountId)
    .eq('field_name', EMAIL_TEMPLATES_FIELD_NAME)
    .maybeSingle();

  const payload = {
    templates,
    updated_at: new Date().toISOString(),
  };

  if (existing?.id) {
    const { error: updateErr } = await db
      .from('custom_fields')
      .update({
        field_options: payload,
      })
      .eq('id', existing.id);

    if (updateErr) throw updateErr;
  } else {
    const { error: insertErr } = await db.from('custom_fields').insert({
      account_id: accountId,
      user_id: userId,
      field_name: EMAIL_TEMPLATES_FIELD_NAME,
      field_type: 'json',
      field_options: payload,
    });

    if (insertErr) throw insertErr;
  }
}

/**
 * Interpolates variables in subject and body for a specific student lead context.
 */
export function interpolateEmailTemplate(
  template: { subject: string; bodyHtml: string; bodyText?: string },
  context: TemplateInterpolationContext
): { subject: string; html: string; text: string } {
  const fullName = (context.fullName || 'Student').trim();
  const firstName = context.firstName || fullName.split(' ')[0] || fullName;
  const course = (context.course || 'Academic Programs').trim();
  const college = (context.college || 'GEMS Education Partner Institutions').trim();
  const city = (context.city || 'Nepal / India').trim();
  const campaign = (context.campaignName || 'Admissions Enquiry').trim();
  const counselor = (context.counselorName || 'Senior Admissions Counselor').trim();
  const counselorPhone = (context.counselorPhone || '+977 980-0000000').trim();
  const counselorEmail = (context.counselorEmail || 'admissions@gemsgroup.edu.np').trim();
  const year = (context.year || '2027/28').trim();
  const notes = (context.notes || 'Counseling review underway. Discussed admission requirements and curriculum.').trim();

  const cleanPhone = counselorPhone.replace(/[^0-9+]/g, '');
  const waLink = `https://wa.me/${cleanPhone.replace('+', '')}?text=${encodeURIComponent(
    `Hello ${counselor}, I am following up on my enquiry for ${course} at ${college}.`
  )}`;

  const replacers: [RegExp, string][] = [
    [/\{\{name\}\}/gi, fullName],
    [/\{\{first_name\}\}/gi, firstName],
    [/\{\{course\}\}/gi, course],
    [/\{\{college\}\}/gi, college],
    [/\{\{city\}\}/gi, city],
    [/\{\{campaign\}\}/gi, campaign],
    [/\{\{counselor\}\}/gi, counselor],
    [/\{\{counselor_phone\}\}/gi, counselorPhone],
    [/\{\{counselor_email\}\}/gi, counselorEmail],
    [/\{\{year\}\}/gi, year],
    [/\{\{notes\}\}/gi, notes],
    [/\{\{wa_link\}\}/gi, waLink],
  ];

  let subject = template.subject;
  let html = template.bodyHtml;
  let text = template.bodyText || template.bodyHtml.replace(/<[^>]+>/g, ' ');

  for (const [regex, val] of replacers) {
    subject = subject.replace(regex, val);
    html = html.replace(regex, val);
    text = text.replace(regex, val);
  }

  return { subject, html, text };
}
