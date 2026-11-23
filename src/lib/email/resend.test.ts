import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendEmailWithResend, renderLeadWelcomeEmail } from './resend';

describe('Resend Email Engine', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders welcome email with student and program details', () => {
    const rendered = renderLeadWelcomeEmail({
      fullName: 'Ayush Sapkota',
      email: 'ayush@example.com',
      college: 'GEMS NIT',
      course: 'MBA',
      campaignName: 'Mamata MBA',
      counselorName: 'Mamata Yadav',
      counselorPhone: '+9779841234567',
    });

    expect(rendered.subject).toContain('MBA');
    expect(rendered.subject).toContain('GEMS NIT');
    expect(rendered.text).toContain('Dear Ayush Sapkota');
    expect(rendered.text).toContain('MBA at GEMS NIT');
    expect(rendered.text).toContain('Mamata Yadav');
    expect(rendered.html).toContain('Ayush Sapkota');
    expect(rendered.html).toContain('Chat on WhatsApp (+9779841234567)');
  });

  it('substitutes custom subject template correctly', () => {
    const rendered = renderLeadWelcomeEmail(
      {
        fullName: 'Abhinandani Singh',
        email: 'abhi@example.com',
        college: 'GEMS Institute',
        course: 'B.Tech CSE',
      },
      'Admission Update for {{name}}: {{course}} at {{college}}'
    );

    expect(rendered.subject).toBe(
      'Admission Update for Abhinandani: B.Tech CSE at GEMS Institute'
    );
  });

  it('fails gracefully when Resend API key is missing', async () => {
    const result = await sendEmailWithResend({
      apiKey: '',
      from: 'admissions@gems.edu.np',
      to: 'student@example.com',
      subject: 'Test',
      html: '<p>Test</p>',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('API key is missing');
  });

  it('fails gracefully when recipient email is invalid', async () => {
    const result = await sendEmailWithResend({
      apiKey: 're_123456',
      from: 'admissions@gems.edu.np',
      to: 'invalid-email',
      subject: 'Test',
      html: '<p>Test</p>',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('No valid recipient');
  });

  it('sends email successfully when API returns 200', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'email-msg-999' }),
    });

    const result = await sendEmailWithResend({
      apiKey: 're_123456',
      from: 'GEMS Admissions <onboarding@resend.dev>',
      to: 'ayush@example.com',
      subject: 'Welcome',
      html: '<p>Welcome</p>',
    });

    expect(result.success).toBe(true);
    expect(result.id).toBe('email-msg-999');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer re_123456',
        }),
      })
    );
  });
});
