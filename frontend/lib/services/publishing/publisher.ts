// =============================================================================
// Publisher — Publishing Engine Core Orchestrator
//
// Full publish workflow per scheduled post:
//   1. Load scheduled_post record
//   2. Idempotency check (skip if already published / permanently failed)
//   3. Stale lock detection + reclaim
//   4. Lock record (status → 'processing', set locked_at / locked_by)
//   5. Load platform connection + decrypt credentials
//   6. Resolve / generate content
//   7. Call platform adapter → publish()
//   8. On success: write published_posts row, update status → 'published'
//   9. On failure: schedule retry or mark as 'failed'
//  10. Log every step to system_logs
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { createDecipheriv } from 'node:crypto'
import { getAdapter } from '@/lib/platforms/adapters'
import { decryptConnectionCredentials } from '@/lib/platforms/adapters/crypto'
import type { PublishInput } from '@/lib/platforms/adapters'
import { getPlatformConfig } from '@/lib/platforms'
import { resolveContent } from './content-resolver'
import { shouldRetry, getNextRetryAt, isLockStale, retryDelayLabel } from './retry'
import {
  logPublishAttempt,
  logPublishSuccess,
  logPublishFailure,
  logStaleLockReleased,
} from './log-writer'
import type { PublishJobInput, PublishJobResult, ConnectionRow } from './types'

// ---------------------------------------------------------------------------
// Decrypt the credentials_encrypted blob written by /api/connections
// Format: base64( iv[12] + authTag[16] + ciphertext )
// Falls back to plain base64-decoded JSON if no encryption key is set.
// ---------------------------------------------------------------------------

async function decryptCredentialsBlob(blob: string): Promise<Record<string, string>> {
  const raw = process.env.POSTFLOW_ENCRYPTION_KEY
  if (!raw) {
    const json = Buffer.from(blob, 'base64').toString('utf8')
    return JSON.parse(json) as Record<string, string>
  }
  const key = Buffer.from(raw, 'hex')
  if (key.length !== 32) throw new Error('POSTFLOW_ENCRYPTION_KEY must be 64 hex chars')

  const buf       = Buffer.from(blob, 'base64')
  const iv        = buf.subarray(0, 12)
  const authTag   = buf.subarray(12, 28)
  const encrypted = buf.subarray(28)

  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)
  const plain = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
  return JSON.parse(plain) as Record<string, string>
}

// ---------------------------------------------------------------------------
// Internal: load a scheduled_post row
// ---------------------------------------------------------------------------

interface ScheduledPostRecord {
  id: string
  userId: string
  campaignId: string
  urlId: string | null
  platform: string
  content: string
  status: string
  retryCount: number
  maxRetries: number
  lockedAt: string | null
  lockedBy: string | null
  errorMessage: string | null
  metadata: Record<string, unknown>
}

async function loadScheduledPost(
  supabase: SupabaseClient,
  id: string
): Promise<ScheduledPostRecord | null> {
  const { data, error } = await supabase
    .from('scheduled_posts')
    .select('id, user_id, campaign_id, url_id, platform, content, status, retry_count, max_retries, locked_at, locked_by, error_message, metadata')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (error || !data) return null

  return {
    id:           data.id,
    userId:       data.user_id,
    campaignId:   data.campaign_id,
    urlId:        data.url_id ?? null,
    platform:     data.platform,
    content:      data.content,
    status:       data.status,
    retryCount:   data.retry_count ?? 0,
    maxRetries:   data.max_retries ?? 3,
    lockedAt:     data.locked_at ?? null,
    lockedBy:     data.locked_by ?? null,
    errorMessage: data.error_message ?? null,
    metadata:     (data.metadata as Record<string, unknown>) ?? {},
  }
}

// ---------------------------------------------------------------------------
// Internal: load platform connection for user + platform
// ---------------------------------------------------------------------------

async function loadConnection(
  supabase: SupabaseClient,
  userId: string,
  platform: string
): Promise<ConnectionRow | null> {
  const { data, error } = await supabase
    .from('platform_connections')
    .select('id, user_id, platform, account_name, account_handle, instance_url, status, access_token_enc, refresh_token_enc, credentials_encrypted, metadata')
    .eq('user_id', userId)
    .eq('platform', platform)
    .eq('status', 'connected')
    .is('deleted_at', null)
    .maybeSingle()

  if (error || !data) return null

  return {
    id:                   data.id,
    userId:               data.user_id,
    platform:             data.platform,
    accountName:          data.account_name ?? '',
    accountHandle:        data.account_handle ?? '',
    instanceUrl:          data.instance_url ?? undefined,
    status:               data.status,
    accessTokenEnc:       data.access_token_enc  ?? null,
    refreshTokenEnc:      data.refresh_token_enc ?? null,
    credentialsEncrypted: (data as Record<string, unknown>).credentials_encrypted as string ?? null,
    metadata:             (data.metadata as Record<string, string>) ?? {},
  }
}

