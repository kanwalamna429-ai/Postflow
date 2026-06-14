// =============================================================================
// POST /api/generate
//
// Generates AI content for a URL across all campaign platforms, then saves
// generated_content + upserts scheduled_posts rows.
//
// Body: { urlId, campaignId, editedContent? }
//
// Scheduling model (mirrors scheduler.ts):
//   URL at slot index i → scheduled_at = baseTime + i × frequencyInterval
//   Where baseTime = max(campaign.start_date, NOW)
//
// UPSERT behaviour:
//   If a pending/failed scheduled_post already exists for (campaign_id, url_id, platform)
//   — e.g. created by activateCampaign — we UPDATE it with the real AI content
//   rather than inserting a duplicate row. This prevents "Scheduled post not found"
//   caused by the UI holding an ID that was never properly created.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateSocialPost } from '@/lib/services/ai/social-post'
import { generateDescription } from '@/lib/services/ai/description'
import { generate } from '@/lib/services/ai/client'
import { PLATFORM_LIMITS } from '@/lib/services/ai/prompts'
import { frequencyToMs } from '@/lib/services/campaigns/frequency'
import { loadSettings } from '@/lib/services/settings'
import type {
  ContentContext,
  SocialPlatform,
  ContentTone,
} from '@/lib/services/ai/types'
import type { PlatformDefaults, PlatformDefaultSettings } from '@/lib/services/settings'
import type { CampaignFrequency } from '@/lib/services/campaigns/types'

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_PLATFORM_SETTING: PlatformDefaultSettings = {
  tone:         'professional',
  style:        'concise',
  hashtags:     '',
  cta:          '',
  includeEmoji: true,
  autoApprove:  false,
  maxHashtags:  0,
}

interface GenerateBody {
  urlId:          string
  campaignId:     string
  editedContent?: Record<string, string>
}

// ---------------------------------------------------------------------------
// AI helpers — run once per URL, shared across platforms
// ---------------------------------------------------------------------------

