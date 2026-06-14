// =============================================================================
// Hashtag Generator
// Generates platform-specific hashtag sets using Gemini.
// Returns structured variant sets for A/B testing.
// =============================================================================

import type { SupabaseClient }   from '@supabase/supabase-js'
import type {
  ContentContext,
  HashtagOptions,
  HashtagResult,
} from './types'
import { generate, generateVariants } from './client'
import { buildHashtagPrompt, PLATFORM_LIMITS } from './prompts'
import { saveGeneratedContentBatch }  from './storage'

/**
 * Generates hashtag sets for a given platform.
 * Returns an array of variant sets (each set = array of hashtags).
 *
 * @param ctx     Source content + metadata
 * @param options Platform, count, variant count
 * @param supabase  Optional — persists results to generated_content
 * @param userId    Required when supabase is provided
 */
export async function generateHashtags(
  ctx: ContentContext,
  options: HashtagOptions,
  supabase?: SupabaseClient,
  userId?: string
): Promise<HashtagResult> {
  const variants = Math.min(options.variants ?? 1, 3)
  const platform = options.platform
  const count    = options.count ?? PLATFORM_LIMITS[platform].hashtagCount

  try {
    const prompt = buildHashtagPrompt(ctx, { ...options, count })

    let rawTexts: string[]

    if (variants === 1) {
      const response = await generate(prompt, {
        model:           options.model,
        temperature:     options.temperature ?? 0.6,
        maxOutputTokens: options.maxOutputTokens ?? 256,
        maxRetries:      options.maxRetries,
      })
      rawTexts = [response.text]
    } else {
      const responses = await generateVariants(prompt, variants, {
        model:           options.model,
        temperature:     options.temperature ?? 0.75,
        maxOutputTokens: options.maxOutputTokens ?? 256,
        maxRetries:      options.maxRetries,
      })
      rawTexts = responses.map((r) => r.text)
    }

    // Parse JSON arrays from each variant
    const hashtagSets: string[][] = rawTexts.map((raw) => parseHashtagArray(raw, count))

    // Persist — each set stored as a single comma-joined string in content
    let savedIds: string[] | undefined
    if (supabase && userId && hashtagSets.length > 0) {
      try {
        const saved = await saveGeneratedContentBatch(
          supabase,
          hashtagSets.map((set) => ({
            userId,
            platform,
            content:            set.join(' '),
            contentType:        'post' as const,
            tone:               ctx.tone,
            hashtags:           set,
            campaignId:         ctx.campaignId,
            extractedContentId: ctx.extractedContentId,
            metadata: {
              promptType: 'hashtags',
              count,
              includeBroad: options.includeBroad ?? true,
              includeNiche: options.includeNiche ?? true,
            },
          }))
        )
        savedIds = saved.map((s) => s.id)
      } catch (dbErr) {
        console.error('[hashtags] DB save failed (non-fatal):', dbErr)
      }
    }

    return { success: true, platform, hashtags: hashtagSets, savedIds }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, platform, hashtags: [], error: message }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parses a JSON array of hashtag strings from raw model output.
 * Falls back to regex extraction if JSON parsing fails.
 */
function parseHashtagArray(raw: string, expectedCount: number): string[] {
  // Try JSON parse first
  try {
    const jsonStart = raw.indexOf('[')
    const jsonEnd   = raw.lastIndexOf(']')
    if (jsonStart !== -1 && jsonEnd > jsonStart) {
      const arr = JSON.parse(raw.slice(jsonStart, jsonEnd + 1))
      if (Array.isArray(arr)) {
        return arr
          .map((t) => String(t).trim())
          .filter((t) => t.startsWith('#') && t.length > 1)
          .slice(0, expectedCount * 2)  // allow some extras
      }
    }
  } catch { /* fall through */ }

  // Regex fallback: extract #word tokens
  const matches = raw.match(/#[\w\u00C0-\u024F\u0400-\u04FF]+/g) ?? []
  return [...new Set(matches)].slice(0, expectedCount)
}
