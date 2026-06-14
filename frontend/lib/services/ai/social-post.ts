// =============================================================================
// Social Post Generator
// Generates platform-specific social media posts using Gemini.
// =============================================================================

import type { SupabaseClient }   from '@supabase/supabase-js'
import type {
  ContentContext,
  SocialPostOptions,
  SocialPostResult,
  GeneratedPost,
  ContentTone,
} from './types'
import { generate, generateVariants } from './client'
import { buildSocialPostPrompt, buildHashtagPrompt, PLATFORM_LIMITS } from './prompts'
import { saveGeneratedContentBatch } from './storage'

/**
 * Generates one or more social media posts for a given platform.
 *
 * @param ctx     Source content and metadata
 * @param options Platform, tone, variant count, and formatting options
 * @param supabase  Optional — if provided, saves results to generated_content
 * @param userId    Required when supabase is provided
 */
export async function generateSocialPost(
  ctx: ContentContext,
  options: SocialPostOptions,
  supabase?: SupabaseClient,
  userId?: string
): Promise<SocialPostResult> {
  const variants    = Math.min(options.variants ?? 1, 5)
  const platform    = options.platform
  const charLimit   = PLATFORM_LIMITS[platform].charLimit
  const contentType = options.contentType ?? 'post'
  const tone        = options.tone ?? PLATFORM_LIMITS[platform].toneDefault

  try {
    const prompt = buildSocialPostPrompt(ctx, options)

    let rawTexts: string[]

    if (variants === 1) {
      const response = await generate(prompt, {
        model:           options.model,
        temperature:     options.temperature ?? 0.75,
        maxOutputTokens: options.maxOutputTokens ?? 512,
        maxRetries:      options.maxRetries,
      })
      rawTexts = [response.text]
    } else {
      const responses = await generateVariants(prompt, variants, {
        model:           options.model,
        temperature:     options.temperature ?? 0.85,  // higher temp for variety
        maxOutputTokens: options.maxOutputTokens ?? 512,
        maxRetries:      options.maxRetries,
      })
      rawTexts = responses.map((r) => r.text)
    }

    // Parse each variant
    const posts: GeneratedPost[] = rawTexts.map((raw) => {
      const { content, hashtags } = extractHashtagsFromPost(raw.trim(), platform)
      return {
        content: content.trim(),
        hashtags,
        characterCount: content.trim().length,
        withinLimit: content.trim().length <= charLimit,
        tone,
      }
    })

    // Persist to DB if supabase client provided
    let savedIds: string[] | undefined
    if (supabase && userId) {
      try {
        const saved = await saveGeneratedContentBatch(
          supabase,
          posts.map((post) => ({
            userId,
            platform,
            content: post.content,
            contentType,
            tone,
            hashtags: post.hashtags,
            campaignId:          ctx.campaignId,
            extractedContentId:  ctx.extractedContentId,
            metadata: {
              characterCount: post.characterCount,
              withinLimit:    post.withinLimit,
              promptType:     'social_post',
            },
          }))
        )
        savedIds = saved.map((s) => s.id)
      } catch (dbErr) {
        console.error('[social-post] DB save failed (non-fatal):', dbErr)
      }
    }

    return { success: true, platform, contentType, posts, savedIds }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, platform, contentType, posts: [], error: message }
  }
}

/**
 * Generates posts for MULTIPLE platforms in parallel.
 * Useful for cross-posting a single piece of content everywhere.
 */
export async function generateCrossPostContent(
  ctx: ContentContext,
  platforms: SocialPostOptions['platform'][],
  baseOptions: Omit<SocialPostOptions, 'platform'> = {},
  supabase?: SupabaseClient,
  userId?: string
): Promise<Record<string, SocialPostResult>> {
  const results = await Promise.allSettled(
    platforms.map((platform) =>
      generateSocialPost(ctx, { ...baseOptions, platform }, supabase, userId)
    )
  )

  const output: Record<string, SocialPostResult> = {}
  results.forEach((result, i) => {
    const platform = platforms[i]
    if (result.status === 'fulfilled') {
      output[platform] = result.value
    } else {
      output[platform] = {
        success: false,
        platform,
        contentType: baseOptions.contentType ?? 'post',
        posts: [],
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      }
    }
  })

  return output
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Separates hashtags from post body.
 * Handles hashtags inline or at the end.
 */
function extractHashtagsFromPost(
  raw: string,
  platform: SocialPostOptions['platform']
): { content: string; hashtags: string[] } {
  // Extract all hashtag tokens
  const hashtagPattern = /#[\w\u00C0-\u024F\u0400-\u04FF]+/g
  const found = raw.match(hashtagPattern) ?? []

  // For Twitter, hashtags stay inline; for others, we separate them from the body
  if (platform === 'twitter') {
    return { content: raw, hashtags: found }
  }

  // Remove hashtag block at end (separated by newline)
  const withoutTags = raw
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim()
      // Remove lines that are ONLY hashtags
      return !trimmed.split(/\s+/).every((word) => word.startsWith('#') || word === '')
    })
    .join('\n')
    .trim()

  return { content: withoutTags, hashtags: found }
}
