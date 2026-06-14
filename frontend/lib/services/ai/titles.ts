// =============================================================================
// Alternative Title Generator
// Generates headline variants for SEO, social, email, and A/B testing.
// =============================================================================

import type { SupabaseClient }   from '@supabase/supabase-js'
import type {
  ContentContext,
  TitleOptions,
  TitleResult,
  AlternativeTitle,
} from './types'
import { generate }              from './client'
import { buildTitlePrompt }      from './prompts'
import { saveGeneratedContentBatch } from './storage'

/**
 * Generates alternative titles for an article or page.
 *
 * @param ctx     Source content + original title
 * @param options Purpose (seo | social | email | ab-test | general), count
 * @param supabase  Optional — persists results to generated_content
 * @param userId    Required when supabase is provided
 */
export async function generateTitles(
  ctx: ContentContext,
  options: TitleOptions = {},
  supabase?: SupabaseClient,
  userId?: string
): Promise<TitleResult> {
  const count   = options.variants ?? 5
  const purpose = options.purpose ?? 'general'
  const maxLen  = options.maxLength ?? 80

  try {
    const prompt = buildTitlePrompt(ctx, { ...options, variants: count })

    // Titles need a single call — variants are all returned in one JSON array
    const response = await generate(prompt, {
      model:           options.model,
      temperature:     options.temperature ?? 0.8,   // higher creativity
      maxOutputTokens: options.maxOutputTokens ?? 512,
      maxRetries:      options.maxRetries,
    })

    const parsedTitles = parseTitleArray(response.text, count)

    const titles: AlternativeTitle[] = parsedTitles.map((title) => ({
      title:          title.slice(0, maxLen),
      purpose,
      characterCount: Math.min(title.length, maxLen),
    }))

    // Persist to DB
    let savedIds: string[] | undefined
    if (supabase && userId && titles.length > 0) {
      try {
        const saved = await saveGeneratedContentBatch(
          supabase,
          titles.map((t) => ({
            userId,
            platform:           'twitter' as const,  // title-length content
            content:            t.title,
            contentType:        'post' as const,
            tone:               ctx.tone,
            campaignId:         ctx.campaignId,
            extractedContentId: ctx.extractedContentId,
            metadata: {
              promptType:      'alternative_title',
              purpose,
              originalTitle:   ctx.title,
              characterCount:  t.characterCount,
            },
          }))
        )
        savedIds = saved.map((s) => s.id)
      } catch (dbErr) {
        console.error('[titles] DB save failed (non-fatal):', dbErr)
      }
    }

    return { success: true, titles, savedIds }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, titles: [], error: message }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parses a JSON array of title strings from raw model output.
 * Falls back to line-splitting if JSON parsing fails.
 */
function parseTitleArray(raw: string, expectedCount: number): string[] {
  // Try JSON parse first
  try {
    const jsonStart = raw.indexOf('[')
    const jsonEnd   = raw.lastIndexOf(']')
    if (jsonStart !== -1 && jsonEnd > jsonStart) {
      const arr = JSON.parse(raw.slice(jsonStart, jsonEnd + 1))
      if (Array.isArray(arr)) {
        return arr
          .map((t) => String(t).trim())
          .filter((t) => t.length > 3 && t.length < 200)
          .slice(0, expectedCount)
      }
    }
  } catch { /* fall through */ }

  // Line-splitting fallback
  return raw
    .split('\n')
    .map((line) => line.replace(/^[\d\.\-\*"']+\s*/, '').replace(/['"]+$/, '').trim())
    .filter((line) => line.length > 3 && line.length < 200)
    .slice(0, expectedCount)
}