// ---------------------------------------------------------------------------
// Internal: acquire lock
// Returns true if the lock was successfully acquired.
// Returns false if the record is already locked by another invocation.
// ---------------------------------------------------------------------------

async function acquireLock(
  supabase: SupabaseClient,
  scheduledPostId: string,
  invocationId: string
): Promise<boolean> {
  const now = new Date().toISOString()

  // Atomic: only update if status is still 'pending' (prevents double-lock)
  const { data, error } = await supabase
    .from('scheduled_posts')
    .update({
      status:    'processing',
      locked_at: now,
      locked_by: invocationId,
    })
    .eq('id', scheduledPostId)
    .eq('status', 'pending')
    .select('id')

  if (error) {
    console.error('[publisher] acquireLock error:', error.message)
    return false
  }

  return Array.isArray(data) && data.length > 0
}

// ---------------------------------------------------------------------------
// Internal: release lock back to pending (on retryable failure)
// ---------------------------------------------------------------------------

async function releaseLockForRetry(
  supabase: SupabaseClient,
  scheduledPostId: string,
  retryCount: number,
  nextRetryAt: Date,
  errorMessage: string,
  errorCode: string
): Promise<void> {
  await supabase
    .from('scheduled_posts')
    .update({
      status:        'pending',
      locked_at:     null,
      locked_by:     null,
      retry_count:   retryCount,
      next_retry_at: nextRetryAt.toISOString(),
      error_message: errorMessage,
      error_code:    errorCode,
    })
    .eq('id', scheduledPostId)
}

// ---------------------------------------------------------------------------
// Internal: mark as permanently failed
// ---------------------------------------------------------------------------

async function markFailed(
  supabase: SupabaseClient,
  scheduledPostId: string,
  retryCount: number,
  errorMessage: string,
  errorCode: string
): Promise<void> {
  await supabase
    .from('scheduled_posts')
    .update({
      status:        'failed',
      locked_at:     null,
      locked_by:     null,
      retry_count:   retryCount,
      error_message: errorMessage,
      error_code:    errorCode,
    })
    .eq('id', scheduledPostId)
}

// ---------------------------------------------------------------------------
// Internal: mark as published + write published_posts record
// ---------------------------------------------------------------------------

async function markPublished(
  supabase: SupabaseClient,
  params: {
    scheduledPostId: string
    userId: string
    campaignId: string
    platform: string
    content: string
    platformPostId?: string
    platformPostUrl?: string
    responseData: Record<string, unknown>
  }
): Promise<void> {
  const now = new Date().toISOString()

  // Update scheduled_post status
  await supabase
    .from('scheduled_posts')
    .update({
      status:       'published',
      locked_at:    null,
      locked_by:    null,
      published_at: now,
    })
    .eq('id', params.scheduledPostId)

  // Write published_posts record
  await supabase.from('published_posts').insert({
    user_id:           params.userId,
    campaign_id:       params.campaignId,
    scheduled_post_id: params.scheduledPostId,
    platform:          params.platform,
    content:           params.content,
    platform_post_id:  params.platformPostId  ?? null,
    platform_post_url: params.platformPostUrl ?? null,
    response_data:     params.responseData,
    published_at:      now,
    metadata:          {},
  })
}

// ---------------------------------------------------------------------------
// publishOne — process a single scheduled post
// ---------------------------------------------------------------------------

