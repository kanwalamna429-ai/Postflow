// =============================================================================
// Duplicate Detector
// Checks Supabase for existing campaign_urls / extracted_content records
// before ingesting a new URL.
//
// Detection strategy (in order):
//   1. Exact match on campaign_urls.original_url
//   2. Normalized comparison key match (strips UTM, www, trailing slash)
//   3. Canonical URL match from extracted_content.source_url
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type { DuplicateCheckResult } from './types'
import { toComparisonKey } from './normalizer'

/**
 * Checks whether a URL (or its normalized/canonical form) already exists
 * in the campaign_urls table for the given user.
 *
 * @param supabase  Authenticated Supabase client (server-side)
 * @param userId    The user whose URL library is being checked
 * @param url       The normalized URL to check
 * @param canonicalUrl  Optional canonical URL resolved from extracted metadata
 */
export async function checkDuplicate(
  supabase: SupabaseClient,
  userId: string,
  url: string,
  canonicalUrl?: string
): Promise<DuplicateCheckResult> {
  // -------------------------------------------------------------------------
  // 1. Exact match on original_url
  // -------------------------------------------------------------------------
  const { data: exactMatch, error: exactError } = await supabase
    .from('campaign_urls')
    .select('id, original_url')
    .eq('user_id', userId)
    .eq('original_url', url)
    .is('deleted_at', null)
    .maybeSingle()

  if (exactError) {
    console.error('[deduplicator] exact match query failed:', exactError.message)
  }

  if (exactMatch) {
    return {
      isDuplicate: true,
      existingUrlId: exactMatch.id,
      matchedUrl: exactMatch.original_url,
      matchType: 'exact',
    }
  }

  // -------------------------------------------------------------------------
  // 2. Normalized key comparison
  // Fetch all URLs for this user and compare normalized keys client-side.
  // For large libraries (>10k URLs) this should be replaced with a
  // stored generated column + index in the DB.
  // -------------------------------------------------------------------------
  const comparisonKey = toComparisonKey(url)

  const { data: allUrls, error: allError } = await supabase
    .from('campaign_urls')
    .select('id, original_url')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(5000)

  if (allError) {
    console.error('[deduplicator] bulk fetch query failed:', allError.message)
  }

  if (allUrls) {
    for (const row of allUrls) {
      if (toComparisonKey(row.original_url) === comparisonKey) {
        return {
          isDuplicate: true,
          existingUrlId: row.id,
          matchedUrl: row.original_url,
          matchType: 'normalized',
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // 3. Canonical URL match via extracted_content
  // -------------------------------------------------------------------------
  if (canonicalUrl && canonicalUrl !== url) {
    const { data: canonicalMatch, error: canonicalError } = await supabase
      .from('extracted_content')
      .select('id, url_id, source_url')
      .eq('user_id', userId)
      .eq('source_url', canonicalUrl)
      .not('url_id', 'is', null)
      .maybeSingle()

    if (canonicalError) {
      console.error('[deduplicator] canonical match query failed:', canonicalError.message)
    }

    if (canonicalMatch?.url_id) {
      return {
        isDuplicate: true,
        existingUrlId: canonicalMatch.url_id,
        matchedUrl: canonicalMatch.source_url,
        matchType: 'canonical',
      }
    }
  }

  return { isDuplicate: false }
}

/**
 * Batch duplicate check for multiple URLs.
 * Returns a map of input URL → DuplicateCheckResult.
 *
 * Uses a single bulk DB query for exact matches, then falls back to
 * the per-URL normalized check only for non-exact candidates.
 */
export async function checkDuplicates(
  supabase: SupabaseClient,
  userId: string,
  urls: string[]
): Promise<Map<string, DuplicateCheckResult>> {
  const results = new Map<string, DuplicateCheckResult>()

  if (urls.length === 0) return results

  // Fetch all existing URLs for this user in one query
  const { data: existingRows, error } = await supabase
    .from('campaign_urls')
    .select('id, original_url')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .limit(10000)

  if (error) {
    console.error('[deduplicator] bulk batch query failed:', error.message)
    // Degrade gracefully — treat all as non-duplicates
    for (const url of urls) {
      results.set(url, { isDuplicate: false })
    }
    return results
  }

  // Build lookup maps
  const exactMap = new Map<string, { id: string; original_url: string }>()
  const normalizedMap = new Map<string, { id: string; original_url: string }>()

  for (const row of existingRows ?? []) {
    exactMap.set(row.original_url, row)
    const key = toComparisonKey(row.original_url)
    if (!normalizedMap.has(key)) {
      normalizedMap.set(key, row)
    }
  }

  for (const url of urls) {
    const exact = exactMap.get(url)
    if (exact) {
      results.set(url, {
        isDuplicate: true,
        existingUrlId: exact.id,
        matchedUrl: exact.original_url,
        matchType: 'exact',
      })
      continue
    }

    const normKey = toComparisonKey(url)
    const normalized = normalizedMap.get(normKey)
    if (normalized) {
      results.set(url, {
        isDuplicate: true,
        existingUrlId: normalized.id,
        matchedUrl: normalized.original_url,
        matchType: 'normalized',
      })
      continue
    }

    results.set(url, { isDuplicate: false })
  }

  return results
}
