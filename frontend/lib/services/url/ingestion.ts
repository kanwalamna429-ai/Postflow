// =============================================================================
// URL Ingestion Service
// Orchestrates: validate → normalize → dedup → fetch → extract → store
//
// Usage (from a Next.js Server Action):
//   import { ingestUrl, ingestUrls } from '@/lib/services/url'
//   const result = await ingestUrl(supabase, 'https://example.com/article', { campaignId })
// =============================================================================

import type { SupabaseClient }    from '@supabase/supabase-js'
import type {
  IngestionOptions,
  IngestionResult,
  BulkIngestionOptions,
  BulkIngestionResult,
} from './types'
import { validateUrl }        from './validator'
import { normalizeUrl, generateSlug } from './normalizer'
import { fetchUrl }           from './fetcher'
import { extractMetadata }    from './extractor'
import { checkDuplicate, checkDuplicates } from './deduplicator'

// ---------------------------------------------------------------------------
// Single URL ingestion
// ---------------------------------------------------------------------------

/**
 * Ingest a single URL:
 * 1. Validate
 * 2. Normalize (strip UTM, tracking params)
 * 3. Deduplicate
 * 4. Fetch HTML
 * 5. Extract metadata
 * 6. Store in campaign_urls + extracted_content
 */
export async function ingestUrl(
  supabase: SupabaseClient,
  rawUrl: string,
  options: IngestionOptions = {}
): Promise<IngestionResult> {
  const {
    campaignId,
    title: overrideTitle,
    tags = [],
    skipDuplicates = true,
    extractMetadata: doExtract = true,
    generateSlug: doSlug = true,
    userId,
  } = options

  // -------------------------------------------------------------------------
  // 0. Resolve user ID
  // -------------------------------------------------------------------------
  const resolvedUserId = userId ?? (await getAuthUserId(supabase))
  if (!resolvedUserId) {
    return fail(rawUrl, 'Not authenticated — userId is required')
  }

  // -------------------------------------------------------------------------
  // 1. Validate
  // -------------------------------------------------------------------------
  const validation = validateUrl(rawUrl)
  if (!validation.valid || !validation.normalizedUrl) {
    return fail(rawUrl, validation.error ?? 'Invalid URL')
  }

  // -------------------------------------------------------------------------
  // 2. Normalize
  // -------------------------------------------------------------------------
  const { url: normalizedUrl } = normalizeUrl(validation.normalizedUrl)

  // -------------------------------------------------------------------------
  // 3. Deduplicate (quick exact + normalized check, no canonical yet)
  // -------------------------------------------------------------------------
  if (skipDuplicates) {
    const dupCheck = await checkDuplicate(supabase, resolvedUserId, normalizedUrl)
    if (dupCheck.isDuplicate) {
      return {
        success: true,
        urlId: dupCheck.existingUrlId,
        isDuplicate: true,
        existingUrlId: dupCheck.existingUrlId,
        normalizedUrl,
        inputUrl: rawUrl,
      }
    }
  }

  // -------------------------------------------------------------------------
  // 4. Fetch HTML
  // -------------------------------------------------------------------------
  let metadata = undefined
  let rawHtml: string | undefined

  if (doExtract) {
    const fetchResult = await fetchUrl(normalizedUrl)

    if (fetchResult.ok && fetchResult.html) {
      rawHtml = fetchResult.html

      // -----------------------------------------------------------------------
      // 5. Extract metadata
      // -----------------------------------------------------------------------
      metadata = extractMetadata(fetchResult.html, fetchResult.finalUrl ?? normalizedUrl)

      // -----------------------------------------------------------------------
      // 5a. Re-check duplicate using resolved canonical URL
      // -----------------------------------------------------------------------
      if (skipDuplicates && metadata.canonicalUrl && metadata.canonicalUrl !== normalizedUrl) {
        const canonDupCheck = await checkDuplicate(
          supabase,
          resolvedUserId,
          normalizedUrl,
          metadata.canonicalUrl
        )
        if (canonDupCheck.isDuplicate) {
          return {
            success: true,
            urlId: canonDupCheck.existingUrlId,
            isDuplicate: true,
            existingUrlId: canonDupCheck.existingUrlId,
            metadata,
            normalizedUrl,
            inputUrl: rawUrl,
          }
        }
      }
    }
    // Non-fatal: if fetch fails we continue without metadata
  }

  // -------------------------------------------------------------------------
  // 6. Insert campaign_urls row
  // -------------------------------------------------------------------------
  const finalTitle =
    overrideTitle ??
    metadata?.title ??
    extractDomainTitle(normalizedUrl)

  const slug = doSlug ? generateSlug(normalizedUrl) : null

  const { data: urlRow, error: urlError } = await supabase
    .from('campaign_urls')
    .insert({
      user_id:      resolvedUserId,
      campaign_id:  campaignId ?? null,
      title:        finalTitle,
      original_url: normalizedUrl,
      slug,
      tags,
      metadata:     metadata ? buildUrlMetadata(metadata) : {},
    })
    .select('id')
    .single()

  if (urlError || !urlRow) {
    return fail(rawUrl, urlError?.message ?? 'Failed to insert URL record')
  }

  // -------------------------------------------------------------------------
  // 7. Insert extracted_content row (if metadata available)
  // -------------------------------------------------------------------------
  let extractedContentId: string | undefined

  if (metadata) {
    const { data: contentRow, error: contentError } = await supabase
      .from('extracted_content')
      .insert({
        user_id:      resolvedUserId,
        url_id:       urlRow.id,
        source_url:   metadata.canonicalUrl ?? normalizedUrl,
        title:        metadata.title        ?? null,
        description:  metadata.description  ?? null,
        body:         null,                 // full body extraction is separate
        author:       metadata.author       ?? null,
        published_at: metadata.publishDate  ?? null,
        og_image_url: metadata.featuredImage ?? null,
        keywords:     metadata.keywords     ?? [],
        raw_html:     rawHtml?.slice(0, 100_000) ?? null,  // cap at 100kb
        metadata:     buildExtractedMetadata(metadata),
      })
      .select('id')
      .single()

    if (contentError) {
      console.error('[ingestion] extracted_content insert failed:', contentError.message)
      // Non-fatal: URL row already created successfully
    } else {
      extractedContentId = contentRow?.id
    }
  }

  return {
    success: true,
    urlId: urlRow.id,
    extractedContentId,
    isDuplicate: false,
    metadata,
    normalizedUrl,
    inputUrl: rawUrl,
  }
}

