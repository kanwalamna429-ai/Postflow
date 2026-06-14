// =============================================================================
// Gemini API Client
// Wraps @google/generative-ai with:
//  - Retry with exponential backoff + jitter
//  - In-memory sliding-window rate limiter
//  - Structured error classification
// =============================================================================

import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
  type GenerationConfig,
} from '@google/generative-ai'
import type { GeminiModel, GeminiResponse, AiErrorCode } from './types'
import { AiServiceError } from './types'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MODEL: GeminiModel = 'gemini-1.5-flash'
const DEFAULT_TEMPERATURE     = 0.7
const DEFAULT_MAX_TOKENS      = 1024
const DEFAULT_MAX_RETRIES     = 3
const BASE_RETRY_DELAY_MS     = 1_000
const MAX_RETRY_DELAY_MS      = 30_000
const JITTER_FACTOR           = 0.3

/** Conservative limit — well below free-tier 15 RPM */
const RATE_LIMIT_RPM          = 12
const RATE_LIMIT_WINDOW_MS    = 60_000

// ---------------------------------------------------------------------------
// In-memory sliding-window rate limiter (per-process singleton)
// ---------------------------------------------------------------------------

class SlidingWindowRateLimiter {
  private readonly requestTimestamps: number[] = []

  constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number
  ) {}

  /** Returns how many milliseconds to wait, or 0 if the request can proceed */
  checkAndRecord(): number {
    const now = Date.now()
    const windowStart = now - this.windowMs

    // Evict timestamps outside the window
    while (
      this.requestTimestamps.length > 0 &&
      this.requestTimestamps[0] < windowStart
    ) {
      this.requestTimestamps.shift()
    }

    if (this.requestTimestamps.length >= this.maxRequests) {
      // How long until the oldest request falls outside the window
      const oldest = this.requestTimestamps[0]
      return oldest + this.windowMs - now + 50  // +50ms buffer
    }

    this.requestTimestamps.push(now)
    return 0
  }

  get currentCount(): number {
    const windowStart = Date.now() - this.windowMs
    return this.requestTimestamps.filter((t) => t >= windowStart).length
  }
}

const rateLimiter = new SlidingWindowRateLimiter(RATE_LIMIT_RPM, RATE_LIMIT_WINDOW_MS)

// ---------------------------------------------------------------------------
// Retry helper
// ---------------------------------------------------------------------------

function calculateBackoffMs(attempt: number, retryAfterMs?: number): number {
  if (retryAfterMs) return retryAfterMs
  const base = Math.min(BASE_RETRY_DELAY_MS * 2 ** attempt, MAX_RETRY_DELAY_MS)
  const jitter = base * JITTER_FACTOR * (Math.random() * 2 - 1)
  return Math.max(0, base + jitter)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ---------------------------------------------------------------------------
// Error classifier
// ---------------------------------------------------------------------------

function classifyError(err: unknown): AiServiceError {
  const message = err instanceof Error ? err.message : String(err)
  const lower   = message.toLowerCase()

  if (lower.includes('api_key') || lower.includes('api key') || lower.includes('authentication')) {
    return new AiServiceError('Invalid or missing Gemini API key', 'MISSING_API_KEY', false)
  }
  if (lower.includes('quota') || lower.includes('billing')) {
    return new AiServiceError('Gemini API quota exceeded', 'QUOTA_EXCEEDED', false)
  }
  if (lower.includes('rate') || lower.includes('429') || lower.includes('resource_exhausted')) {
    const retryAfter = extractRetryAfter(message)
    return new AiServiceError('Rate limited by Gemini API', 'RATE_LIMITED', true, retryAfter)
  }
  if (lower.includes('safety') || lower.includes('blocked') || lower.includes('harm')) {
    return new AiServiceError('Content blocked by Gemini safety filters', 'SAFETY_BLOCKED', false)
  }
  if (lower.includes('context') || lower.includes('token') || lower.includes('too long')) {
    return new AiServiceError('Input context exceeds model limit', 'CONTEXT_TOO_LONG', false)
  }
  if (lower.includes('503') || lower.includes('unavailable') || lower.includes('overloaded')) {
    return new AiServiceError('Gemini model temporarily unavailable', 'MODEL_UNAVAILABLE', true)
  }
  if (lower.includes('timeout') || lower.includes('deadline')) {
    return new AiServiceError('Gemini API request timed out', 'TIMEOUT', true)
  }
  if (lower.includes('invalid') || lower.includes('400')) {
    return new AiServiceError(`Invalid request: ${message}`, 'INVALID_REQUEST', false)
  }

  return new AiServiceError(`Gemini API error: ${message}`, 'UNKNOWN', true)
}

function extractRetryAfter(message: string): number | undefined {
  const match = /retry.after[:\s]+(\d+)/i.exec(message)
  return match ? parseInt(match[1]) * 1000 : undefined
}

// ---------------------------------------------------------------------------
// Safety settings — permissive for content generation use-cases
// ---------------------------------------------------------------------------

const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,       threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT,        threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
]

