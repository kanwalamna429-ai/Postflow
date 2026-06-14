// =============================================================================
// Log Writer — Publishing Engine
// Writes structured publish events to the system_logs table.
// Follows the existing logging pattern used by schedule-service.ts.
// All methods are fire-and-forget — they never throw; errors are console-logged.
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type { AdapterErrorCode } from '@/lib/platforms/adapters'

// ---------------------------------------------------------------------------
// Log level type (matches system_logs.level CHECK constraint)
// ---------------------------------------------------------------------------

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

// ---------------------------------------------------------------------------
// Internal helper
// ---------------------------------------------------------------------------

async function writeLog(
  supabase: SupabaseClient,
  params: {
    userId: string
    campaignId?: string | null
    scheduledPostId?: string
    level: LogLevel
    eventType: string
    message: string
    details?: Record<string, unknown>
  }
): Promise<void> {
  try {
    const { error } = await supabase.from('system_logs').insert({
      user_id:            params.userId,
      campaign_id:        params.campaignId ?? null,
      scheduled_post_id:  params.scheduledPostId ?? null,
      level:              params.level,
      event_type:         params.eventType,
      message:            params.message,
      details:            params.details ?? {},
    })
    if (error) {
      console.error('[log-writer] Failed to write log:', error.message)
    }
  } catch (err) {
    console.error('[log-writer] Unexpected error writing log:', err)
  }
}

// ---------------------------------------------------------------------------
// Publish attempt
// ---------------------------------------------------------------------------

export async function logPublishAttempt(
  supabase: SupabaseClient,
  params: {
    userId: string
    campaignId?: string | null
    scheduledPostId: string
    platform: string
    retryCount: number
    invocationId: string
  }
): Promise<void> {
  await writeLog(supabase, {
    userId:          params.userId,
    campaignId:      params.campaignId,
    scheduledPostId: params.scheduledPostId,
    level:           'info',
    eventType:       'publish_attempt',
    message: `Publishing to ${params.platform} (attempt ${params.retryCount + 1})`,
    details: {
      platform:      params.platform,
      retry_count:   params.retryCount,
      invocation_id: params.invocationId,
    },
  })
}

// ---------------------------------------------------------------------------
// Publish success
// ---------------------------------------------------------------------------

export async function logPublishSuccess(
  supabase: SupabaseClient,
  params: {
    userId: string
    campaignId?: string | null
    scheduledPostId: string
    platform: string
    platformPostId?: string
    platformPostUrl?: string
    retryCount: number
  }
): Promise<void> {
  await writeLog(supabase, {
    userId:          params.userId,
    campaignId:      params.campaignId,
    scheduledPostId: params.scheduledPostId,
    level:           'info',
    eventType:       'publish_success',
    message: `Successfully published to ${params.platform}`,
    details: {
      platform:          params.platform,
      platform_post_id:  params.platformPostId  ?? null,
      platform_post_url: params.platformPostUrl ?? null,
      retry_count:       params.retryCount,
    },
  })
}

// ---------------------------------------------------------------------------
// Publish failure
// ---------------------------------------------------------------------------

export async function logPublishFailure(
  supabase: SupabaseClient,
  params: {
    userId: string
    campaignId?: string | null
    scheduledPostId: string
    platform: string
    errorMessage: string
    errorCode?: AdapterErrorCode | string
    retryCount: number
    willRetry: boolean
    nextRetryAt?: string
  }
): Promise<void> {
  await writeLog(supabase, {
    userId:          params.userId,
    campaignId:      params.campaignId,
    scheduledPostId: params.scheduledPostId,
    level:           params.willRetry ? 'warn' : 'error',
    eventType:       params.willRetry ? 'publish_retry_scheduled' : 'publish_failed',
    message: params.willRetry
      ? `Publish to ${params.platform} failed — retry at ${params.nextRetryAt}`
      : `Publish to ${params.platform} permanently failed: ${params.errorMessage}`,
    details: {
      platform:       params.platform,
      error_message:  params.errorMessage,
      error_code:     params.errorCode   ?? null,
      retry_count:    params.retryCount,
      will_retry:     params.willRetry,
      next_retry_at:  params.nextRetryAt ?? null,
    },
  })
}

// ---------------------------------------------------------------------------
// Content generation
// ---------------------------------------------------------------------------

export async function logContentGeneration(
  supabase: SupabaseClient,
  params: {
    userId: string
    campaignId?: string | null
    scheduledPostId: string
    platform: string
    success: boolean
    errorMessage?: string
  }
): Promise<void> {
  await writeLog(supabase, {
    userId:          params.userId,
    campaignId:      params.campaignId,
    scheduledPostId: params.scheduledPostId,
    level:           params.success ? 'info' : 'error',
    eventType:       params.success ? 'content_generated' : 'content_generation_failed',
    message: params.success
      ? `AI content generated for ${params.platform}`
      : `AI content generation failed for ${params.platform}: ${params.errorMessage}`,
    details: {
      platform:      params.platform,
      success:       params.success,
      error_message: params.errorMessage ?? null,
    },
  })
}

// ---------------------------------------------------------------------------
// Stale lock released
// ---------------------------------------------------------------------------

export async function logStaleLockReleased(
  supabase: SupabaseClient,
  params: {
    userId: string
    scheduledPostId: string
    platform: string
    lockedAt: string
    lockedBy: string | null
  }
): Promise<void> {
  await writeLog(supabase, {
    userId:          params.userId,
    scheduledPostId: params.scheduledPostId,
    level:           'warn',
    eventType:       'stale_lock_released',
    message:         `Stale lock released for ${params.platform} post (locked at ${params.lockedAt})`,
    details: {
      platform:   params.platform,
      locked_at:  params.lockedAt,
      locked_by:  params.lockedBy ?? null,
    },
  })
}
