// =============================================================================
// Schedule Service — Campaign Activation & Scheduled Post Management
//
// Core contract (from spec):
//   "When a campaign becomes Active: Generate ALL future scheduled_posts
//    records immediately. Never generate schedules at runtime."
//
// All publish timestamps are stored upfront in scheduled_posts.scheduled_at.
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  CampaignFrequency,
  ScheduledPostRow,
  ScheduledPostStatus,
  ActivationResult,
} from './types'
import { fetchCampaignById, updateCampaignStatus } from './campaign-service'
import { generateSchedule, chunkSlots } from './scheduler'

// ---------------------------------------------------------------------------
// Activate campaign — the critical path
// ---------------------------------------------------------------------------

/**
 * Activate a campaign by:
 * 1. Fetching the campaign record
 * 2. Fetching all active URLs linked to this campaign
 * 3. Generating ALL scheduled_posts rows upfront (one per URL per platform)
 * 4. Bulk-inserting into scheduled_posts in batches of 500
 * 5. Updating campaign status → 'active'
 * 6. Writing an activation event to system_logs
 *
 * @throws If campaign not found, missing frequency/start_date, no URLs, or no platforms.
 */
export async function activateCampaign(
  supabase: SupabaseClient,
  campaignId: string,
  userId: string
): Promise<ActivationResult> {
  // -- 1. Fetch campaign --------------------------------------------------
  const campaign = await fetchCampaignById(supabase, campaignId)
  if (!campaign) {
    throw new Error(`Campaign not found: ${campaignId}`)
  }
  if (!campaign.frequencyType) {
    throw new Error('Campaign is missing frequency configuration')
  }
  if (!campaign.startDate) {
    throw new Error('Campaign is missing a start date')
  }
  if (campaign.platforms.length === 0) {
    throw new Error('Campaign has no platforms configured')
  }
  if (campaign.status !== 'draft' && campaign.status !== 'paused') {
    throw new Error(`Cannot activate a campaign in status: ${campaign.status}`)
  }

  // -- 2. Fetch URLs for this campaign ------------------------------------
  const { data: urlRows, error: urlError } = await supabase
    .from('campaign_urls')
    .select('id, original_url, title')
    .eq('campaign_id', campaignId)
    .is('deleted_at', null)
    .eq('is_active', true)
    .order('created_at', { ascending: true })

  if (urlError) throw new Error(`Failed to fetch campaign URLs: ${urlError.message}`)
  if (!urlRows || urlRows.length === 0) {
    throw new Error('Campaign has no active URLs — add URLs before activating')
  }

  // -- 3. Generate schedule ----------------------------------------------
  const frequency: CampaignFrequency = {
    type:  campaign.frequencyType,
    value: campaign.frequencyValue,
  }

  // Parse startDate in the campaign's timezone.
  // We store the UTC equivalent by treating startDate as midnight in the tz.
  const startDate = parseDateInTimezone(campaign.startDate, campaign.timezone)

  const urlIds  = urlRows.map((u) => u.id)
  const urlMap  = new Map(urlRows.map((u) => [u.id, u as { id: string; original_url: string; title: string | null }]))

  const { slots, summary } = generateSchedule(
    urlIds,
    campaign.platforms,
    startDate,
    frequency
  )

  // -- 4. Bulk insert scheduled_posts ------------------------------------
  // Use a placeholder content string; AI generation will populate it later.
  const chunks = chunkSlots(slots, 500)

  for (const chunk of chunks) {
    const rows = chunk.map((slot) => {
      const url = urlMap.get(slot.urlId)
      return {
        user_id:        userId,
        campaign_id:    campaignId,
        url_id:         slot.urlId,
        platform:       slot.platform,
        content:        url?.original_url ?? '[Content pending AI generation]',
        scheduled_at:   slot.scheduledAt.toISOString(),
        status:         'pending',
        sequence_index: slot.sequenceIndex,
        metadata: {
          source_title:    url?.title ?? null,
          content_pending: true,
        },
      }
    })

    const { error: insertError } = await supabase
      .from('scheduled_posts')
      .insert(rows)

    if (insertError) {
      throw new Error(`Failed to insert scheduled posts batch: ${insertError.message}`)
    }
  }

  // -- 5. Update campaign status -----------------------------------------
  await updateCampaignStatus(supabase, campaignId, 'active')

  // -- 6. Write activation log ------------------------------------------
  await supabase.from('system_logs').insert({
    user_id:    userId,
    campaign_id: campaignId,
    level:      'info',
    event_type: 'campaign_activated',
    message:    `Campaign activated: ${summary.totalSlots} posts scheduled across ${summary.platformCount} platforms`,
    details:    {
      total_slots:      summary.totalSlots,
      url_count:        summary.urlCount,
      platform_count:   summary.platformCount,
      frequency_type:   campaign.frequencyType,
      frequency_value:  campaign.frequencyValue,
      first_publish_at: summary.firstPublishAt.toISOString(),
      last_publish_at:  summary.lastPublishAt.toISOString(),
      duration_days:    summary.durationDays,
    },
  })

  return {
    campaignId,
    totalSlots:    summary.totalSlots,
    urlCount:      summary.urlCount,
    platformCount: summary.platformCount,
    firstPublishAt: summary.firstPublishAt,
    lastPublishAt:  summary.lastPublishAt,
  }
}