export async function publishOne(
  supabase: SupabaseClient,
  input: PublishJobInput
): Promise<PublishJobResult> {
  const { scheduledPostId, userId, invocationId } = input

  // -------------------------------------------------------------------------
  // 1. Load record
  // -------------------------------------------------------------------------
  const post = await loadScheduledPost(supabase, scheduledPostId)
  if (!post) {
    return { scheduledPostId, success: false, error: 'Scheduled post not found', errorCode: 'INTERNAL' }
  }

  // -------------------------------------------------------------------------
  // 2. Idempotency checks
  // -------------------------------------------------------------------------
  if (post.status === 'published') {
    return { scheduledPostId, success: true, skipped: true }
  }
  if (post.status === 'failed' || post.status === 'cancelled') {
    return { scheduledPostId, success: false, skipped: true, error: `Post is ${post.status}` }
  }

  // -------------------------------------------------------------------------
  // 3. Stale lock detection — reclaim if locked too long ago
  // -------------------------------------------------------------------------
  if (post.status === 'processing' && post.lockedAt) {
    if (isLockStale(post.lockedAt)) {
      // Release stale lock back to pending so we can re-acquire
      await supabase
        .from('scheduled_posts')
        .update({ status: 'pending', locked_at: null, locked_by: null })
        .eq('id', scheduledPostId)
        .eq('status', 'processing')

      await logStaleLockReleased(supabase, {
        userId,
        scheduledPostId,
        platform:  post.platform,
        lockedAt:  post.lockedAt,
        lockedBy:  post.lockedBy,
      })
    } else {
      // Actively locked by another invocation — skip
      return { scheduledPostId, success: false, skipped: true, error: 'Post is currently processing' }
    }
  }

  // Check retry timing: don't process before next_retry_at
  const nextRetry = post.metadata['next_retry_at'] as string | undefined
  if (nextRetry && new Date(nextRetry) > new Date()) {
    return { scheduledPostId, success: false, skipped: true, error: 'Retry not yet due' }
  }

  // -------------------------------------------------------------------------
  // 4. Acquire lock
  // -------------------------------------------------------------------------
  const locked = await acquireLock(supabase, scheduledPostId, invocationId)
  if (!locked) {
    return { scheduledPostId, success: false, skipped: true, error: 'Could not acquire lock' }
  }

  // -------------------------------------------------------------------------
  // 5. Load platform connection
  // -------------------------------------------------------------------------
  const connection = await loadConnection(supabase, userId, post.platform)
  if (!connection) {
    await markFailed(supabase, scheduledPostId, post.retryCount, 'No connected account found for this platform', 'NO_CONNECTION')
    return { scheduledPostId, success: false, error: 'No connected account', errorCode: 'NO_CONNECTION' }
  }

  // -------------------------------------------------------------------------
  // 6. Decrypt credentials
  //
  // Priority order:
  //   a) credentials_encrypted — JSON blob saved by /api/connections (new path)
  //   b) access_token_enc / refresh_token_enc — legacy columns (fallback)
  //   c) metadata fields — plaintext extras (always merged in)
  // -------------------------------------------------------------------------
  let credentials: Record<string, string>
  try {
    if (connection.credentialsEncrypted) {
      // Primary path: full credential map encrypted as a single JSON blob
      const blob = await decryptCredentialsBlob(connection.credentialsEncrypted)
      // Merge plaintext metadata on top (instance_url, etc.)
      credentials = {
        ...blob,
        ...Object.fromEntries(
          Object.entries(connection.metadata).filter(([, v]) => typeof v === 'string')
        ),
      }
    } else {
      // Legacy path: access_token_enc / refresh_token_enc columns
      credentials = await decryptConnectionCredentials({
        accessTokenEnc:  connection.accessTokenEnc ?? undefined,
        refreshTokenEnc: connection.refreshTokenEnc ?? undefined,
        metadata:        connection.metadata,
      })
    }

    // Inject instance URL for federated platforms (Mastodon, Misskey, Pixelfed)
    if (connection.instanceUrl) {
      credentials['instance_url'] = connection.instanceUrl
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await markFailed(supabase, scheduledPostId, post.retryCount, `Credential decryption failed: ${msg}`, 'AUTH_INVALID')
    return { scheduledPostId, success: false, error: msg, errorCode: 'AUTH_INVALID' }
  }

  // -------------------------------------------------------------------------
  // 7. Resolve / generate content
  // -------------------------------------------------------------------------
  await logPublishAttempt(supabase, {
    userId,
    campaignId:      post.campaignId,
    scheduledPostId,
    platform:        post.platform,
    retryCount:      post.retryCount,
    invocationId,
  })

  let resolvedContent: string
  let resolvedTitle: string | undefined
  let resolvedTags: string[] | undefined

  try {
    const resolution = await resolveContent(supabase, {
      scheduledPostId,
      userId,
      campaignId:     post.campaignId,
      urlId:          post.urlId,
      platform:       post.platform,
      currentContent: post.content,
      metadata:       post.metadata,
    })
    resolvedContent = resolution.content
    resolvedTitle   = resolution.title
    resolvedTags    = resolution.tags
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    resolvedContent = post.content
    console.warn('[publisher] Content resolution failed (using fallback):', msg)
  }

  // -------------------------------------------------------------------------
  // 8. Build PublishInput for adapter
  // -------------------------------------------------------------------------
  const platformConfig = getPlatformConfig(post.platform)

  // Get source URL from metadata or extracted content
  const sourceUrl =
    (post.metadata['source_url'] as string | undefined) ??
    (post.metadata['original_url'] as string | undefined) ??
    undefined

  const publishInput: PublishInput = {
    content:     resolvedContent,
    url:         sourceUrl,
    title:       resolvedTitle,
    tags:        resolvedTags,
    contentType: platformConfig?.aiConfig.promptCategory === 'bookmark_note'
      ? 'bookmark'
      : platformConfig?.aiConfig.promptCategory === 'article_content'
        ? 'article'
        : 'post',
    options: connection.instanceUrl
      ? { instance_url: connection.instanceUrl }
      : undefined,
  }

  // -------------------------------------------------------------------------
  // 9. Call adapter
  // -------------------------------------------------------------------------
  let adapter
  try {
    adapter = getAdapter(post.platform)
  } catch {
    await markFailed(supabase, scheduledPostId, post.retryCount, `No adapter for platform: ${post.platform}`, 'INTERNAL')
    return { scheduledPostId, success: false, error: `No adapter for ${post.platform}`, errorCode: 'INTERNAL' }
  }

  const adapterResult = await adapter.publish(credentials, publishInput)

  // -------------------------------------------------------------------------
  // 10. Handle result
  // -------------------------------------------------------------------------
  if (adapterResult.success) {
    await markPublished(supabase, {
      scheduledPostId,
      userId,
      campaignId:       post.campaignId,
      platform:         post.platform,
      content:          resolvedContent,
      platformPostId:   adapterResult.platformPostId,
      platformPostUrl:  adapterResult.platformPostUrl,
      responseData: {
        platform_post_id:  adapterResult.platformPostId  ?? null,
        platform_post_url: adapterResult.platformPostUrl ?? null,
        rate_limit_remaining: adapterResult.rateLimitRemaining ?? null,
      },
    })

    await logPublishSuccess(supabase, {
      userId,
      campaignId:       post.campaignId,
      scheduledPostId,
      platform:         post.platform,
      platformPostId:   adapterResult.platformPostId,
      platformPostUrl:  adapterResult.platformPostUrl,
      retryCount:       post.retryCount,
    })

    return {
      scheduledPostId,
      success:         true,
      platformPostId:  adapterResult.platformPostId,
      platformPostUrl: adapterResult.platformPostUrl,
    }
  }

  // -------------------------------------------------------------------------
  // 11. Handle failure — retry or permanent fail
  // -------------------------------------------------------------------------
  const error        = adapterResult.error!
  const newRetryCount = post.retryCount + 1
  const canRetry     = error.retryable && shouldRetry(newRetryCount, post.maxRetries)

  if (canRetry) {
    const nextRetryAt = getNextRetryAt(newRetryCount, post.maxRetries)!
    await releaseLockForRetry(
      supabase,
      scheduledPostId,
      newRetryCount,
      nextRetryAt,
      error.message,
      error.code
    )

    await logPublishFailure(supabase, {
      userId,
      campaignId:   post.campaignId,
      scheduledPostId,
      platform:     post.platform,
      errorMessage: error.message,
      errorCode:    error.code,
      retryCount:   newRetryCount,
      willRetry:    true,
      nextRetryAt:  nextRetryAt.toISOString(),
    })

    return {
      scheduledPostId,
      success:        false,
      error:          error.message,
      errorCode:      error.code,
      retryScheduled: true,
      nextRetryAt:    nextRetryAt.toISOString(),
    }
  }

  // Permanent failure
  await markFailed(supabase, scheduledPostId, newRetryCount, error.message, error.code)

  await logPublishFailure(supabase, {
    userId,
    campaignId:   post.campaignId,
    scheduledPostId,
    platform:     post.platform,
    errorMessage: error.message,
    errorCode:    error.code,
    retryCount:   newRetryCount,
    willRetry:    false,
  })

  return {
    scheduledPostId,
    success:    false,
    error:      error.message,
    errorCode:  error.code,
    retryScheduled: false,
  }
}
