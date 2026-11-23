export interface LeadNote {
  id: string;
  text: string;
  author_name: string;
  author_type: 'counselor' | 'ai_agent' | 'system';
  created_at: string;
}

/**
 * Parses raw notes data from database (stringified JSON array, legacy string, or array)
 * into a typed array of LeadNote objects.
 */
export function parseLeadNotes(rawNotes: unknown): LeadNote[] {
  if (!rawNotes) return [];

  if (Array.isArray(rawNotes)) {
    return rawNotes
      .map((item, idx) => ({
        id: item.id || `note-${idx}`,
        text: String(item.text || '').trim(),
        author_name: String(item.author_name || item.authorName || 'Counselor'),
        author_type: (item.author_type || item.authorType || 'counselor') as 'counselor' | 'ai_agent' | 'system',
        created_at: item.created_at || item.createdAt || new Date().toISOString(),
      }))
      .filter((n) => Boolean(n.text));
  }

  if (typeof rawNotes === 'string') {
    const trimmed = rawNotes.trim();
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parseLeadNotes(parsed);
        }
      } catch {
        // Fallback to plain string if JSON parse fails
      }
    }

    if (trimmed) {
      return [
        {
          id: 'legacy-note-1',
          text: trimmed,
          author_name: 'Counselor',
          author_type: 'counselor',
          created_at: new Date().toISOString(),
        },
      ];
    }
  }

  return [];
}

/**
 * Serializes LeadNote array to JSON string for database storage.
 */
export function serializeLeadNotes(notes: LeadNote[]): string {
  return JSON.stringify(notes);
}

/**
 * Formats all counselor and AI notes into a concise, high-priority context block
 * for the AI model during WhatsApp follow-ups.
 */
export function formatNotesForAiContext(rawNotes: unknown): string {
  const notes = parseLeadNotes(rawNotes);
  if (notes.length === 0) return '';

  const lines = notes.map((n) => {
    const role =
      n.author_type === 'ai_agent'
        ? 'AI Admissions Agent'
        : `Counselor (${n.author_name || 'Senior Counselor'})`;
    const date = n.created_at ? new Date(n.created_at).toLocaleDateString() : '';
    return `• [${role}${date ? ' • ' + date : ''}]: ${n.text}`;
  });

  return `\nCOUNSELOR & ADMISSION NOTES (CRITICAL KNOWLEDGE FOR ACCURATE FOLLOW-UP):\n${lines.join(
    '\n'
  )}\n\nINSTRUCTION FOR AI AGENT:\nAlways consult and respect the counselor & admission notes above. Do NOT ask the student questions they have already answered in these notes. Speak with accurate personalized knowledge!`;
}
