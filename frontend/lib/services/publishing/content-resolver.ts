// =============================================================================
// Content Resolver — Publishing Engine
// Checks whether a scheduled post has pending AI content, and if so,
// generates it using the Gemini service before the adapter is called.
//
// Why it exists: When a campaign is activated, scheduled_posts rows are
// created immediately with metadata.content_pending = true. This module
// handles the deferred content generation at publish time.
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { generateSocialPost } from '@/lib/services/ai/social-post'
import { generateDescription } from '@/lib/services/ai/description'
import type { ContentContext, SocialPlatform } from '@/lib/services/ai/types'
import { getPlatformConfig } from '@/lib/platforms'
import { logContentGeneration } from './log-writer'

// ---------------------------------------------------------------------------
// Extracted content row (from extracted_content table)
// ---------------------------------------------------------------------------

interface ExtractedContentRow {
  id: string
  title: string | null
  description: string | null
  content: string | null
  author: string | null
  site_name: string | null
  canonical_url: string | null
  published_date: string | null
  keywords: string[] | null
}

// ---------------------------------------------------------------------------
// Resolution result
// ---------------------------------------------------------------------------

export interface ContentResolutionResult {
  content: string
  title?: string
  tags?: string[]
  wasGenerated: boolean
}

// ---------------------------------------------------------------------------
// Resolve content for a scheduled post
// ---------------------------------------------------------------------------

/**
 * Returns the content to publish for a scheduled post.
 *
 * If metadata.content_pending is true (or content is a placeholder),
 * fetches the source URL's extracted_content and generates AI content.
 * Updates the scheduled_post row in-place so subsequent retries don't regenerate.
 *
 * Returns the content string (and optional title/tags) to pass to the adapter.
 */
