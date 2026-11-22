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
 * Direct, low-latency call to generativelanguage.googleapis.com.
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

  const generationConfig: Record<string, unknown> = {
    maxOutputTokens: MAX_OUTPUT_TOKENS,
  }

  // Use low thinking level on reasoning models (3.x, 2.5) to keep WhatsApp replies fast (< 1-2s)
  if (cleanModel.startsWith('gemini-3') || cleanModel.startsWith('gemini-2.5')) {
    generationConfig.thinkingConfig = {
      thinkingLevel: 'low',
    }
  }

  const body: Record<string, unknown> = {
    contents,
    generationConfig,
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
    // If thinkingConfig was rejected (e.g. model doesn't support thinkingConfig), retry once without it
    if (res.status === 400 && generationConfig.thinkingConfig) {
      delete generationConfig.thinkingConfig
      try {
        const retryRes = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': cleanKey,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        })
        if (retryRes.ok) {
          const retryData = (await retryRes.json().catch(() => null)) as NativeGeminiResponse | null
          const retryText = retryData?.candidates?.[0]?.content?.parts?.[0]?.text
          if (retryText && typeof retryText === 'string' && retryText.trim()) {
            return {
              text: retryText,
              usage: normalizeUsage({
                prompt: retryData?.usageMetadata?.promptTokenCount,
                completion: retryData?.usageMetadata?.candidatesTokenCount,
                total: retryData?.usageMetadata?.totalTokenCount,
              }),
            }
          }
        }
      } catch {
        // Fall through to error below
      }
    }

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
 * Call Google Gemini OpenAI-compatible endpoint.
 */
async function callOpenAiGemini(
  cleanKey: string,
  modelName: string,
  systemPrompt: string | null | undefined,
  messages: ChatMessage[],
  timeoutMs: number,
): Promise<ProviderResult> {
  const cleanModel = modelName.trim().replace(/^models\//, '')
  const promptMessages: { role: 'system' | 'user' | 'assistant'; content: string }[] = []
  if (systemPrompt && systemPrompt.trim()) {
    promptMessages.push({ role: 'system', content: systemPrompt.trim() })
  }
  promptMessages.push(...mergeConsecutive(messages))

  const requestBody: Record<string, unknown> = {
    model: cleanModel,
    messages: promptMessages,
    max_tokens: MAX_OUTPUT_TOKENS,
  }

  // Set reasoning_effort to low for Gemini 3.x models to prevent timeouts
  if (cleanModel.startsWith('gemini-3') || cleanModel.startsWith('gemini-2.5')) {
    requestBody.reasoning_effort = 'low'
  }

  let res: Response
  try {
    res = await fetch(GEMINI_OPENAI_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cleanKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (err) {
    throw toNetworkError(err)
  }

  if (!res.ok) {
    // If reasoning_effort was rejected by older model, retry once without it
    if (res.status === 400 && requestBody.reasoning_effort) {
      delete requestBody.reasoning_effort
      try {
        const retryRes = await fetch(GEMINI_OPENAI_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${cleanKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
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
        // Fall through
      }
    }

    throw await providerHttpError('Google Gemini', res)
  }

  const data = (await res.json().catch(() => null)) as GeminiChatResponse | null
  const text = data?.choices?.[0]?.message?.content
  if (!text || typeof text !== 'string' || !text.trim()) {
    throw new AiError(t('ai.emptyResponse', { provider: 'Google Gemini' }), {
      code: 'empty_response',
    })
  }

  return {
    text,
    usage: normalizeUsage({
      prompt: data?.usage?.prompt_tokens,
      completion: data?.usage?.completion_tokens,
      total: data?.usage?.total_tokens,
    }),
  }
}

/**
 * Call Google Gemini API (tries Native REST first for lowest latency, falls back to OpenAI-compatible endpoint).
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

  // Step 1: Try Native Gemini REST first (fastest direct Google API)
  let nativeErr: unknown
  try {
    return await callNativeGemini(
      cleanKey,
      activeModel,
      systemPrompt,
      messages,
      Math.min(timeoutMs, 15_000),
    )
  } catch (err) {
    nativeErr = err

    // If API key is definitely invalid, fail fast
    if (err instanceof AiError && err.code === 'invalid_key') {
      throw err
    }

    // If model not found or restricted, try gemini-3.8-flash
    if (
      activeModel !== 'gemini-3.8-flash' &&
      err instanceof AiError &&
      (err.message.includes('not found') ||
        err.message.includes('not supported') ||
        err.message.includes('no longer available'))
    ) {
      try {
        return await callNativeGemini(
          cleanKey,
          'gemini-3.8-flash',
          systemPrompt,
          messages,
          Math.min(timeoutMs, 15_000),
        )
      } catch (retryErr) {
        if (retryErr instanceof AiError && retryErr.code === 'invalid_key') {
          throw retryErr
        }
      }
    }
  }

  // Step 2: Try OpenAI-compatible endpoint as fallback
  try {
    return await callOpenAiGemini(
      cleanKey,
      activeModel,
      systemPrompt,
      messages,
      timeoutMs,
    )
  } catch (openAiErr) {
    if (openAiErr instanceof AiError && openAiErr.code === 'invalid_key') {
      throw openAiErr
    }

    // If OpenAI also failed on model availability, try gemini-3.8-flash on OpenAI endpoint
    if (
      activeModel !== 'gemini-3.8-flash' &&
      openAiErr instanceof AiError &&
      (openAiErr.message.includes('no longer available') ||
        openAiErr.message.includes('not found') ||
        openAiErr.message.includes('gemini-2.5-flash'))
    ) {
      try {
        return await callOpenAiGemini(
          cleanKey,
          'gemini-3.8-flash',
          systemPrompt,
          messages,
          timeoutMs,
        )
      } catch {
        // Fall through to error resolution below
      }
    }

    // Throw the most specific typed error
    if (openAiErr instanceof AiError) throw openAiErr
    if (nativeErr instanceof AiError) throw nativeErr
    throw toNetworkError(openAiErr)
  }
}
