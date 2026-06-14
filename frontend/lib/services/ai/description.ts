// =============================================================================
// Bookmark Description Generator
// Generates concise bookmark/URL descriptions using Gemini.
// =============================================================================

import type { SupabaseClient }   from '@supabase/supabase-js'
import type {
  ContentContext,
  DescriptionOptions,
  DescriptionResult,
} from './types'
import { generate, generateVariants } from './client'
import { buildDescriptionPrompt }     from './prompts'
import { saveGeneratedContentBatch }  from './storage'

/**
 * Generates one or more bookmark descriptions for a URL.
 *
 * Descriptions are stored with platform = 'twitter' by convention
 * (platform-neutral short-form text). Override via the DB directly if needed.
 */
export async function generateDescription(
  ctx: ContentContext,
  options: DescriptionOptions = {},
  supabase?: SupabaseClient,
  userId?: string
): Promise<DescriptionResult> {
  const variants = Math.min(options.variants ?? 1, 5)

  try {
    const prompt = buildDescriptionPrompt(ctx, options)

    let rawTexts: string[]

    if (variants === 1) {
      const response = await generate(prompt, {
        model:           options.model,
        temperature:     options.temperature ?? 0.5,   // lower = more consistent
        maxOutputTokens: options.maxOutputTokens ?? 128,
        maxRetries:      options.maxRetries,
      })
      rawTexts = [response.text]
    } else {
      const responses = await generateVariants(prompt, variants, {
        model:           options.model,
        temperature:     options.temperature ?? 0.65,
        maxOutputTokens: options.maxOutputTokens ?? 128,
        maxRetries:      options.maxRetries,
      })
      rawTexts = responses.map((r) => r.text)
    }

    const descriptions = rawTexts.map((t) => t.trim()).filter(Boolean)

    // Persist to DB if supabase client provided
    let savedIds: string[] | undefined
    if (supabase && userId && descriptions.length > 0) {
      try {
        const saved = await saveGeneratedContentBatch(
          supabase,
          descriptions.map((desc) => ({
            userId,
            platform:           'twitter' as const,  // platform-neutral content
            content:            desc,
            contentType:        'post' as const,
            tone:               ctx.tone,
            campaignId:         ctx.campaignId,
            extractedContentId: ctx.extractedContentId,
            metadata: {
              promptType:  'bookmark_description',
              targetWords: options.targetWords ?? 30,
              style:       options.style ?? 'sentence',
            },
          }))
        )
        savedIds = saved.map((s) => s.id)
      } catch (dbErr) {
        console.error('[description] DB save failed (non-fatal):', dbErr)
      }
    }

    return { success: true, descriptions, savedIds }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, descriptions: [], error: message }
  }
}
