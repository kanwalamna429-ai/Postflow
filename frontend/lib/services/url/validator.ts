// =============================================================================
// URL Validator
// Validates input URLs before any fetching or storage.
// =============================================================================

import type { UrlValidationResult, UrlValidationErrorCode } from './types'

const MAX_URL_LENGTH = 2048

/** Protocols that are safe to fetch */
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])

/**
 * Private / loopback IPv4 ranges that must not be fetched
 * (SSRF prevention).
 */
const PRIVATE_IP_RANGES = [
  /^127\./,                   // loopback
  /^10\./,                    // RFC-1918
  /^192\.168\./,              // RFC-1918
  /^172\.(1[6-9]|2\d|3[01])\./, // RFC-1918
  /^169\.254\./,              // link-local
  /^::1$/,                    // IPv6 loopback
  /^fc00:/i,                  // IPv6 unique local
  /^fe80:/i,                  // IPv6 link-local
]

const LOCALHOST_PATTERNS = [
  'localhost',
  '0.0.0.0',
  '[::]',
  '[::1]',
]

/**
 * Validates a single URL string.
 * Returns { valid: true, normalizedUrl } or { valid: false, error, code }.
 */
export function validateUrl(raw: string): UrlValidationResult {
  const trimmed = (raw ?? '').trim()

  if (!trimmed) {
    return error('URL cannot be empty', 'EMPTY')
  }

  if (trimmed.length > MAX_URL_LENGTH) {
    return error(`URL exceeds maximum length of ${MAX_URL_LENGTH} characters`, 'TOO_LONG')
  }

  let parsed: URL
  try {
    // Prepend https:// if the user typed a bare domain
    const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
    parsed = new URL(candidate)
  } catch {
    return error(`"${trimmed}" is not a valid URL`, 'INVALID_FORMAT')
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    return error(
      `Protocol "${parsed.protocol}" is not allowed. Use http or https.`,
      'UNSAFE_PROTOCOL'
    )
  }

  const hostname = parsed.hostname.toLowerCase()

  if (LOCALHOST_PATTERNS.includes(hostname)) {
    return error('Localhost URLs are not allowed', 'LOCALHOST')
  }

  if (PRIVATE_IP_RANGES.some((re) => re.test(hostname))) {
    return error('Private / internal IP addresses are not allowed', 'PRIVATE_IP')
  }

  // Basic TLD check — must have at least one dot and a short TLD segment
  if (!hostname.includes('.') || hostname.endsWith('.')) {
    return error('URL must have a valid domain with a TLD', 'INVALID_TLD')
  }

  return { valid: true, normalizedUrl: parsed.toString() }
}

/**
 * Validates an array of URL strings.
 * Returns individual results keyed by input URL.
 */
export function validateUrls(
  rawUrls: string[]
): Map<string, UrlValidationResult> {
  const results = new Map<string, UrlValidationResult>()
  for (const url of rawUrls) {
    results.set(url, validateUrl(url))
  }
  return results
}

/**
 * Filters a list of raw URLs into valid and invalid buckets.
 */
export function partitionUrls(rawUrls: string[]): {
  valid: Array<{ input: string; normalizedUrl: string }>
  invalid: Array<{ input: string; error: string; code: UrlValidationErrorCode }>
} {
  const valid: Array<{ input: string; normalizedUrl: string }> = []
  const invalid: Array<{ input: string; error: string; code: UrlValidationErrorCode }> = []

  for (const raw of rawUrls) {
    const result = validateUrl(raw)
    if (result.valid && result.normalizedUrl) {
      valid.push({ input: raw, normalizedUrl: result.normalizedUrl })
    } else {
      invalid.push({
        input: raw,
        error: result.error ?? 'Unknown validation error',
        code: result.code ?? 'INVALID_FORMAT',
      })
    }
  }

  return { valid, invalid }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function error(
  message: string,
  code: UrlValidationErrorCode
): UrlValidationResult {
  return { valid: false, error: message, code }
}