// ---------------------------------------------------------------------------
// Bulk URL ingestion
// ---------------------------------------------------------------------------

/**
 * Ingest multiple URLs with configurable concurrency and batch delays.
 * Performs a single bulk dedup check before dispatching individual ingestions.
 */
export async function ingestUrls(
  supabase: SupabaseClient,
  rawUrls: string[],
  options: BulkIngestionOptions = {}
): Promise<BulkIngestionResult> {
  const {
    concurrency = 5,
    batchDelayMs = 200,
    failFast = false,
    skipDuplicates = true,
    userId,
    ...singleOptions
  } = options

  const startTime = Date.now()

  // Resolve user
  const resolvedUserId = userId ?? (await getAuthUserId(supabase))
  if (!resolvedUserId) {
    const errResult: IngestionResult = {
      success: false,
      isDuplicate: false,
      error: 'Not authenticated',
      inputUrl: '',
    }
    return {
      total: rawUrls.length,
      succeeded: 0,
      failed: rawUrls.length,
      duplicates: 0,
      skipped: 0,
      results: rawUrls.map((url) => ({ ...errResult, inputUrl: url })),
      durationMs: Date.now() - startTime,
    }
  }

  // Deduplicate the input list itself (remove same URL appearing twice)
  const uniqueUrls = deduplicateInputList(rawUrls)

  // Bulk pre-check against DB for fast duplicate detection
  let preDupMap = new Map<string, { isDuplicate: boolean; existingUrlId?: string }>()
  if (skipDuplicates && uniqueUrls.length > 0) {
    preDupMap = await checkDuplicates(supabase, resolvedUserId, uniqueUrls)
  }

  const results: IngestionResult[] = []
  let duplicates = 0
  let succeeded  = 0
  let failed     = 0
  let skipped    = 0

  // Process in batches to limit concurrency
  const chunks = chunkArray(uniqueUrls, concurrency)

  for (const batch of chunks) {
    const batchResults = await Promise.all(
      batch.map(async (url): Promise<IngestionResult> => {
        // Return early for known duplicates
        const preDup = preDupMap.get(url)
        if (preDup?.isDuplicate && skipDuplicates) {
          return {
            success: true,
            urlId: preDup.existingUrlId,
            isDuplicate: true,
            existingUrlId: preDup.existingUrlId,
            inputUrl: url,
          }
        }

        return ingestUrl(supabase, url, {
          ...singleOptions,
          skipDuplicates,
          userId: resolvedUserId,
        })
      })
    )

    for (const result of batchResults) {
      results.push(result)
      if (!result.success) {
        failed++
        if (failFast) break
      } else if (result.isDuplicate) {
        duplicates++
      } else {
        succeeded++
      }
    }

    if (failFast && failed > 0) break

    // Polite delay between batches
    if (batchDelayMs > 0 && chunks.indexOf(batch) < chunks.length - 1) {
      await sleep(batchDelayMs)
    }
  }

  // Account for duplicate input URLs that were skipped before any processing
  skipped = rawUrls.length - uniqueUrls.length

  return {
    total: rawUrls.length,
    succeeded,
    failed,
    duplicates,
    skipped,
    results,
    durationMs: Date.now() - startTime,
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getAuthUserId(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

function fail(inputUrl: string, error: string): IngestionResult {
  return { success: false, isDuplicate: false, error, inputUrl }
}

function extractDomainTitle(url: string): string {
  try {
    const parsed = new URL(url)
    return parsed.hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function buildUrlMetadata(metadata: ReturnType<typeof extractMetadata>) {
  return {
    ogType:       metadata.ogType,
    locale:       metadata.locale,
    twitterCard:  metadata.twitterCard,
    primarySource: metadata.primarySource,
    canonicalUrl: metadata.canonicalUrl,
  }
}

function buildExtractedMetadata(metadata: ReturnType<typeof extractMetadata>) {
  return {
    ogType:       metadata.ogType,
    locale:       metadata.locale,
    twitterCard:  metadata.twitterCard,
    primarySource: metadata.primarySource,
    fieldSources:  metadata.fieldSources,
    hasJsonLd:    (metadata.jsonLd?.length ?? 0) > 0,
  }
}

function deduplicateInputList(urls: string[]): string[] {
  return [...new Set(urls.map((u) => u.trim()).filter(Boolean))]
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
