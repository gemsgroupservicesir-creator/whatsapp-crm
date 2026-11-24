import { describe, it, expect, vi } from 'vitest';
import { generateNotesFollowUpEmail, type FollowUpEmailContext } from './follow-up';
import type { LeadNote } from '@/lib/leads/notes';

describe('Follow-Up Email Engine (Grounded in Notes)', () => {
  const sampleNotes: LeadNote[] = [
    {
      id: 'n1',
      text: 'Student inquired about merit scholarship for B.Tech CSE. Scored 84% in Class 12 PCM.',
      author_name: 'Prakash Counselor',
      author_type: 'counselor',
      created_at: '2026-11-23T10:00:00Z',
    },
    {
      id: 'n2',
      text: 'Requested fee structure installment breakdown and hostel accommodation details.',
      author_name: 'Prakash Counselor',
      author_type: 'counselor',
      created_at: '2026-11-23T11:00:00Z',
    },
  ];

  const baseContext: FollowUpEmailContext = {
    studentName: 'Aarav Sharma',
    studentEmail: 'aarav@gmail.com',
    studentPhone: '+977 9801234567',
    college: 'NIT Campus Partner',
    course: 'B.Tech Computer Science',
    city: 'Kathmandu',
    counselorName: 'Senior Advisor Prakash',
    counselorPhone: '+977 980-0000000',
    counselorEmail: 'admissions@gemsgroup.edu.np',
    notes: sampleNotes,
  };

  it('generates fallback follow-up email grounded in notes when AI is omitted', async () => {
    const result = await generateNotesFollowUpEmail(baseContext);

    expect(result.source).toBe('fallback');
    expect(result.subject).toContain('B.Tech Computer Science');
    expect(result.html).toContain('Aarav Sharma');
    expect(result.html).toContain('Senior Advisor Prakash');
    expect(result.html).toContain('Scored 84% in Class 12 PCM');
    expect(result.html).toContain('hostel accommodation details');
    expect(result.html).toContain('wa.me/9779800000000');
    expect(result.text).toContain('Aarav Sharma');
    expect(result.text).toContain('B.Tech Computer Science');
  });

  it('incorporates latestNoteText into email generation', async () => {
    const contextWithLatest: FollowUpEmailContext = {
      ...baseContext,
      latestNoteText: 'Parent consultation booked for tomorrow 3 PM to finalize admission fee.',
    };

    const result = await generateNotesFollowUpEmail(contextWithLatest);
    expect(result.html).toContain('Parent consultation booked for tomorrow 3 PM');
    expect(result.text).toContain('Parent consultation booked for tomorrow 3 PM');
  });

  it('respects customSubject if provided', async () => {
    const contextWithSubject: FollowUpEmailContext = {
      ...baseContext,
      customSubject: 'Special Scholarship Update for Aarav — GEMS Admissions',
    };

    const result = await generateNotesFollowUpEmail(contextWithSubject);
    expect(result.subject).toBe('Special Scholarship Update for Aarav — GEMS Admissions');
    expect(result.html).toContain('Special Scholarship Update for Aarav — GEMS Admissions');
  });
});
