// =============================================================================
// Fallback content builder
// Used when GEMINI_API_KEY is not set or AI generation fails.
// Assembles meaningful content from extracted metadata rather than returning
// just the page title or a bare source URL.
// =============================================================================

import type { ContentContext } from './types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract meaningful keywords from a URL path slug */
export function slugToKeywords(url: string | null): string[] {
  if (!url) return []
  try {
    const path = new URL(url).pathname
    return [...new Set(
      path
        .split(/[-_/]+/)
        .map((w) => w.toLowerCase().trim())
        .filter((w) => w.length >= 3 && !/^\d+$/.test(w)),
    )].slice(0, 8)
  } catch {
    return []
  }
}

/** Strip brand suffix like " | Nutryio" or " - Brand" from a page title */
function cleanTitle(raw: string): string {
  return raw.replace(/\s*[\|—–\-]\s*\S[^|—–\-]*$/, '').trim() || raw
}

function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

/** True when the string looks like a bare URL rather than article body text */
function isUrlString(s: string): boolean {
  return /^https?:\/\//i.test(s.trim())
}

// ---------------------------------------------------------------------------
// buildFallbackContent
// ---------------------------------------------------------------------------

export interface FallbackOptions {
  platform:  string
  ctx:       ContentContext
  sourceUrl: string | null
  charLimit: number
}

/**
 * Build meaningful fallback content when AI is unavailable or fails.
 *
 * Publishing platforms (devto, hashnode, medium, substack):
 *   Returns a structured article template with title-derived topic, description,
 *   extracted body text (if any), and a source attribution footer.
 *
 * Social platforms (linkedin, facebook, etc.):
 *   Returns assembled post: title + description + URL + keyword hashtags.
 *
 * Short platforms (twitter, bluesky, pocket, instapaper):
 *   Returns description or title + URL + up to 3 hashtags, trimmed to char limit.
 */
export function buildFallbackContent({ platform, ctx, sourceUrl, charLimit }: FallbackOptions): string {
  const isPublishing = ['devto', 'hashnode', 'medium', 'substack'].includes(platform)
  const isShort      = ['twitter', 'bluesky', 'pocket', 'instapaper'].includes(platform)

  const title       = ctx.title?.trim()       ?? ''
  const description = ctx.description?.trim() ?? ''

  // Only treat sourceText as article body if it is real extracted text — not a bare URL
  const rawBody = ctx.sourceText?.trim() ?? ''
  const bodyText =
    rawBody &&
    rawBody !== title &&
    rawBody !== description &&
    !isUrlString(rawBody)
      ? rawBody
      : ''

  // Derive a clean topic label (strip " | Brand" suffix from page title)
  const urlKeywords = slugToKeywords(sourceUrl)
  const topic       = cleanTitle(title) || cap(urlKeywords.slice(-2).join(' ')) || 'this topic'

  // Deduplicated hashtag-safe keywords (ctx.keywords + URL slug words)
  const allKws  = [...(ctx.keywords ?? []), ...urlKeywords]
  const keywords = [...new Set(allKws.map((k) => k.toLowerCase().replace(/\s+/g, '')))].slice(0, 6)

  const parts: string[] = []

  if (isPublishing) {
    // Lead paragraph: OG description if available
    if (description) parts.push(description)

    // Body: extracted text or a topic-aware template
    if (bodyText) {
      parts.push(bodyText.slice(0, 3_000))
    } else if (!description) {
      // Nothing extracted at all — produce a usable Markdown article skeleton
      parts.push(
        `## Introduction\n\n` +
        `This article explores **${topic}** and covers the key concepts, ` +
        `practical applications, and best practices around this subject.\n\n` +
        `## What You Will Learn\n\n` +
        `- What ${topic.toLowerCase()} is and why it matters\n` +
        `- How to apply these concepts in practice\n` +
        `- Tips, tools, and resources to get started\n\n` +
        `## Conclusion\n\n` +
        `${topic} is an important resource. ` +
        `Visit the source link below for full details.`,
      )
    }

    // Source attribution footer
    if (sourceUrl) {
      parts.push(`---\n*Originally published at [${sourceUrl}](${sourceUrl})*`)
    }
  } else if (isShort) {
    const main = description || title
    if (main)      parts.push(main)
    if (sourceUrl) parts.push(sourceUrl)
    if (keywords.length) parts.push(keywords.slice(0, 3).map((k) => `#${k}`).join(' '))
  } else {
    // Standard social platforms
    if (title)                                parts.push(title)
    if (description && description !== title) parts.push(description)
    if (bodyText)                             parts.push(bodyText.slice(0, 800))
    if (sourceUrl)                            parts.push(sourceUrl)
    if (keywords.length)                      parts.push(keywords.slice(0, 5).map((k) => `#${k}`).join(' '))
  }

  let result = parts.filter(Boolean).join('\n\n')
  if (charLimit > 0 && result.length > charLimit) result = result.slice(0, charLimit)
  return result || title || sourceUrl || '[Content pending]'
}

// ---------------------------------------------------------------------------
// buildFallbackHashtags
// ---------------------------------------------------------------------------

/**
 * Derive hashtag-ready keyword strings from ctx.keywords + URL slug.
 * Used to populate the hashtags metadata field when AI doesn't run.
 */
export function buildFallbackHashtags(
  ctx:       ContentContext,
  sourceUrl: string | null,
  max        = 5,
): string[] {
  const urlKws = slugToKeywords(sourceUrl)
  const ctxKws = (ctx.keywords ?? []).map((k) => k.toLowerCase().replace(/\s+/g, ''))
  return [...new Set([...ctxKws, ...urlKws])].slice(0, max)
}
