// =============================================================================
// HTTP Fetcher
// Server-side only (Node.js / Next.js server context)
// Handles: timeout, redirect following, UA header, content-type guard
// =============================================================================

import type { FetchResult } from './types'

const DEFAULT_TIMEOUT_MS = 10_000
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024   // 5 MB cap
const MAX_REDIRECTS = 5

const USER_AGENTS = [
  'Mozilla/5.0 (compatible; PostFlowBot/1.0; +https://postflow.app/bot)',
  'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
  'Twitterbot/1.0',
]

const ALLOWED_CONTENT_TYPES = [
  'text/html',
  'application/xhtml+xml',
  'application/xml',
  'text/xml',
]

/**
 * Fetches the HTML content of a URL with timeout, redirect tracking,
 * and content-type validation.
 *
 * Must be called from a server context (Next.js Server Action / Route Handler).
 */
export async function fetchUrl(
  url: string,
  options: {
    timeoutMs?: number
    userAgent?: string
    followRedirects?: boolean
  } = {}
): Promise<FetchResult> {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    userAgent = USER_AGENTS[0],
    followRedirects = true,
  } = options

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: followRedirects ? 'follow' : 'manual',
      headers: {
        'User-Agent': userAgent,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
      },
    })

    clearTimeout(timer)

    const contentType = response.headers.get('content-type') ?? ''
    const isHtml = ALLOWED_CONTENT_TYPES.some((ct) =>
      contentType.toLowerCase().includes(ct)
    )

    if (!isHtml) {
      return {
        ok: false,
        statusCode: response.status,
        contentType,
        finalUrl: response.url,
        error: `Non-HTML content type: ${contentType}`,
      }
    }

    if (!response.ok) {
      return {
        ok: false,
        statusCode: response.status,
        finalUrl: response.url,
        error: `HTTP ${response.status} ${response.statusText}`,
      }
    }

    // Stream with size cap to avoid memory issues on huge pages
    const reader = response.body?.getReader()
    if (!reader) {
      return { ok: false, error: 'Response body unavailable', statusCode: response.status }
    }

    const chunks: Uint8Array[] = []
    let totalBytes = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        totalBytes += value.byteLength
        if (totalBytes > MAX_RESPONSE_BYTES) {
          reader.cancel()
          break   // use what we have — metadata is always in the <head>
        }
        chunks.push(value)
      }
    }

    const buffer = new Uint8Array(totalBytes > MAX_RESPONSE_BYTES ? MAX_RESPONSE_BYTES : totalBytes)
    let offset = 0
    for (const chunk of chunks) {
      buffer.set(chunk, offset)
      offset += chunk.byteLength
    }

    const html = new TextDecoder('utf-8', { fatal: false }).decode(buffer)

    return {
      ok: true,
      html,
      finalUrl: response.url,
      statusCode: response.status,
      contentType,
    }
  } catch (err) {
    clearTimeout(timer)
    const error = err instanceof Error ? err : new Error(String(err))

    if (error.name === 'AbortError') {
      return { ok: false, error: `Request timed out after ${timeoutMs}ms` }
    }

    return { ok: false, error: error.message }
  }
}

/**
 * Lightweight HEAD request to resolve final URL after redirects.
 * Falls back to a GET if HEAD is not supported.
 */
export async function resolveRedirects(
  url: string,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<{ finalUrl: string; redirected: boolean; error?: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENTS[0] },
    })
    clearTimeout(timer)
    return { finalUrl: response.url, redirected: response.url !== url }
  } catch (headErr) {
    clearTimeout(timer)
    // Some servers block HEAD — fall back to GET with early abort
    try {
      const getCtrl = new AbortController()
      const getTimer = setTimeout(() => getCtrl.abort(), timeoutMs)
      const response = await fetch(url, {
        redirect: 'follow',
        signal: getCtrl.signal,
        headers: { 'User-Agent': USER_AGENTS[0] },
      })
      clearTimeout(getTimer)
      getCtrl.abort()   // cancel body download
      return { finalUrl: response.url, redirected: response.url !== url }
    } catch (getErr) {
      const error = getErr instanceof Error ? getErr.message : String(getErr)
      return { finalUrl: url, redirected: false, error }
    }
  }
}
