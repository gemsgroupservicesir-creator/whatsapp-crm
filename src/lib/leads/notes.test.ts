import { describe, it, expect } from 'vitest';
import { parseLeadNotes, serializeLeadNotes, formatNotesForAiContext, type LeadNote } from './notes';

describe('Lead Notes Utilities', () => {
  it('parses legacy string notes gracefully', () => {
    const raw = 'Parent wants hostel facility and fee concession.';
    const parsed = parseLeadNotes(raw);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].text).toBe(raw);
    expect(parsed[0].author_type).toBe('counselor');
    expect(parsed[0].author_name).toBe('Counselor');
  });

  it('parses JSON stringified note array', () => {
    const notes: LeadNote[] = [
      {
        id: 'note-1',
        text: 'Student scored 89% in PCM.',
        author_name: 'Priyanshu Neupane',
        author_type: 'counselor',
        created_at: '2026-11-20T10:00:00Z',
      },
      {
        id: 'note-2',
        text: 'Sent scholarship brochure via WhatsApp.',
        author_name: 'AI Agent',
        author_type: 'ai_agent',
        created_at: '2026-11-20T10:05:00Z',
      },
    ];
    const raw = JSON.stringify(notes);
    const parsed = parseLeadNotes(raw);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].text).toBe('Student scored 89% in PCM.');
    expect(parsed[1].author_type).toBe('ai_agent');
  });

  it('returns empty array on empty input or invalid data', () => {
    expect(parseLeadNotes(null)).toEqual([]);
    expect(parseLeadNotes('')).toEqual([]);
    expect(parseLeadNotes([])).toEqual([]);
  });

  it('serializes notes correctly to JSON', () => {
    const notes: LeadNote[] = [
      {
        id: 'note-1',
        text: 'Interested in CSE (AI & ML).',
        author_name: 'Mamata Yadav',
        author_type: 'counselor',
        created_at: '2026-11-21T12:00:00Z',
      },
    ];
    const serialized = serializeLeadNotes(notes);
    expect(JSON.parse(serialized)).toHaveLength(1);
    expect(JSON.parse(serialized)[0].text).toBe('Interested in CSE (AI & ML).');
  });

  it('formats notes into AI context block for prompt grounding', () => {
    const notes: LeadNote[] = [
      {
        id: 'note-1',
        text: 'Student has budget under 4 lakhs per year.',
        author_name: 'Priyanshu',
        author_type: 'counselor',
        created_at: '2026-11-20T10:00:00Z',
      },
      {
        id: 'note-2',
        text: 'Followed up regarding campus tour on Saturday.',
        author_name: 'AI Agent',
        author_type: 'ai_agent',
        created_at: '2026-11-21T11:00:00Z',
      },
    ];
    const context = formatNotesForAiContext(notes);
    expect(context).toContain('COUNSELOR & ADMISSION NOTES (CRITICAL KNOWLEDGE FOR ACCURATE FOLLOW-UP)');
    expect(context).toContain('Counselor (Priyanshu)');
    expect(context).toContain('Student has budget under 4 lakhs per year.');
    expect(context).toContain('AI Admissions Agent');
    expect(context).toContain('Followed up regarding campus tour on Saturday.');
    expect(context).toContain('INSTRUCTION FOR AI AGENT');
  });

  it('returns empty string if no notes are provided for AI context', () => {
    expect(formatNotesForAiContext(null)).toBe('');
    expect(formatNotesForAiContext('')).toBe('');
    expect(formatNotesForAiContext([])).toBe('');
  });
});
