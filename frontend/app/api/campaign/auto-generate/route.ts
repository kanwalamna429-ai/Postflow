// =============================================================================
// POST /api/campaign/auto-generate
//
// One-shot endpoint: for every URL in a campaign, extract content (if not yet
// extracted) then call /api/generate to produce AI posts and update the
// pending scheduled_posts created by activateCampaign.
//
// Body: { campaignId: string }
//
// Response: { success, urlsProcessed, urlsFailed, details[] }
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchUrl } from '@/lib/services/url/fetcher'
import { extractMetadata } from '@/lib/services/url/extractor'
import { generateSocialPost } from '@/lib/services/ai/social-post'
import { buildFallbackContent, buildFallbackHashtags } from '@/lib/services/ai/fallback'
import { generateDescription } from '@/lib/services/ai/description'
import { generate } from '@/lib/services/ai/client'
import { PLATFORM_LIMITS } from '@/lib/services/ai/prompts'
import { frequencyToMs } from '@/lib/services/campaigns/frequency'
import { loadSettings } from '@/lib/services/settings'
import type { ContentContext, SocialPlatform, ContentTone } from '@/lib/services/ai/types'
import type { PlatformDefaults, PlatformDefaultSettings } from '@/lib/services/settings'
import type { CampaignFrequency } from '@/lib/services/campaigns/types'

const DEFAULT_PLATFORM_SETTING: PlatformDefaultSettings = {
  tone: 'professional', style: 'concise', hashtags: '', cta: '',
  includeEmoji: true, autoApprove: false, maxHashtags: 0,
}

// ---------------------------------------------------------------------------
// Helpers (duplicated from generate/route.ts to keep routes self-contained)
// ---------------------------------------------------------------------------

