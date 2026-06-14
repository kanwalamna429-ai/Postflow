// =============================================================================
// Article Summary Generator
// Generates structured summaries (bullets / paragraph / TL;DR) using Gemini.
// =============================================================================

import type { SupabaseClient }   from '@supabase/supabase-js'
import type {
  ContentContext,
  SummaryOptions,
  SummaryResult,
  ArticleSummary,
} from './types'
import { generate, generateVariants } from './client'
import { buildSummaryPrompt }         from './prompts'
import { saveGeneratedContentBatch }  from './storage'

/**
 * Generates article summaries in the requested format.
 *
 * @param ctx     Source article content + metadata
 * @param options Format (bullets | paragraph | tldr), point count, variants
 * @param supabase  Optional — persists results to generated_content
 * @param userId    Required when supabase is provided
 */
export async function generateSummary(
  ctx: ContentContext,
  options: SummaryOptions = {},
  supabase?: SupabaseClient,
  userId?: string
): Promise<SummaryResult> {
  const format   = options.format ?? 'bullets'
  const variants = Math.min(options.variants ?? 1, 3)  // summaries rarely need >3 variants

  // Token budget depends on format
  const tokenBudget: Record<string, number> = {
    bullets:   512,
    paragraph: 256,
    tldr:      128,
  }

  try {
    const prompt = buildSummaryPrompt(ctx, options)

    let rawTexts: string[]

    if (variants === 1) {
      const response = await generate(prompt, {
        model:           options.model,
        temperature:     options.temperature ?? 0.4,   // low temp — factual extraction
        maxOutputTokens: options.maxOutputTokens ?? tokenBudget[format],
        maxRetries:      options.maxRetries,
      })
      rawTexts = [response.text]
    } else {
      const responses = await generateVariants(prompt, variants, {
        model:           options.model,
        temperature:     options.temperature ?? 0.5,
        maxOutputTokens: options.maxOutputTokens ?? tokenBudget[format],
        maxRetries:      options.maxRetries,
      })
      rawTexts = responses.map((r) => r.text)
    }

    const summaries: ArticleSummary[] = rawTexts.map((raw) => ({
      content:   raw.trim(),
      format,
      wordCount: countWords(raw.trim()),
    }))

    // Persist to DB
    let savedIds: string[] | undefined
    if (supabase && userId && summaries.length > 0) {
      try {
        const saved = await saveGeneratedContentBatch(
          supabase,
          summaries.map((summary) => ({
            userId,
            platform:           'linkedin' as const,  // summaries are long-form
            content:            summary.content,
            contentType:        'post' as const,
            tone:               ctx.tone,
            campaignId:         ctx.campaignId,
            extractedContentId: ctx.extractedContentId,
            metadata: {
              promptType:  'article_summary',
              format,
              wordCount:   summary.wordCount,
              maxPoints:   options.maxPoints ?? 5,
            },
          }))
        )
        savedIds = saved.map((s) => s.id)
      } catch (dbErr) {
        console.error('[summary] DB save failed (non-fatal):', dbErr)
      }
    }

    return { success: true, summaries, savedIds }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, summaries: [], error: message }
  }
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}