// ---------------------------------------------------------------------------
// Pause campaign
// ---------------------------------------------------------------------------

/**
 * Pause an active campaign.
 * Cancels all pending scheduled_posts and sets campaign status → 'paused'.
 * Published posts are preserved.
 */
export async function pauseCampaign(
  supabase: SupabaseClient,
  campaignId: string
): Promise<{ cancelledPosts: number }> {
  const { data, error } = await supabase
    .from('scheduled_posts')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('campaign_id', campaignId)
    .eq('status', 'pending')
    .is('deleted_at', null)
    .select('id')

  if (error) throw new Error(`pauseCampaign: ${error.message}`)

  await updateCampaignStatus(supabase, campaignId, 'paused')

  return { cancelledPosts: data?.length ?? 0 }
}

// ---------------------------------------------------------------------------
// Complete / Archive campaign
// ---------------------------------------------------------------------------

/** Mark a campaign as completed. Cancels any remaining pending posts. */
export async function completeCampaign(
  supabase: SupabaseClient,
  campaignId: string
): Promise<void> {
  // Cancel remaining pending posts
  await supabase
    .from('scheduled_posts')
    .update({ status: 'cancelled' })
    .eq('campaign_id', campaignId)
    .eq('status', 'pending')

  await updateCampaignStatus(supabase, campaignId, 'completed')
}

/** Archive a completed or paused campaign. */
export async function archiveCampaign(
  supabase: SupabaseClient,
  campaignId: string
): Promise<void> {
  await updateCampaignStatus(supabase, campaignId, 'archived')
}

// ---------------------------------------------------------------------------
// Read scheduled posts
// ---------------------------------------------------------------------------

export interface FetchScheduleOptions {
  status?: ScheduledPostStatus
  platform?: string
  limit?: number
  offset?: number
}

/**
 * Fetch scheduled posts for a campaign, ordered by scheduled_at ASC.
 * Useful for displaying the campaign timeline.
 */
export async function fetchCampaignSchedule(
  supabase: SupabaseClient,
  campaignId: string,
  opts: FetchScheduleOptions = {}
): Promise<ScheduledPostRow[]> {
  let query = supabase
    .from('scheduled_posts')
    .select('*')
    .eq('campaign_id', campaignId)
    .is('deleted_at', null)
    .order('scheduled_at', { ascending: true })

  if (opts.status)   query = query.eq('status', opts.status)
  if (opts.platform) query = query.eq('platform', opts.platform)
  if (opts.limit)    query = query.limit(opts.limit)
  if (opts.offset !== undefined && opts.limit) {
    query = query.range(opts.offset, opts.offset + opts.limit - 1)
  }

  const { data, error } = await query
  if (error) throw new Error(`fetchCampaignSchedule: ${error.message}`)
  return (data ?? []).map(mapScheduledPostRow)
}

/** Count scheduled posts for a campaign grouped by status. */
export async function countCampaignSchedule(
  supabase: SupabaseClient,
  campaignId: string
): Promise<Record<ScheduledPostStatus, number>> {
  const { data, error } = await supabase
    .from('scheduled_posts')
    .select('status')
    .eq('campaign_id', campaignId)
    .is('deleted_at', null)

  if (error) throw new Error(`countCampaignSchedule: ${error.message}`)

  const counts: Record<string, number> = {
    pending: 0, processing: 0, published: 0, failed: 0, cancelled: 0,
  }
  for (const row of data ?? []) {
    counts[row.status as string] = (counts[row.status as string] ?? 0) + 1
  }
  return counts as Record<ScheduledPostStatus, number>
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a 'YYYY-MM-DD' date string as midnight in the given IANA timezone.
 * Falls back to UTC midnight if the Intl API cannot resolve the offset.
 */
function parseDateInTimezone(dateStr: string, timezone: string): Date {
  try {
    // Use Intl.DateTimeFormat to find the UTC offset for midnight in the tz
    const [year, month, day] = dateStr.split('-').map(Number)
    const candidate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0))

    // Get local midnight in the target timezone as a UTC timestamp
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    })

    // Check if the UTC candidate is already at midnight in the target timezone
    const parts = Object.fromEntries(
      formatter.formatToParts(candidate).map((p) => [p.type, p.value])
    )
    const tzMidnight = new Date(
      `${parts.year}-${parts.month}-${parts.day}T00:00:00`
    )
    const diffMs = candidate.getTime() - tzMidnight.getTime()
    return new Date(candidate.getTime() + diffMs)
  } catch {
    // Fallback: treat as UTC midnight
    return new Date(`${dateStr}T00:00:00Z`)
  }
}

