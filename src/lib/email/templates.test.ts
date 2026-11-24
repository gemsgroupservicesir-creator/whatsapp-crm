import { describe, it, expect } from 'vitest';
import {
  DEFAULT_EMAIL_TEMPLATES,
  interpolateEmailTemplate,
  type TemplateInterpolationContext,
} from './templates';

describe('Email Templates Engine', () => {
  it('provides default starter templates with required categories', () => {
    expect(DEFAULT_EMAIL_TEMPLATES.length).toBeGreaterThanOrEqual(5);
    const categories = DEFAULT_EMAIL_TEMPLATES.map((t) => t.category);
    expect(categories).toContain('welcome');
    expect(categories).toContain('follow_up');
    expect(categories).toContain('scholarship');
    expect(categories).toContain('campus');
    expect(categories).toContain('fees');
  });

  it('interpolates template variables correctly into subject, html, and text', () => {
    const tmpl = DEFAULT_EMAIL_TEMPLATES[0]; // Welcome template
    const context: TemplateInterpolationContext = {
      fullName: 'Aarav Sharma',
      course: 'B.Tech AI & Data Science',
      college: 'NIT Campus Partner',
      counselorName: 'Senior Advisor Prakash',
      counselorPhone: '+977 980-1234567',
      year: '2027/28',
    };

    const rendered = interpolateEmailTemplate(tmpl, context);

    expect(rendered.subject).toContain('NIT Campus Partner');
    expect(rendered.subject).toContain('B.Tech AI & Data Science');
    expect(rendered.subject).toContain('2027/28');
    expect(rendered.html).toContain('Aarav Sharma');
    expect(rendered.html).toContain('Senior Advisor Prakash');
    expect(rendered.html).toContain('wa.me/9779801234567');
    expect(rendered.text).toContain('Aarav Sharma');
  });

  it('interpolates counseling notes into follow-up templates', () => {
    const tmpl = DEFAULT_EMAIL_TEMPLATES[1]; // Follow-up template
    const context: TemplateInterpolationContext = {
      fullName: 'Sunita Gurung',
      course: 'MBA Healthcare Management',
      college: 'GEMS University Partner',
      notes: 'Discussed 30% scholarship based on 85% score in undergraduate degree.',
      counselorName: 'Counselor Priya',
      counselorPhone: '+977 980-9999999',
    };

    const rendered = interpolateEmailTemplate(tmpl, context);

    expect(rendered.html).toContain('Sunita Gurung');
    expect(rendered.html).toContain('Discussed 30% scholarship');
    expect(rendered.html).toContain('Counselor Priya');
    expect(rendered.text).toContain('Discussed 30% scholarship');
  });

  it('handles missing or undefined context values gracefully with defaults', () => {
    const tmpl = {
      subject: 'Update for {{name}} regarding {{course}}',
      bodyHtml: '<p>Hello {{name}}, welcome to {{college}}!</p>',
    };

    const rendered = interpolateEmailTemplate(tmpl, {});

    expect(rendered.subject).toContain('Student');
    expect(rendered.subject).toContain('Academic Programs');
    expect(rendered.html).toContain('Student');
    expect(rendered.html).toContain('GEMS Education Partner Institutions');
  });

  it('sanitizes counselorPhone and wa_link to WhatsApp Cloud AI number when 0000 is passed', () => {
    const tmpl = {
      subject: 'Admissions Contact',
      bodyHtml: '<p>Contact us: {{counselor_phone}} or chat: <a href="{{wa_link}}">Chat</a></p>',
    };

    const rendered = interpolateEmailTemplate(tmpl, {
      counselorPhone: '+977 980-0000000',
    });

    expect(rendered.html).toContain('+91 89718 71113');
    expect(rendered.html).toContain('wa.me/918971871113');
    expect(rendered.html).not.toContain('0000000');
  });
});
