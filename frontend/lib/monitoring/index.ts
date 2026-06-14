// =============================================================================
// Monitoring Utilities — Phase 8
// Lightweight event tracking that writes to system_logs via Supabase.
// No external services — Supabase only.
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

export type MonitoringEventType =
  | 'platform_connection_added'
  | 'platform_connection_removed'
  | 'platform_connection_tested'
  | 'campaign_created'
  | 'campaign_activated'
  | 'campaign_paused'
  | 'campaign_completed'
  | 'campaign_archived'
  | 'url_imported'
  | 'url_deleted'
  | 'publishing_engine_run'
  | 'publish_attempt'
  | 'publish_success'
  | 'publish_failure'
  | 'publish_retry_scheduled'
  | 'stale_lock_released'
  | 'content_generated'
  | 'settings_changed'
  | 'user_signed_in'
  | 'user_signed_out'
  | 'rate_limit_hit'
  | 'health_check'
  | 'env_validation_failed'

export type MonitoringLevel = 'info' | 'warn' | 'error' | 'success'

export interface MonitoringEvent {
  userId?: string | null
  campaignId?: string
  scheduledPostId?: string
  platform?: string
  level: MonitoringLevel
  eventType: MonitoringEventType
  message: string
  details?: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Track an event (fire-and-forget — never throws)
// ---------------------------------------------------------------------------

export async function trackEvent(
  supabase: SupabaseClient,
  event: MonitoringEvent
): Promise<void> {
  try {
    await supabase.from('system_logs').insert({
      user_id:           event.userId ?? null,
      campaign_id:       event.campaignId ?? null,
      scheduled_post_id: event.scheduledPostId ?? null,
      platform:          event.platform ?? null,
      level:             event.level,
      event_type:        event.eventType,
      message:           event.message,
      details:           event.details ?? {},
    })
  } catch {
    // Monitoring must never crash the main application
  }
}

// ---------------------------------------------------------------------------
// Convenience wrappers
// ---------------------------------------------------------------------------

export const monitoring = {
  /** Platform connection events */
  connectionAdded: (supabase: SupabaseClient, userId: string, platform: string) =>
    trackEvent(supabase, {
      userId,
      platform,
      level: 'info',
      eventType: 'platform_connection_added',
      message: `Platform connection added: ${platform}`,
    }),

  connectionRemoved: (supabase: SupabaseClient, userId: string, platform: string) =>
    trackEvent(supabase, {
      userId,
      platform,
      level: 'info',
      eventType: 'platform_connection_removed',
      message: `Platform connection removed: ${platform}`,
    }),

  /** Campaign lifecycle */
  campaignCreated: (supabase: SupabaseClient, userId: string, campaignId: string, name: string) =>
    trackEvent(supabase, {
      userId,
      campaignId,
      level: 'info',
      eventType: 'campaign_created',
      message: `Campaign created: ${name}`,
      details: { name },
    }),

  campaignActivated: (supabase: SupabaseClient, userId: string, campaignId: string, totalPosts: number) =>
    trackEvent(supabase, {
      userId,
      campaignId,
      level: 'info',
      eventType: 'campaign_activated',
      message: `Campaign activated with ${totalPosts} scheduled posts`,
      details: { totalPosts },
    }),

  /** Publish events */
  publishSuccess: (supabase: SupabaseClient, params: {
    userId: string
    campaignId: string
    scheduledPostId: string
    platform: string
    platformPostId?: string
    platformPostUrl?: string
  }) =>
    trackEvent(supabase, {
      ...params,
      level: 'success',
      eventType: 'publish_success',
      message: `Published to ${params.platform}`,
      details: {
        platform_post_id:  params.platformPostId,
        platform_post_url: params.platformPostUrl,
      },
    }),

  publishFailure: (supabase: SupabaseClient, params: {
    userId: string
    campaignId: string
    scheduledPostId: string
    platform: string
    errorCode: string
    errorMessage: string
    retryCount: number
    willRetry: boolean
  }) =>
    trackEvent(supabase, {
      userId:          params.userId,
      campaignId:      params.campaignId,
      scheduledPostId: params.scheduledPostId,
      platform:        params.platform,
      level: params.willRetry ? 'warn' : 'error',
      eventType: 'publish_failure',
      message: `Publish failed on ${params.platform}: ${params.errorMessage}`,
      details: {
        error_code:   params.errorCode,
        retry_count:  params.retryCount,
        will_retry:   params.willRetry,
      },
    }),

  /** Rate limit hit */
  rateLimitHit: (supabase: SupabaseClient, userId: string, action: string) =>
    trackEvent(supabase, {
      userId,
      level: 'warn',
      eventType: 'rate_limit_hit',
      message: `Rate limit hit for action: ${action}`,
      details: { action },
    }),

  /** Settings change */
  settingsChanged: (supabase: SupabaseClient, userId: string, section: string) =>
    trackEvent(supabase, {
      userId,
      level: 'info',
      eventType: 'settings_changed',
      message: `Settings updated: ${section}`,
      details: { section },
    }),

  /** Auth events */
  signedIn: (supabase: SupabaseClient, userId: string) =>
    trackEvent(supabase, {
      userId,
      level: 'info',
      eventType: 'user_signed_in',
      message: 'User signed in',
    }),

  signedOut: (supabase: SupabaseClient, userId: string) =>
    trackEvent(supabase, {
      userId,
      level: 'info',
      eventType: 'user_signed_out',
      message: 'User signed out',
    }),
}

// ---------------------------------------------------------------------------
// Aggregate metrics helpers (for health dashboard)
// ---------------------------------------------------------------------------

export interface PublishMetrics {
  totalPublished: number
  totalFailed: number
  totalRetrying: number
  totalPending: number
  successRate: number
  lastRunAt: string | null
}

/**
 * Fetch publish metrics for a user (last 30 days).
 * Used by the System Health dashboard section.
 */
export async function fetchPublishMetrics(
  supabase: SupabaseClient,
  userId: string
): Promise<PublishMetrics> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('scheduled_posts')
    .select('status')
    .eq('user_id', userId)
    .gte('created_at', thirtyDaysAgo)
    .is('deleted_at', null)

  if (error || !data) {
    return { totalPublished: 0, totalFailed: 0, totalRetrying: 0, totalPending: 0, successRate: 0, lastRunAt: null }
  }

  const published = data.filter((r) => r.status === 'published').length
  const failed    = data.filter((r) => r.status === 'failed').length
  const retrying  = data.filter((r) => r.status === 'processing').length
  const pending   = data.filter((r) => r.status === 'pending').length
  const total     = published + failed
  const rate      = total > 0 ? Math.round((published / total) * 100 * 10) / 10 : 0

  // Get last publish time
  const { data: lastPublish } = await supabase
    .from('published_posts')
    .select('published_at')
    .eq('user_id', userId)
    .order('published_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return {
    totalPublished: published,
    totalFailed:    failed,
    totalRetrying:  retrying,
    totalPending:   pending,
    successRate:    rate,
    lastRunAt:      lastPublish?.published_at ?? null,
  }
}