/** Map a raw Supabase scheduled_post row to a typed ScheduledPostRow. */
function mapScheduledPostRow(raw: Record<string, unknown>): ScheduledPostRow {
  return {
    id:             String(raw.id),
    userId:         String(raw.user_id),
    campaignId:     String(raw.campaign_id),
    urlId:          raw.url_id        != null ? String(raw.url_id)        : null,
    platform:       String(raw.platform),
    content:        String(raw.content),
    scheduledAt:    String(raw.scheduled_at),
    status:         String(raw.status) as ScheduledPostStatus,
    sequenceIndex:  raw.sequence_index != null ? Number(raw.sequence_index) : null,
    retryCount:     Number(raw.retry_count  ?? 0),
    maxRetries:     Number(raw.max_retries  ?? 3),
    errorMessage:   raw.error_message  != null ? String(raw.error_message)  : null,
    errorCode:      raw.error_code     != null ? String(raw.error_code)     : null,
    lockedAt:       raw.locked_at      != null ? String(raw.locked_at)      : null,
    lockedBy:       raw.locked_by      != null ? String(raw.locked_by)      : null,
    nextRetryAt:    raw.next_retry_at  != null ? String(raw.next_retry_at)  : null,
    publishedAt:    raw.published_at   != null ? String(raw.published_at)   : null,
    metadata:       (raw.metadata as Record<string, unknown>) ?? {},
    createdAt:      String(raw.created_at),
  }
}

// ---------------------------------------------------------------------------
// Publishing engine helpers (used by publisher.ts and /api/process-posts)
// ---------------------------------------------------------------------------

export interface FetchDuePostsOptions {
  /** Maximum number of posts to return (default: 50) */
  limit?: number
  /** Only return posts for specific platforms */
  platforms?: string[]
}

/**
 * Fetch scheduled posts that are due for processing.
 * Includes:
 *   - status = 'pending'
 *   - scheduled_at <= now()
 *   - next_retry_at IS NULL OR next_retry_at <= now()
 *   - deleted_at IS NULL
 *
 * Used by the publishing engine to find work to do.
 */
export async function fetchDueScheduledPosts(
  supabase: SupabaseClient,
  opts: FetchDuePostsOptions = {}
): Promise<ScheduledPostRow[]> {
  const now   = new Date().toISOString()
  const limit = opts.limit ?? 50

  let query = supabase
    .from('scheduled_posts')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_at', now)
    .is('deleted_at', null)
    .order('scheduled_at', { ascending: true })
    .limit(limit)

  if (opts.platforms && opts.platforms.length > 0) {
    query = query.in('platform', opts.platforms)
  }

  const { data, error } = await query
  if (error) throw new Error(`fetchDueScheduledPosts: ${error.message}`)

  // Filter in-memory: next_retry_at IS NULL OR next_retry_at <= now
  const rows = (data ?? []).map(mapScheduledPostRow)
  return rows.filter(
    (r) => r.nextRetryAt == null || new Date(r.nextRetryAt) <= new Date()
  )
}

/**
 * Fetch a single scheduled post by ID.
 */
export async function fetchScheduledPostById(
  supabase: SupabaseClient,
  id: string
): Promise<ScheduledPostRow | null> {
  const { data, error } = await supabase
    .from('scheduled_posts')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (error || !data) return null
  return mapScheduledPostRow(data)
}

/**
 * Count scheduled posts grouped by status for a user.
 * Useful for the dashboard overview.
 */
export async function countScheduledPostsByStatus(
  supabase: SupabaseClient,
  userId: string
): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('scheduled_posts')
    .select('status')
    .eq('user_id', userId)
    .is('deleted_at', null)

  if (error) throw new Error(`countScheduledPostsByStatus: ${error.message}`)

  const counts: Record<string, number> = {}
  for (const row of data ?? []) {
    counts[row.status] = (counts[row.status] ?? 0) + 1
  }
  return counts
}
