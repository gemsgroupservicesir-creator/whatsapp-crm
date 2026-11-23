import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  generateReplyArgs: [] as unknown[],
  loadAiConfigResult: {
    provider: 'gemini',
    apiKey: 'test-key',
    model: 'gemini-3.5-flash-lite',
    systemPrompt: 'You are an admissions assistant.',
    autoReplyEnabled: true,
  } as unknown,
  conversation: { id: 'conv-1', contact_id: 'contact-1', account_id: 'acc-1' } as unknown,
  contact: { name: 'Ayush Sapkota', phone: '+9779846932758', email: 'ayush@example.com' } as unknown,
  lead: {
    full_name: 'Ayush Sapkota',
    phone: '+9779846932758',
    college: 'GEMS Institute',
    course: 'MBA',
    campaign_name: 'Mamata MBA',
    notes: JSON.stringify([{ id: '1', text: 'Interested in evening batch', author_name: 'Counselor', author_type: 'counselor', created_at: '2026-11-23' }]),
  } as unknown,
  messages: [] as unknown[],
}))

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      body,
      status: init?.status ?? 200,
    }),
  },
}))

vi.mock('@/lib/auth/account', () => ({
  requireRole: async () => ({
    accountId: 'acc-1',
    userId: 'user-1',
    role: 'agent',
    supabase: {
      from: (table: string) => {
        if (table === 'conversations') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: h.conversation, error: null }),
              }),
            }),
          }
        }
        if (table === 'contacts') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: h.contact, error: null }),
              }),
            }),
          }
        }
        if (table === 'meta_lead_logs') {
          return {
            select: () => ({
              eq: () => ({
                order: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({ data: h.lead, error: null }),
                  }),
                }),
              }),
            }),
          }
        }
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        }
      },
    },
  }),
  toErrorResponse: (err: unknown) => ({
    body: { error: err instanceof Error ? err.message : 'error' },
    status: 500,
  }),
}))

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: () => ({ success: true }),
  rateLimitResponse: () => ({ status: 429, body: { error: 'Rate limit' } }),
  RATE_LIMITS: { aiDraft: {}, aiDraftAccount: {} },
}))

vi.mock('@/lib/ai/config', () => ({
  loadAiConfig: async () => h.loadAiConfigResult,
}))

vi.mock('@/lib/ai/context', () => ({
  buildConversationContext: async () => h.messages,
}))

vi.mock('@/lib/ai/knowledge', () => ({
  retrieveKnowledge: async () => ['Knowledge snippet 1'],
}))

vi.mock('@/lib/ai/generate', () => ({
  generateReply: async (args: unknown) => {
    h.generateReplyArgs.push(args)
    return { text: 'Hello Ayush! Welcome to GEMS MBA admissions.', usage: null }
  },
}))

vi.mock('@/lib/ai/usage', () => ({
  logAiUsage: async () => {},
}))

vi.mock('@/lib/ai/admin-client', () => ({
  supabaseAdmin: () => ({}),
}))

import { POST } from './route'

describe('POST /api/ai/draft', () => {
  beforeEach(() => {
    h.generateReplyArgs = []
    h.messages = []
  })

  it('drafts a personalized initial outreach message when thread has 0 messages', async () => {
    h.messages = []
    const req = new Request('http://localhost/api/ai/draft', {
      method: 'POST',
      body: JSON.stringify({ conversation_id: 'conv-1' }),
    })

    const res = (await POST(req)) as unknown as { status: number; body: { draft?: string } }
    expect(res.status).toBe(200)
    expect(res.body.draft).toBe('Hello Ayush! Welcome to GEMS MBA admissions.')
    expect(h.generateReplyArgs.length).toBe(1)

    const call = h.generateReplyArgs[0] as {
      messages: { role: string; content: string }[]
      systemPrompt: string
    }
    expect(call.messages[0].role).toBe('user')
    expect(call.messages[0].content).toContain('Ayush Sapkota')
    expect(call.messages[0].content).toContain('MBA at GEMS Institute')
    expect(call.systemPrompt).toContain('Mamata MBA')
    expect(call.systemPrompt).toContain('Interested in evening batch')
  })

  it('drafts a follow-up message when conversation only has previous assistant messages', async () => {
    h.messages = [
      { role: 'assistant', content: 'Initial template sent to student.' },
    ]
    const req = new Request('http://localhost/api/ai/draft', {
      method: 'POST',
      body: JSON.stringify({ conversation_id: 'conv-1' }),
    })

    const res = (await POST(req)) as unknown as { status: number; body: { draft?: string } }
    expect(res.status).toBe(200)
    expect(h.generateReplyArgs.length).toBe(1)

    const call = h.generateReplyArgs[0] as {
      messages: { role: string; content: string }[]
    }
    // Verify user turns were wrapped around the assistant message
    expect(call.messages[0].role).toBe('user')
    expect(call.messages[call.messages.length - 1].role).toBe('user')
    expect(call.messages[call.messages.length - 1].content).toContain('follow-up')
  })
})
