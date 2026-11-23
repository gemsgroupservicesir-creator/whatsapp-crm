import type { SupabaseClient } from '@supabase/supabase-js'
import type { ChatMessage } from './types'
import { aiContextMessageLimit } from './defaults'

interface DbMessage {
  sender_type: 'customer' | 'agent' | 'bot'
  content_text: string | null
  content_type?: string | null
  template_name?: string | null
}

/**
 * Fetch the last N messages of a conversation and map them to the
 * provider-neutral chat shape. Customer messages become `user`; agent
 * and bot messages become `assistant`.
 *
 * Ordered oldest-first (chronological) so the transcript reads
 * naturally and the most recent customer message lands last.
 */
export async function buildConversationContext(
  db: SupabaseClient,
  conversationId: string,
  limit: number = aiContextMessageLimit(),
): Promise<ChatMessage[]> {
  const { data, error } = await db
    .from('messages')
    .select('sender_type, content_text, content_type, template_name')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error

  const rows = ((data ?? []) as DbMessage[]).reverse()
  return rows
    .map((m) => {
      let content = (m.content_text || '').trim()
      if (!content) {
        if (m.content_type === 'template' && m.template_name) {
          content = `[Template: ${m.template_name}]`
        } else if (m.content_type === 'image') {
          content = '[Image]'
        } else if (m.content_type === 'audio') {
          content = '[Voice Message]'
        } else if (m.content_type === 'document') {
          content = '[Document]'
        }
      }
      return {
        role: m.sender_type === 'customer' ? ('user' as const) : ('assistant' as const),
        content,
      }
    })
    .filter((m) => Boolean(m.content))
}