async function rewriteTitle(ctx: ContentContext): Promise<string | null> {
  if (!ctx.title && !ctx.sourceText) return null
  try {
    const snippet   = (ctx.sourceText ?? ctx.title ?? '').slice(0, 600)
    const titleLine = ctx.title ? `Original title: "${ctx.title}"\n` : ''
    const prompt    = [
      'You are a professional content marketer.',
      'Write a compelling, punchy, social-media-ready title for the content below.',
      '',
      titleLine + `Content: ${snippet}`,
      '',
      'Rules: output ONLY the title text — no quotes, no JSON, no markdown, no explanation. Max 100 characters.',
    ].join('\n')
    const res     = await generate(prompt, { temperature: 0.8, maxOutputTokens: 100 })
    const cleaned = res.text
      .trim()
      .replace(/^```[\w]*\s*/m, '').replace(/\s*```$/m, '')
      .replace(/^["'`]|["'`]$/g, '')
      .split('\n')[0]
      .trim()
    return cleaned.length >= 5 ? cleaned : null
  } catch { return null }
}

async function rewriteDescription(ctx: ContentContext): Promise<string | null> {
  if (!ctx.sourceText && !ctx.description) return null
  try {
    const res = await generateDescription(ctx, { targetWords: 50, style: 'sentence' })
    return res.success && res.descriptions.length > 0 ? res.descriptions[0] : null
  } catch { return null }
}

function computeScheduledAt(startDate: string | null, slotIndex: number, frequency: CampaignFrequency): string {
  const intervalMs = frequencyToMs(frequency)
  const now        = new Date()
  let base: Date
  if (startDate) {
    const s = new Date(startDate + 'T00:00:00')
    base = s > now ? s : now
  } else {
    base = now
  }
  return new Date(base.getTime() + slotIndex * intervalMs).toISOString()
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()

  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { campaignId?: string } = {}
  try { body = await request.json() } catch { /* empty */ }

  const { campaignId } = body
  if (!campaignId) {
    return NextResponse.json({ error: 'campaignId is required' }, { status: 400 })
  }

  // -------------------------------------------------------------------------
  // 1. Load campaign
  // -------------------------------------------------------------------------
  const { data: campaign, error: campErr } = await supabase
    .from('campaigns')
    .select('id, platforms, frequency_type, frequency_value, start_date, url_ids')
    .eq('id', campaignId)
    .eq('user_id', user.id)
    .single()

  if (campErr || !campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  const platforms: string[] = campaign.platforms ?? []
  const urlIds:    string[] = campaign.url_ids   ?? []

  if (platforms.length === 0) {
    return NextResponse.json({ error: 'Campaign has no platforms' }, { status: 400 })
  }

  // -------------------------------------------------------------------------
  // 2. Load all campaign URLs
  // -------------------------------------------------------------------------
  const { data: urlRows, error: urlErr } = await supabase
    .from('campaign_urls')
    .select('id, original_url, title')
    .eq('campaign_id', campaignId)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .eq('is_active', true)

  if (urlErr || !urlRows || urlRows.length === 0) {
    return NextResponse.json({ error: 'No active URLs found for this campaign' }, { status: 400 })
  }

  // -------------------------------------------------------------------------
  // 3. Load platform connections
  // -------------------------------------------------------------------------
  const { data: connections } = await supabase
    .from('platform_connections')
    .select('id, platform, status')
    .eq('user_id', user.id)
    .in('platform', platforms)
    .eq('status', 'connected')
    .is('deleted_at', null)

  const connectionMap: Record<string, string> = {}
  for (const c of connections ?? []) connectionMap[c.platform] = c.id

  // -------------------------------------------------------------------------
  // 4. Load settings
  // -------------------------------------------------------------------------
  const platformDefaults = await loadSettings<PlatformDefaults>(supabase, user.id, 'platform_defaults', {})

  const frequency: CampaignFrequency = {
    type:  (campaign.frequency_type  ?? 'daily') as CampaignFrequency['type'],
    value: (campaign.frequency_value ?? 1) as number,
  }

  // -------------------------------------------------------------------------
  // 5. Pre-load ALL existing scheduled_posts for this campaign
  //    (created by activateCampaign) keyed by url_id → platform → post_id
  // -------------------------------------------------------------------------
  const { data: allExisting } = await supabase
    .from('scheduled_posts')
    .select('id, url_id, platform, status')
    .eq('campaign_id', campaignId)
    .eq('user_id', user.id)
    .in('status', ['pending', 'failed'])
    .is('deleted_at', null)

  const existingMap: Record<string, Record<string, string>> = {}
  for (const p of allExisting ?? []) {
    if (!p.url_id) continue
    if (!existingMap[p.url_id]) existingMap[p.url_id] = {}
    if (!existingMap[p.url_id][p.platform]) {
      existingMap[p.url_id][p.platform] = p.id
    }
  }

  // -------------------------------------------------------------------------
  // 6. Process each URL: extract → generate → upsert scheduled_posts
  // -------------------------------------------------------------------------
  const details: Array<{ urlId: string; url: string; status: 'ok' | 'error'; error?: string; postsUpdated: number }> = []
  let urlsProcessed = 0
  let urlsFailed    = 0

  for (const urlRow of urlRows) {
    const urlId    = urlRow.id
    const slotIndex = urlIds.indexOf(urlId)
    const safeSlot  = slotIndex >= 0 ? slotIndex : urlRows.indexOf(urlRow)
    const scheduledAt = computeScheduledAt(campaign.start_date, safeSlot, frequency)

    // -----------------------------------------------------------------------
    // 6a. Extract content (if not already done)
    // -----------------------------------------------------------------------
    let extracted: {
      id: string; title: string | null; description: string | null; body: string | null;
      author: string | null; og_image_url: string | null; keywords: string[]; source_url: string | null; published_at: string | null;
    } | null = null

    const { data: existingExtracted } = await supabase
      .from('extracted_content')
      .select('id, title, description, body, author, og_image_url, keywords, source_url, published_at')
      .eq('url_id', urlId)
      .maybeSingle()

    if (existingExtracted) {
      extracted = existingExtracted
    } else {
      // Attempt fresh extraction
      try {
        const fetchResult = await fetchUrl(urlRow.original_url)
        if (fetchResult.ok && fetchResult.html) {
          const meta = extractMetadata(fetchResult.html, fetchResult.finalUrl ?? urlRow.original_url)

          const { data: newExtracted } = await supabase
            .from('extracted_content')
            .insert({
              user_id:      user.id,
              url_id:       urlId,
              source_url:   meta.canonicalUrl ?? urlRow.original_url,
              title:        meta.title        ?? urlRow.title ?? null,
              description:  meta.description  ?? null,
              body:         null,
              author:       meta.author       ?? null,
              published_at: meta.publishDate  ?? null,
              og_image_url: meta.featuredImage ?? null,
              keywords:     meta.keywords     ?? [],
              raw_html:     fetchResult.html.slice(0, 100_000),
              metadata:     { ogType: meta.ogType, locale: meta.locale },
            })
            .select('id, title, description, body, author, og_image_url, keywords, source_url, published_at')
            .single()

          if (newExtracted) {
            extracted = newExtracted
            // Update url title if better
            if (meta.title && meta.title !== urlRow.title) {
              await supabase.from('campaign_urls').update({ title: meta.title }).eq('id', urlId)
            }
          }
        }
      } catch (fetchErr) {
        console.warn(`[auto-generate] Extraction failed for ${urlRow.original_url}:`, fetchErr)
        // Continue with URL title as fallback
      }
    }

    const ogImage   = extracted?.og_image_url ?? null
    const sourceUrl = extracted?.source_url ?? urlRow.original_url

    const baseCtx: ContentContext = {
      sourceText:  extracted?.body ?? extracted?.description ?? extracted?.title ?? urlRow.original_url,
      title:       extracted?.title ?? urlRow.title ?? undefined,
      description: extracted?.description ?? undefined,
      author:      extracted?.author ?? undefined,
      sourceUrl:   sourceUrl ?? undefined,
      keywords:    extracted?.keywords ?? undefined,
      publishDate: extracted?.published_at ? new Date(extracted.published_at) : undefined,
      extractedContentId: extracted?.id,
      campaignId,
    }

    // -----------------------------------------------------------------------
    // 6b. AI-rewrite title + description (once per URL)
    // -----------------------------------------------------------------------
    let rewrittenTitle       = baseCtx.title       ?? null
    let rewrittenDescription = baseCtx.description ?? null

    if (process.env.GEMINI_API_KEY && baseCtx.sourceText) {
      const [t, d] = await Promise.allSettled([
        rewriteTitle(baseCtx),
        rewriteDescription(baseCtx),
      ])
      if (t.status === 'fulfilled' && t.value) rewrittenTitle = t.value
      if (d.status === 'fulfilled' && d.value) rewrittenDescription = d.value
    }

    const enrichedCtx: ContentContext = {
      ...baseCtx,
      title:       rewrittenTitle       ?? baseCtx.title,
      description: rewrittenDescription ?? baseCtx.description,
    }

    // -----------------------------------------------------------------------
    // 6c. Generate per-platform + upsert scheduled_posts
    // -----------------------------------------------------------------------
    let postsUpdated = 0
    let hadError     = false
    let lastError    = ''

    for (const platform of platforms) {
      const connectionId = connectionMap[platform] ?? null
      const limits       = PLATFORM_LIMITS[platform as SocialPlatform]
      const pSettings: PlatformDefaultSettings = {
        ...DEFAULT_PLATFORM_SETTING,
        ...(platformDefaults[platform] ?? {}),
        tone:         (platformDefaults[platform]?.tone ?? limits?.toneDefault ?? 'professional') as ContentTone,
        includeEmoji: platformDefaults[platform]?.includeEmoji ?? (limits?.emojiStyle !== 'none'),
      }

      let content  = ''
      let hashtags: string[] = []

      const isPublishingPlatform = ['devto', 'hashnode', 'medium', 'substack'].includes(platform)
      const charLimit = limits?.charLimit ?? 500

      if (process.env.GEMINI_API_KEY) {
        try {
          const result = await generateSocialPost(enrichedCtx, {
            platform:        platform as SocialPlatform,
            tone:            pSettings.tone as ContentTone,
            includeHashtags: true,
            includeEmoji:    pSettings.includeEmoji,
            cta:             pSettings.cta || undefined,
            // Publishing platforms need a full article body — use higher token budget
            maxOutputTokens: isPublishingPlatform ? 2048 : 512,
          })
          if (result.success && result.posts.length > 0) {
            content  = result.posts[0].content
            hashtags = result.posts[0].hashtags
          }
        } catch (e) {
          console.error(`[auto-generate] AI failed for ${platform}:`, e)
        }
      }

      // Per-platform hashtag limit — declare before the fallback so it's in scope
      const maxHashtags = pSettings.maxHashtags > 0 ? pSettings.maxHashtags : (limits?.hashtagCount ?? 5)

      if (!content) {
        content = buildFallbackContent({ platform, ctx: enrichedCtx, sourceUrl, charLimit })
        if (hashtags.length === 0) {
          hashtags = buildFallbackHashtags(enrichedCtx, sourceUrl, maxHashtags)
        }
      }

      // Merge custom hashtags from platform settings
      if (pSettings.hashtags) {
        const custom = pSettings.hashtags
          .split(/[\s,]+/).map((t) => t.trim()).filter(Boolean)
          .map((t) => (t.startsWith('#') ? t : `#${t}`))
        hashtags = [...new Set([...hashtags, ...custom])]
      }
      if (hashtags.length > maxHashtags) hashtags = hashtags.slice(0, maxHashtags)

      // -----------------------------------------------------------------------
      // Assemble complete post body
      //
      // Publishing platforms (devto, hashnode, medium, substack):
      //   Adapter handles title + tags separately; assemble body as:
      //   description → AI body → source URL footer → tags (plain, last line)
      //
      // Social platforms:
      //   title → body → CTA → source URL → hashtags
      //
      // Short platforms (twitter, bluesky, pocket, instapaper):
      //   body → URL → hashtags  (skip title to preserve char budget)
      // -----------------------------------------------------------------------
      const SHORT_PLATFORMS = new Set(['twitter', 'bluesky', 'pocket', 'instapaper'])

      if (isPublishingPlatform) {
        // Publishing adapters (devto, hashnode, medium, substack) receive:
        //   - title  → input.title  (separate field, not in body)
        //   - tags   → input.tags   (adapter adds these to article tags + body footnote)
        //   - url    → input.url    (adapter adds canonical_url + "Originally published at" footer)
        // So the body should contain ONLY: description intro + AI article body.
        const bodyParts: string[] = []

        // 1. Description as opening paragraph (only if meaningfully different from AI body)
        if (rewrittenDescription && !content.includes(rewrittenDescription.slice(0, 40))) {
          bodyParts.push(rewrittenDescription)
        }

        // 2. Main AI-generated article body
        if (content) bodyParts.push(content)

        content = bodyParts.filter(Boolean).join('\n\n')
      } else {
        const bodyParts: string[] = []

        // 1. AI title as opening hook (skip for short platforms)
        if (!SHORT_PLATFORMS.has(platform) && rewrittenTitle &&
            !content.trimStart().startsWith(rewrittenTitle.slice(0, 30))) {
          bodyParts.push(rewrittenTitle)
        }

        // 2. Main AI-generated body
        if (content) bodyParts.push(content)

        // 3. CTA from platform settings (if not already in body)
        if (pSettings.cta && !content.includes(pSettings.cta)) {
          bodyParts.push(pSettings.cta)
        }

        // 4. Source URL
        if (sourceUrl && !content.includes(sourceUrl)) {
          bodyParts.push(sourceUrl)
        }

        // 5. Hashtags as trailing text (only if not already embedded in body)
        if (hashtags.length > 0) {
          const firstTag = hashtags[0].startsWith('#') ? hashtags[0] : `#${hashtags[0]}`
          if (!content.includes(firstTag)) {
            const hashStr = hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')
            bodyParts.push(hashStr)
          }
        }

        content = bodyParts.filter(Boolean).join('\n\n')

        // Trim to platform character limit
        if (charLimit > 0 && content.length > charLimit) {
          content = content.slice(0, charLimit)
        }
      }

      const postMetadata = {
        hashtags,
        source_url:      sourceUrl,
        og_image:        ogImage,
        title:           rewrittenTitle,
        description:     rewrittenDescription,
        char_limit:      charLimit,
        content_pending: false,
        generated_at:    new Date().toISOString(),
      }

      const existingPostId = existingMap[urlId]?.[platform]

      if (existingPostId) {
        const { error: updateErr } = await supabase
          .from('scheduled_posts')
          .update({
            content,
            status:   'pending',
            metadata: postMetadata,
            ...(connectionId ? { connection_id: connectionId } : {}),
          })
          .eq('id', existingPostId)

        if (updateErr) {
          hadError  = true
          lastError = updateErr.message
        } else {
          postsUpdated++
        }
      } else {
        const insertPayload: Record<string, unknown> = {
          user_id:      user.id,
          campaign_id:  campaignId,
          url_id:       urlId,
          platform,
          content,
          scheduled_at: scheduledAt,
          status:       'pending',
          metadata:     postMetadata,
        }
        if (connectionId) insertPayload.connection_id = connectionId

        const { error: insertErr } = await supabase
          .from('scheduled_posts')
          .insert(insertPayload)

        if (insertErr) {
          hadError  = true
          lastError = insertErr.message
        } else {
          postsUpdated++
        }
      }
    }

    if (hadError && postsUpdated === 0) {
      urlsFailed++
      details.push({ urlId, url: urlRow.original_url, status: 'error', error: lastError, postsUpdated })
    } else {
      urlsProcessed++
      details.push({ urlId, url: urlRow.original_url, status: 'ok', postsUpdated })
    }
  }

  return NextResponse.json({
    success:       urlsFailed === 0,
    urlsProcessed,
    urlsFailed,
    details,
  })
}