export async function resolveContent(
  supabase: SupabaseClient,
  params: {
    scheduledPostId: string
    userId: string
    campaignId: string
    urlId: string | null
    platform: string
    currentContent: string
    metadata: Record<string, unknown>
  }
): Promise<ContentResolutionResult> {
  const contentPending =
    params.metadata['content_pending'] === true ||
    params.currentContent === '[Content pending AI generation]'

  // -------------------------------------------------------------------------
  // Fast path: content already resolved
  // -------------------------------------------------------------------------
  if (!contentPending) {
    const tags = Array.isArray(params.metadata['hashtags'])
      ? (params.metadata['hashtags'] as string[])
      : undefined
    const title = typeof params.metadata['title'] === 'string'
      ? params.metadata['title']
      : undefined
    return { content: params.currentContent, title, tags, wasGenerated: false }
  }

  // -------------------------------------------------------------------------
  // Slow path: generate content from extracted_content
  // -------------------------------------------------------------------------

  // Load the source URL's extracted content
  let extracted: ExtractedContentRow | null = null
  if (params.urlId) {
    const { data } = await supabase
      .from('extracted_content')
      .select('id, title, description, content, author, site_name, canonical_url, published_date, keywords')
      .eq('url_id', params.urlId)
      .maybeSingle()
    extracted = data ?? null
  }

  // If no extracted content, fall back to the source URL as plain text
  const sourceText =
    extracted?.content ??
    extracted?.description ??
    extracted?.title ??
    params.currentContent

  const title   = extracted?.title     ?? undefined
  const description = extracted?.description ?? undefined
  const sourceUrl = extracted?.canonical_url ?? undefined

  const ctx: ContentContext = {
    sourceText,
    title,
    description,
    author:        extracted?.author    ?? undefined,
    siteName:      extracted?.site_name ?? undefined,
    sourceUrl,
    publishDate:   extracted?.published_date ? new Date(extracted.published_date) : undefined,
    keywords:      extracted?.keywords ?? undefined,
    extractedContentId: extracted?.id,
    campaignId:    params.campaignId,
  }

  // Determine the AI prompt category for this platform
  const platformConfig = getPlatformConfig(params.platform)
  const promptCategory = platformConfig?.aiConfig.promptCategory ?? 'social_post'

  let generatedContent: string | null = null
  let generatedTags: string[] = []

  try {
    if (promptCategory === 'bookmark_note') {
      // Bookmarking platforms get a short description
      const result = await generateDescription(ctx, {
        targetWords: 30,
        style: 'sentence',
      })
      if (result.success && result.descriptions.length > 0) {
        generatedContent = result.descriptions[0]
      }
    } else {
      // Social and publishing platforms get a full post / article body
      const isPublishingPlatform = ['devto', 'hashnode', 'medium', 'substack'].includes(params.platform)
      const result = await generateSocialPost(ctx, {
        platform:        params.platform as SocialPlatform,
        includeHashtags: true,
        includeEmoji:    platformConfig?.aiConfig.emojiStyle !== 'none',
        // Publishing platforms need a full article body — use higher token budget
        maxOutputTokens: isPublishingPlatform ? 2048 : 512,
      })
      if (result.success && result.posts.length > 0) {
        generatedContent = result.posts[0].content
        generatedTags    = result.posts[0].hashtags
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await logContentGeneration(supabase, {
      userId:          params.userId,
      campaignId:      params.campaignId,
      scheduledPostId: params.scheduledPostId,
      platform:        params.platform,
      success:         false,
      errorMessage:    message,
    })
    // Fall back to title or source URL so publish can still proceed
    generatedContent = title ?? sourceUrl ?? params.currentContent
  }

  if (!generatedContent) {
    generatedContent = title ?? sourceUrl ?? params.currentContent
  }

  // -------------------------------------------------------------------------
  // Assemble complete post body
  //
  // Publishing platforms (devto, hashnode, medium, substack):
  //   Adapter handles title + tags separately; assemble body as:
  //   description → AI body → source URL footer → tags (plain, last line)
  //
  // Social platforms:
  //   title → body → source URL → hashtags
  //
  // Short platforms (twitter, bluesky, pocket, instapaper):
  //   body → URL → hashtags  (skip title to preserve char budget)
  // -------------------------------------------------------------------------
  const PUBLISHING_PLATFORMS = new Set(['devto', 'hashnode', 'medium', 'substack'])
  const SHORT_PLATFORMS      = new Set(['twitter', 'bluesky', 'pocket', 'instapaper'])
  const isPublishing = PUBLISHING_PLATFORMS.has(params.platform)

  if (isPublishing && generatedContent) {
    // Publishing adapters (devto, hashnode, medium, substack) receive:
    //   - title  → input.title  (separate field, not in body)
    //   - tags   → input.tags   (adapter adds these to article tags + body footnote)
    //   - url    → input.url    (adapter adds canonical_url + "Originally published at" footer)
    // So the body should contain ONLY: description intro + AI article body.
    const bodyParts: string[] = []

    // 1. Description as opening paragraph (only if meaningfully different from AI body)
    if (description && !generatedContent.includes(description.slice(0, 40))) {
      bodyParts.push(description)
    }

    // 2. Main AI-generated article body
    bodyParts.push(generatedContent)

    generatedContent = bodyParts.filter(Boolean).join('\n\n')
  } else if (!isPublishing && generatedContent) {
    const bodyParts: string[] = []

    if (!SHORT_PLATFORMS.has(params.platform) && title &&
        !generatedContent.trimStart().startsWith(title.slice(0, 30))) {
      bodyParts.push(title)
    }

    bodyParts.push(generatedContent)

    if (sourceUrl && !generatedContent.includes(sourceUrl)) {
      bodyParts.push(sourceUrl)
    }

    if (generatedTags.length > 0) {
      const firstTag = generatedTags[0].startsWith('#') ? generatedTags[0] : `#${generatedTags[0]}`
      if (!generatedContent.includes(firstTag)) {
        bodyParts.push(generatedTags.map((t) => (t.startsWith('#') ? t : `#${t}`)).join(' '))
      }
    }

    generatedContent = bodyParts.filter(Boolean).join('\n\n')
  }

  // -------------------------------------------------------------------------
  // Persist the resolved content back to scheduled_posts so retries skip generation
  // -------------------------------------------------------------------------
  await supabase
    .from('scheduled_posts')
    .update({
      content:  generatedContent,
      metadata: {
        ...params.metadata,
        content_pending: false,
        title,
        hashtags:      generatedTags,
        source_url:    sourceUrl ?? null,
        generated_at:  new Date().toISOString(),
      },
    })
    .eq('id', params.scheduledPostId)

  await logContentGeneration(supabase, {
    userId:          params.userId,
    campaignId:      params.campaignId,
    scheduledPostId: params.scheduledPostId,
    platform:        params.platform,
    success:         true,
  })

  return {
    content:      generatedContent,
    title,
    tags:         generatedTags.length > 0 ? generatedTags : undefined,
    wasGenerated: true,
  }
}