// ---------------------------------------------------------------------------
// Main client function
// ---------------------------------------------------------------------------

export interface GenerateOptions {
  model?:           GeminiModel
  temperature?:     number
  maxOutputTokens?: number
  maxRetries?:      number
  systemInstruction?: string
}

/**
 * Calls the Gemini API with retry logic and rate limiting.
 * Throws AiServiceError on non-retryable failures.
 */
export async function generate(
  prompt: string,
  options: GenerateOptions = {}
): Promise<GeminiResponse> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new AiServiceError(
      'GEMINI_API_KEY environment variable is not set',
      'MISSING_API_KEY',
      false
    )
  }

  const {
    model           = DEFAULT_MODEL,
    temperature     = DEFAULT_TEMPERATURE,
    maxOutputTokens = DEFAULT_MAX_TOKENS,
    maxRetries      = DEFAULT_MAX_RETRIES,
    systemInstruction,
  } = options

  const genConfig: GenerationConfig = {
    temperature,
    maxOutputTokens,
    candidateCount: 1,
  }

  const genAI = new GoogleGenerativeAI(apiKey)

  let attempt = 0

  while (true) {
    // -----------------------------------------------------------------------
    // Rate limit check — wait if needed
    // -----------------------------------------------------------------------
    const waitMs = rateLimiter.checkAndRecord()
    if (waitMs > 0) {
      await sleep(waitMs)
      // Re-record after waiting
      rateLimiter.checkAndRecord()
    }

    try {
      const modelInstance = genAI.getGenerativeModel({
        model,
        safetySettings: SAFETY_SETTINGS,
        generationConfig: genConfig,
        ...(systemInstruction ? { systemInstruction } : {}),
      })

      const result = await modelInstance.generateContent(prompt)
      const response = result.response

      const text = response.text()
      if (!text) {
        throw new AiServiceError('Empty response from Gemini', 'PARSE_FAILED', false)
      }

      const usage = response.usageMetadata
      return {
        text,
        model,
        promptTokens:    usage?.promptTokenCount    ?? 0,
        candidateTokens: usage?.candidatesTokenCount ?? 0,
        totalTokens:     usage?.totalTokenCount      ?? 0,
        finishReason:    response.candidates?.[0]?.finishReason ?? 'STOP',
      }
    } catch (err) {
      const classified = err instanceof AiServiceError ? err : classifyError(err)

      if (!classified.retryable || attempt >= maxRetries) {
        throw classified
      }

      attempt++
      const delay = calculateBackoffMs(attempt, classified.retryAfterMs)
      console.warn(
        `[gemini] Attempt ${attempt}/${maxRetries} failed (${classified.code}). Retrying in ${Math.round(delay)}ms…`
      )
      await sleep(delay)
    }
  }
}

/**
 * Generates multiple independent completions in parallel (up to 5).
 * Respects rate limits — staggers requests slightly.
 */
export async function generateVariants(
  prompt: string,
  count: number,
  options: GenerateOptions = {}
): Promise<GeminiResponse[]> {
  const safeCount = Math.min(Math.max(1, count), 5)

  if (safeCount === 1) {
    return [await generate(prompt, options)]
  }

  // Slightly stagger to avoid rate limit burst
  const results: GeminiResponse[] = []
  for (let i = 0; i < safeCount; i++) {
    if (i > 0) await sleep(200 + Math.random() * 100)
    results.push(await generate(prompt, options))
  }
  return results
}

/** Expose rate limiter state for monitoring */
export function getRateLimiterStatus() {
  return {
    currentRpm: rateLimiter.currentCount,
    maxRpm: RATE_LIMIT_RPM,
    windowMs: RATE_LIMIT_WINDOW_MS,
  }
}
