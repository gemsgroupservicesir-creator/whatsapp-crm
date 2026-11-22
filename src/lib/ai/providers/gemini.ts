import { AiError, type ChatMessage, type ProviderResult } from '../types'
import { MAX_OUTPUT_TOKENS } from '../defaults'
import {
  mergeConsecutive,
  normalizeUsage,
  providerHttpError,
  toNetworkError,
  type ProviderArgs,
} from './shared'
import { getT } from '@/lib/i18n/translate'

const t = getT('LibErrors')

const GEMINI_OPENAI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'

interface GeminiChatResponse {
  choices?: { message?: { content?: string } }[]
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}

interface NativeGeminiResponse {
  candidates?: {
    content?: {
      parts?: { text?: string }[]
    }
  }[]
  usageMetadata?: {
    promptTokenCount?: number
    candidatesTokenCount?: number
    totalTokenCount?: number
  }
}

/**
 * Call Google Gemini native REST endpoint.
 */
async function callNativeGemini(
  cleanKey: string,
  modelName: string,
  systemPrompt: string | null | undefined,
  messages: ChatMessage[],
  timeoutMs: number,
): Promise<ProviderResult> {
  const cleanModel = modelName.trim().replace(/^models\//, '')
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent?key=${encodeURIComponent(cleanKey)}`

  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }))

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    },
  }

  if (systemPrompt && systemPrompt.trim()) {
    body.system_instruction = {
      parts: [{ text: systemPrompt.trim() }],
    }
  }

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': cleanKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (err) {
    throw toNetworkError(err)
  }

  if (!res.ok) {
    throw await providerHttpError('Google Gemini', res)
  }

  const data = (await res.json().catch(() => null)) as NativeGeminiResponse | null
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text || typeof text !== 'string' || !text.trim()) {
    throw new AiError(t('ai.emptyResponse', { provider: 'Google Gemini' }), {
      code: 'empty_response',
    })
  }

  const usageMetadata = data?.usageMetadata
  const usage = normalizeUsage({
    prompt: usageMetadata?.promptTokenCount,
    completion: usageMetadata?.candidatesTokenCount,
    total: usageMetadata?.totalTokenCount,
  })

  return { text, usage }
}

/**
 * Call Google Gemini API (tries OpenAI compatibility endpoint first, falls back to native REST).
 * Returns the raw assistant response + normalized token usage.
 */
export async function generateGemini(args: ProviderArgs): Promise<ProviderResult> {
  const { apiKey, model, systemPrompt, messages, timeoutMs } = args
  const cleanKey = apiKey.trim().replace(/^["']|["']$/g, '')
  let rawModel = model?.trim() || 'gemini-3.8-flash'
  // gemini-2.5-flash is no longer available to new users according to Google's API notice
  if (rawModel === 'gemini-2.5-flash' || rawModel === 'models/gemini-2.5-flash') {
    rawModel = 'gemini-3.8-flash'
  }
  const activeModel = rawModel.replace(/^models\//, '')

  const promptMessages: { role: 'system' | 'user' | 'assistant'; content: string }[] = []
  if (systemPrompt && systemPrompt.trim()) {
    promptMessages.push({ role: 'system', content: systemPrompt.trim() })
  }
  promptMessages.push(...mergeConsecutive(messages))

  let res: Response
  try {
    res = await fetch(GEMINI_OPENAI_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cleanKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: activeModel,
        messages: promptMessages,
        max_tokens: MAX_OUTPUT_TOKENS,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (err) {
    throw toNetworkError(err)
  }

  if (!res.ok) {
    // If OpenAI-compatible endpoint failed, check if it was an invalid key
    const openAiErr = await providerHttpError('Google Gemini', res)
    if (openAiErr.code === 'invalid_key') {
      throw openAiErr
    }

    // If Gemini informs us a model is no longer available or not found, retry with gemini-3.8-flash
    if (
      activeModel !== 'gemini-3.8-flash' &&
      (openAiErr.message.includes('no longer available') ||
        openAiErr.message.includes('not found') ||
        openAiErr.message.includes('gemini-2.5-flash'))
    ) {
      try {
        const retryRes = await fetch(GEMINI_OPENAI_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${cleanKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gemini-3.8-flash',
            messages: promptMessages,
            max_tokens: MAX_OUTPUT_TOKENS,
          }),
          signal: AbortSignal.timeout(timeoutMs),
        })
        if (retryRes.ok) {
          const retryData = (await retryRes.json().catch(() => null)) as GeminiChatResponse | null
          const retryText = retryData?.choices?.[0]?.message?.content
          if (retryText && typeof retryText === 'string' && retryText.trim()) {
            return {
              text: retryText,
              usage: normalizeUsage({
                prompt: retryData?.usage?.prompt_tokens,
                completion: retryData?.usage?.completion_tokens,
                total: retryData?.usage?.total_tokens,
              }),
            }
          }
        }
      } catch {
        // Fall through to native REST
      }
    }

    // Try native Gemini REST endpoint as fallback
    try {
      return await callNativeGemini(
        cleanKey,
        activeModel,
        systemPrompt,
        messages,
        timeoutMs,
      )
    } catch (nativeErr) {
      // If model not found or restricted, attempt gemini-3.8-flash
      if (
        activeModel !== 'gemini-3.8-flash' &&
        nativeErr instanceof AiError &&
        (nativeErr.message.includes('not found') ||
          nativeErr.message.includes('not supported') ||
          nativeErr.message.includes('no longer available'))
      ) {
        return await callNativeGemini(
          cleanKey,
          'gemini-3.8-flash',
          systemPrompt,
          messages,
          timeoutMs,
        )
      }
      throw nativeErr instanceof AiError ? nativeErr : openAiErr
    }
  }

  const data = (await res.json().catch(() => null)) as GeminiChatResponse | null
  const text = data?.choices?.[0]?.message?.content
  if (!text || typeof text !== 'string' || !text.trim()) {
    throw new AiError(t('ai.emptyResponse', { provider: 'Google Gemini' }), {
      code: 'empty_response',
    })
  }

  const usage = normalizeUsage({
    prompt: data?.usage?.prompt_tokens,
    completion: data?.usage?.completion_tokens,
    total: data?.usage?.total_tokens,
  })

  return { text, usage }
}