async function rewriteTitle(ctx: ContentContext): Promise<string | null> {
  if (!ctx.title && !ctx.sourceText) return null
  try {
    const snippet = (ctx.sourceText ?? ctx.title ?? '').slice(0, 600)
    const titleLine = ctx.title ? `Original title: "${ctx.title}"\n` : ''
    const prompt = [
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
      .replace(/^```[\w]*\s*/m, '').replace(/\s*```$/m, '') // strip code fences
      .replace(/^["'`]|["'`]$/g, '')                         // strip surrounding quotes
      .split('\n')[0]                                         // first line only
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

// ---------------------------------------------------------------------------
// Compute scheduled_at for a URL at a given slot index
// ---------------------------------------------------------------------------

function computeScheduledAt(
  campaignStartDate: string | null,
  slotIndex:         number,
  frequency:         CampaignFrequency
): string {
  const intervalMs = frequencyToMs(frequency)
  const now        = new Date()

  let base: Date
  if (campaignStartDate) {
    const start = new Date(campaignStartDate + 'T00:00:00')
    base = start > now ? start : now
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

  let body: GenerateBody
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }

  const { urlId, campaignId, editedContent = {} } = body
  if (!urlId || !campaignId) {
    return NextResponse.json({ error: 'urlId and campaignId are required' }, { status: 400 })
  }

  // -------------------------------------------------------------------------
  // 1. Load campaign (platforms, schedule, url_ids)
  // -------------------------------------------------------------------------
  const { data: campaign, error: campErr } = await supabase
    .from('campaigns')
    .select('id, platforms, frequency_type, frequency_value, start_date, timezone, url_ids')
    .eq('id', campaignId)
    .single()

  if (campErr || !campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  const platforms: string[]    = campaign.platforms ?? []
  const urlIds:    string[]    = campaign.url_ids   ?? []

  if (platforms.length === 0) {
    return NextResponse.json({ error: 'Campaign has no platforms configured' }, { status: 400 })
  }

  // URL slot index (determines scheduled_at offset)
  const slotIndex = urlIds.indexOf(urlId)
  const safeSlot  = slotIndex >= 0 ? slotIndex : 0

  const frequency: CampaignFrequency = {
    type:  (campaign.frequency_type  ?? 'daily') as CampaignFrequency['type'],
    value: (campaign.frequency_value ?? 1) as number,
  }

  const scheduledAt = computeScheduledAt(campaign.start_date, safeSlot, frequency)

  // -------------------------------------------------------------------------
  // 2. Load platform connections for campaign platforms
  // -------------------------------------------------------------------------
  const { data: connections } = await supabase
    .from('platform_connections')
    .select('id, platform, status')
    .eq('user_id', user.id)
    .in('platform', platforms)
    .eq('status', 'connected')
    .is('deleted_at', null)

  const connectionMap: Record<string, string> = {}
  for (const conn of connections ?? []) {
    connectionMap[conn.platform] = conn.id
  }

  // -------------------------------------------------------------------------
  // 3. Load extracted content for this URL
  // -------------------------------------------------------------------------
  const { data: extracted } = await supabase
    .from('extracted_content')
    .select('id, title, description, body, author, og_image_url, keywords, source_url, published_at')
    .eq('url_id', urlId)
    .maybeSingle()

  const { data: urlRow } = await supabase
    .from('campaign_urls')
    .select('original_url, title')
    .eq('id', urlId)
    .maybeSingle()

  const ogImage   = extracted?.og_image_url ?? null
  const sourceUrl = extracted?.source_url ?? urlRow?.original_url ?? null

  const baseCtx: ContentContext = {
    sourceText:  extracted?.body ?? extracted?.description ?? extracted?.title ?? urlRow?.original_url ?? '',
    title:       extracted?.title ?? urlRow?.title ?? undefined,
    description: extracted?.description ?? undefined,
    author:      extracted?.author ?? undefined,
    sourceUrl:   sourceUrl ?? undefined,
    keywords:    extracted?.keywords ?? undefined,
    publishDate: extracted?.published_at ? new Date(extracted.published_at) : undefined,
    extractedContentId: extracted?.id,
    campaignId,
  }

  // -------------------------------------------------------------------------
  // 4. Load user's platform AI settings
  // -------------------------------------------------------------------------
  const platformDefaults = await loadSettings<PlatformDefaults>(
    supabase, user.id, 'platform_defaults', {}
  )

  // -------------------------------------------------------------------------
  // 5. AI-rewrite title + description (once, shared across all platforms)
  // -------------------------------------------------------------------------
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

  // -------------------------------------------------------------------------
  // 6. Pre-load existing scheduled_posts for this url+campaign
  //    (created by activateCampaign with content_pending: true)
  //    We will UPDATE these rather than INSERT duplicates.
  // -------------------------------------------------------------------------
  const { data: existingPosts } = await supabase
    .from('scheduled_posts')
    .select('id, platform, status')
    .eq('campaign_id', campaignId)
    .eq('url_id', urlId)
    .eq('user_id', user.id)
    .in('status', ['pending', 'failed'])
    .is('deleted_at', null)
    .order('created_at', { ascending: true })

  // Build a map: platform → first existing scheduled_post id
  const existingPostMap: Record<string, string> = {}
  for (const p of existingPosts ?? []) {
    if (!existingPostMap[p.platform]) {
      existingPostMap[p.platform] = p.id
    }
  }

  // -------------------------------------------------------------------------
  // 7. Generate per-platform posts
  // -------------------------------------------------------------------------
  const results: Array<{
    platform:           string
    content:            string
    hashtags:           string[]
    charLimit:          number
    scheduledAt:        string
    generatedContentId: string
    scheduledPostId:    string
    connectionId:       string | null
    error?:             string
  }> = []

  for (const platform of platforms) {
    const connectionId = connectionMap[platform] ?? null
    const limits       = PLATFORM_LIMITS[platform as SocialPlatform]
    const charLimit    = limits?.charLimit ?? 500

    const pSettings: PlatformDefaultSettings = {
      ...DEFAULT_PLATFORM_SETTING,
      ...(platformDefaults[platform] ?? {}),
      tone:         (platformDefaults[platform]?.tone ?? limits?.toneDefault ?? 'professional') as ContentTone,
      includeEmoji: platformDefaults[platform]?.includeEmoji ?? (limits?.emojiStyle !== 'none'),
    }

    let content  = ''
    let hashtags: string[] = []

    if (editedContent[platform]) {
      content = editedContent[platform]
    } else if (process.env.GEMINI_API_KEY) {
      try {
        const result = await generateSocialPost(enrichedCtx, {
          platform:        platform as SocialPlatform,
          tone:            pSettings.tone as ContentTone,
          includeHashtags: true,
          includeEmoji:    pSettings.includeEmoji,
          cta:             pSettings.cta || undefined,
        })
        if (result.success && result.posts.length > 0) {
          content  = result.posts[0].content
          hashtags = result.posts[0].hashtags
        }
      } catch (err) {
        console.error(`[generate] AI failed for ${platform}:`, err instanceof Error ? err.message : err)
        content = enrichedCtx.title ?? sourceUrl ?? `[Content for ${platform}]`
      }
    } else {
      content = enrichedCtx.title ?? sourceUrl ?? `[Content for ${platform}]`
    }

    if (!content) content = enrichedCtx.title ?? sourceUrl ?? `[Content for ${platform}]`

    // Append source URL to the post body for social/short-form platforms.
    // Publishing platforms (devto, hashnode) already append it in their own adapter body builders.
    const PUBLISHING_PLATFORMS = new Set(['devto', 'hashnode', 'medium', 'substack'])
    if (sourceUrl && content && !PUBLISHING_PLATFORMS.has(platform) && !content.includes(sourceUrl)) {
      const suffix = `\n${sourceUrl}`
      if (content.length + suffix.length <= charLimit) {
        content += suffix
      }
    }

    if (pSettings.hashtags) {
      const custom = pSettings.hashtags
        .split(/[\s,]+/).map((t) => t.trim()).filter(Boolean)
        .map((t) => (t.startsWith('#') ? t : `#${t}`))
      hashtags = [...new Set([...hashtags, ...custom])]
    }

    // Respect per-platform maxHashtags setting (0 = use platform default)
    const maxHashtags = pSettings.maxHashtags > 0
      ? pSettings.maxHashtags
      : (limits?.hashtagCount ?? 5)
    if (hashtags.length > maxHashtags) {
      hashtags = hashtags.slice(0, maxHashtags)
    }

    // -------------------------------------------------------------------
    // Save generated_content (best-effort — not all schemas have this table)
    // -------------------------------------------------------------------
    let generatedContentId = ''
    try {
      const { data: genRow } = await supabase
        .from('generated_content')
        .insert({
          user_id:              user.id,
          campaign_id:          campaignId,
          extracted_content_id: extracted?.id ?? null,
          platform,
          content,
          content_type: 'post',
          hashtags,
          is_approved:  pSettings.autoApprove,
          approved_at:  pSettings.autoApprove ? new Date().toISOString() : null,
          metadata: {
            url_id:                urlId,
            source_url:            sourceUrl,
            og_image:              ogImage,
            rewritten_title:       rewrittenTitle,
            rewritten_description: rewrittenDescription,
            char_limit:            charLimit,
            tone:                  pSettings.tone,
            style:                 pSettings.style,
            scheduled_at:          scheduledAt,
          },
        })
        .select('id')
        .single()
      if (genRow?.id) generatedContentId = genRow.id
    } catch {
      // generated_content table may not exist in all deployments; continue anyway
    }

    // -------------------------------------------------------------------
    // UPSERT scheduled_post:
    //   - If an existing pending/failed row exists for this platform → UPDATE it
    //   - Otherwise → INSERT a new row
    // -------------------------------------------------------------------
    const existingPostId = existingPostMap[platform]
    const postMetadata = {
      hashtags,
      source_url:            sourceUrl,
      og_image:              ogImage,
      title:                 rewrittenTitle,
      description:           rewrittenDescription,
      char_limit:            charLimit,
      content_pending:       false,
      generated_at:          new Date().toISOString(),
    }

    if (existingPostId) {
      // UPDATE the row that activateCampaign created
      const { error: updateErr } = await supabase
        .from('scheduled_posts')
        .update({
          content,
          status:   'pending',
          metadata: postMetadata,
          ...(generatedContentId ? { generated_content_id: generatedContentId } : {}),
          ...(connectionId ? { connection_id: connectionId } : {}),
        })
        .eq('id', existingPostId)

      if (updateErr) {
        results.push({ platform, content, hashtags, charLimit, scheduledAt,
          generatedContentId, scheduledPostId: '', connectionId,
          error: `Failed to update scheduled post: ${updateErr.message}` })
        continue
      }

      results.push({
        platform, content, hashtags, charLimit, scheduledAt,
        generatedContentId,
        scheduledPostId: existingPostId,
        connectionId,
      })
    } else {
      // INSERT a new row (no activation rows exist yet)
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
      if (connectionId)      insertPayload.connection_id        = connectionId
      if (generatedContentId) insertPayload.generated_content_id = generatedContentId

      const { data: postRow, error: postErr } = await supabase
        .from('scheduled_posts')
        .insert(insertPayload)
        .select('id')
        .single()

      if (postErr || !postRow) {
        results.push({ platform, content, hashtags, charLimit, scheduledAt,
          generatedContentId, scheduledPostId: '', connectionId,
          error: postErr?.message ?? 'Failed to create scheduled post' })
        continue
      }

      results.push({
        platform, content, hashtags, charLimit, scheduledAt,
        generatedContentId,
        scheduledPostId: postRow.id,
        connectionId,
      })
    }
  }

  return NextResponse.json({
    success:              true,
    rewrittenTitle,
    rewrittenDescription,
    ogImage,
    sourceUrl,
    scheduledAt,
    posts: results,
  })
}
