// =============================================================================
// URL Normalizer
// Produces a canonical, deterministic form of a URL for deduplication.
// =============================================================================

import type { NormalizationResult, NormalizationChange } from './types'

// ---------------------------------------------------------------------------
// Tracking / noise parameters to strip
// ---------------------------------------------------------------------------

/** UTM parameters */
const UTM_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'utm_id', 'utm_source_platform', 'utm_creative_format', 'utm_marketing_tactic',
])

/** Platform-specific click-tracking parameters */
const TRACKING_PARAMS = new Set([
  // Facebook
  'fbclid', 'fb_action_ids', 'fb_action_types', 'fb_source', 'fb_ref',
  // Google
  'gclid', 'gclsrc', 'gbraid', 'wbraid', 'dclid',
  // Twitter / X
  'twclid',
  // Microsoft
  'msclkid',
  // HubSpot
  '_hsenc', '_hsmi', 'hsa_acc', 'hsa_cam', 'hsa_grp', 'hsa_ad',
  'hsa_src', 'hsa_tgt', 'hsa_kw', 'hsa_mt', 'hsa_net', 'hsa_ver',
  // Mailchimp
  'mc_cid', 'mc_eid',
  // Miscellaneous
  'ref', 'source', 'campaign', 'affiliate', 'partner',
  'yclid', 'zanpid', 'otc',
])

/** Default ports (scheme → port) — strip if present */
const DEFAULT_PORTS: Record<string, string> = {
  'http:': '80',
  'https:': '443',
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Normalizes a URL to a deterministic canonical form.
 *
 * Transformations applied (in order):
 * 1. Lowercase scheme and host
 * 2. Remove default port
 * 3. Remove fragment (#anchor) — irrelevant for content identity
 * 4. Remove UTM parameters
 * 5. Remove common tracking parameters
 * 6. Sort remaining query parameters for stable comparison
 * 7. Remove trailing slash (on path only, not root)
 */
export function normalizeUrl(rawUrl: string): NormalizationResult {
  const changes: NormalizationChange[] = []

  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    // Return original if unparseable; validator should have caught this first
    return { url: rawUrl, changes }
  }

  // 1. Lowercase scheme
  if (url.protocol !== url.protocol.toLowerCase()) {
    url.protocol = url.protocol.toLowerCase()
    changes.push('lowercased_scheme')
  }

  // 2. Lowercase host
  const originalHost = url.hostname
  url.hostname = url.hostname.toLowerCase()
  if (url.hostname !== originalHost) {
    changes.push('lowercased_host')
  }

  // 3. Remove default port
  if (url.port && DEFAULT_PORTS[url.protocol] === url.port) {
    url.port = ''
    changes.push('removed_default_port')
  }

  // 4. Remove fragment
  if (url.hash) {
    url.hash = ''
    changes.push('removed_fragment')
  }

  // 5. Strip UTM params
  const utmKeys = [...url.searchParams.keys()].filter((k) => UTM_PARAMS.has(k))
  if (utmKeys.length > 0) {
    utmKeys.forEach((k) => url.searchParams.delete(k))
    changes.push('removed_utm_params')
  }

  // 6. Strip tracking params
  const trackingKeys = [...url.searchParams.keys()].filter((k) =>
    TRACKING_PARAMS.has(k.toLowerCase())
  )
  if (trackingKeys.length > 0) {
    trackingKeys.forEach((k) => url.searchParams.delete(k))
    changes.push('removed_tracking_params')
  }

  // 7. Sort remaining query params for stable comparison
  url.searchParams.sort()

  // 8. Remove trailing slash on non-root paths
  if (url.pathname !== '/' && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.replace(/\/+$/, '')
    changes.push('removed_trailing_slash')
  }

  return { url: url.toString(), changes }
}

/**
 * Returns a URL normalized and stripped of www. for comparison purposes.
 * (Does not modify the stored URL — used only for dedup hashing.)
 */
export function toComparisonKey(url: string): string {
  try {
    const { url: normalized } = normalizeUrl(url)
    const parsed = new URL(normalized)
    parsed.hostname = parsed.hostname.replace(/^www\./, '')
    return parsed.toString().toLowerCase()
  } catch {
    return url.toLowerCase()
  }
}

/**
 * Generates a URL-safe slug from a URL for use in short links.
 * Example: https://example.com/blog/my-post → my-post-a1b2
 */
export function generateSlug(url: string, suffixLength = 4): string {
  try {
    const parsed = new URL(url)
    const pathParts = parsed.pathname
      .split('/')
      .filter(Boolean)
      .slice(-2)           // last 2 path segments
      .join('-')

    const base = pathParts || parsed.hostname.replace(/^www\./, '').split('.')[0]

    // Short deterministic hash suffix for uniqueness
    const hash = simpleHash(url).toString(36).slice(0, suffixLength)

    return slugify(`${base}-${hash}`)
  } catch {
    return simpleHash(url).toString(36)
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}

/** Fast non-cryptographic hash (djb2 variant) */
function simpleHash(str: string): number {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i)
    hash = hash >>> 0   // keep unsigned 32-bit
  }
  return hash
}
