import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

const h = vi.hoisted(() => ({
  loadAiConfig: vi.fn(),
  generateReply: vi.fn(),
  getWorkspaceWhatsAppPhone: vi.fn(),
  scrapeUniversityWebsite: vi.fn(),
}));

vi.mock('@/lib/ai/config', () => ({
  loadAiConfig: h.loadAiConfig,
  loadEmbeddingsKey: vi.fn().mockResolvedValue({ key: null, corrupt: false }),
}));
vi.mock('@/lib/ai/generate', () => ({
  generateReply: h.generateReply,
}));
vi.mock('@/lib/whatsapp/wa-phone', () => ({
  getWorkspaceWhatsAppPhone: h.getWorkspaceWhatsAppPhone,
}));
vi.mock('./scraper', () => ({
  scrapeUniversityWebsite: h.scrapeUniversityWebsite,
}));

import {
  findMatchingCounsellingPlaybook,
  generateCounsellingKit,
  renderCounsellingEmailHtml,
  type CounsellingPlaybook,
} from './engine';

beforeEach(() => {
  vi.clearAllMocks();
  h.getWorkspaceWhatsAppPhone.mockResolvedValue({
    displayPhone: '+91 89718 71113',
    cleanPhone: '918971871113',
    waLink: 'https://wa.me/918971871113',
  });
});

function mockDbWithPlaybooks(playbooks: CounsellingPlaybook[]): SupabaseClient {
  return {
    from: vi.fn((table: string) => {
      if (table === 'custom_fields') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: { field_options: { playbooks } },
                    error: null,
                  }),
              }),
            }),
          }),
        };
      }
      // meta_lead_logs fallback
      return {
        select: () => ({
          eq: () => ({
            not: () => ({
              order: () => ({
                limit: () => Promise.resolve({ data: [], error: null }),
              }),
            }),
          }),
        }),
      };
    }),
  } as unknown as SupabaseClient;
}

describe('Agent Counselling engine', () => {
  it('matches active playbooks by university, course, or inbound message and honors automation flags', async () => {
    const playbooks: CounsellingPlaybook[] = [
      {
        id: 'pb-1',
        universityName: 'NIT Rourkela',
        courseName: 'AI & ML Program',
        websiteUrl: 'https://nitrkl.ac.in/aiml',
        websiteSynced: true,
        universityOverview: 'Top NIT campus',
        counsellingPoints: [],
        openingPitch: 'Hello',
        objectionHandlers: [],
        whatsappReplyDraft: 'Hi',
        emailDraft: {
          subject: 'Subject',
          headline: 'Headline',
          bodyText: 'Body',
          bodyHtml: '<p>Body</p>',
          summaryPoints: [],
        },
        autoWhatsappEnabled: true,
        autoEmailEnabled: false,
        createdBy: 'u-1',
        createdAt: '2026-11-25T00:00:00Z',
        updatedAt: '2026-11-25T00:00:00Z',
      },
    ];

    const db = mockDbWithPlaybooks(playbooks);

    const byMessage = await findMatchingCounsellingPlaybook(db, 'acct-1', {
      messageText: 'Can you share fee structure for NIT Rourkela AI & ML?',
      requireAutoWhatsapp: true,
    });
    expect(byMessage?.id).toBe('pb-1');

    const byEmailFlag = await findMatchingCounsellingPlaybook(db, 'acct-1', {
      university: 'NIT Rourkela',
      course: 'AI & ML Program',
      requireAutoEmail: true,
    });
    expect(byEmailFlag).toBeNull();
  });

  it('escapes HTML cleanly and personalizes student & official website link in email HTML', () => {
    const html = renderCounsellingEmailHtml({
      subject: 'MBA Admissions',
      headline: 'MBA in Finance <Special>',
      studentName: 'Riya <Sharma>',
      universityName: 'GEMS B-School',
      courseName: 'MBA',
      websiteUrl: 'https://gemsbschool.com/mba',
      bodyText: 'Dear {{student_name}},\n\nExplore our course at {{website}}.',
      summaryPoints: ['50% Merit Scholarship', 'Global Curriculum & Internships'],
      counselorName: 'Aarti',
      counselorPhone: '+91 89718 71113',
      waLink: 'https://wa.me/918971871113',
    });

    expect(html).toContain('Dear Riya &lt;Sharma&gt;,');
    expect(html).toContain('MBA in Finance &lt;Special&gt;');
    expect(html).toContain('https://gemsbschool.com/mba');
    expect(html).toContain('https://wa.me/918971871113');
    expect(html).toContain('50% Merit Scholarship');
  });

  it('generates structured counselling kit grounded in website content even if AI key is missing', async () => {
    h.scrapeUniversityWebsite.mockResolvedValue({
      url: 'https://example.edu/bsc-nursing',
      ok: true,
      title: 'Bangalore Nursing College',
      description: 'INC recognized 4-year B.Sc Nursing program',
      extractedText: 'Full text...',
      highlightsFound: ['Tuition starts at Rs 1.2L/year with merit scholarship'],
    });
    h.loadAiConfig.mockResolvedValue(null);

    const db = mockDbWithPlaybooks([]);
    const res = await generateCounsellingKit({
      db,
      accountId: 'acct-1',
      universityName: 'Bangalore Nursing College',
      courseName: 'B.Sc Nursing',
      websiteUrl: 'https://example.edu/bsc-nursing',
      counselorName: 'Aarti',
    });

    expect(res.source).toBe('fallback');
    expect(res.kit.websiteSynced).toBe(true);
    expect(res.kit.counsellingPoints.length).toBeGreaterThanOrEqual(4);
    expect(res.kit.whatsappReplyDraft).toContain('https://example.edu/bsc-nursing');
    expect(res.kit.emailDraft.bodyHtml).toContain('https://example.edu/bsc-nursing');
  });
});
