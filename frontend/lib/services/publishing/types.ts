// =============================================================================
// Publishing Engine — Shared Types
// Used by publisher.ts, content-resolver.ts, retry.ts, log-writer.ts,
// and the /api/process-posts Route Handler.
// =============================================================================

import type { AdapterErrorCode } from '@/lib/platforms/adapters'

// ---------------------------------------------------------------------------
// Job input / output
// ---------------------------------------------------------------------------

export interface PublishJobInput {
  scheduledPostId: string
  userId: string
  /** Unique ID for this invocation — written to locked_by for idempotency */
  invocationId: string
}

export interface PublishJobResult {
  scheduledPostId: string
  success: boolean
  /** Platform-assigned post ID (for future deletePost calls) */
  platformPostId?: string
  /** Public permalink to the published item */
  platformPostUrl?: string
  /** Human-readable error message */
  error?: string
  /** Structured adapter error code */
  errorCode?: AdapterErrorCode | 'CONTENT_GENERATION_FAILED' | 'NO_CONNECTION' | 'INTERNAL'
  /** True if the job was re-queued for retry */
  retryScheduled?: boolean
  /** ISO timestamp of the next retry attempt, if scheduled */
  nextRetryAt?: string
  /** True if this post was already processed (duplicate guard fired) */
  skipped?: boolean
}

export interface PublishBatchResult {
  invocationId: string
  processed: number
  succeeded: number
  failed: number
  retrying: number
  skipped: number
  results: PublishJobResult[]
}

// ---------------------------------------------------------------------------
// Publishing context — assembled by publisher.ts before calling adapter
// ---------------------------------------------------------------------------

export interface PublishContext {
  scheduledPostId: string
  userId: string
  campaignId: string
  platform: string
  /** Resolved content body to publish */
  content: string
  /** Source URL (required for bookmark platforms) */
  sourceUrl?: string
  /** Article / post title */
  title?: string
  /** Hashtags for the post */
  tags?: string[]
  /** Public media URLs already stored in Supabase Storage */
  mediaUrls?: string[]
}

// ---------------------------------------------------------------------------
// Connection record shape (from platform_connections table)
// ---------------------------------------------------------------------------

export interface ConnectionRow {
  id: string
  userId: string
  platform: string
  accountName: string
  accountHandle: string
  instanceUrl?: string
  status: string
  accessTokenEnc?: string | null
  refreshTokenEnc?: string | null
  /** Encrypted JSON blob: base64(iv[12] + authTag[16] + ciphertext) — written by /api/connections */
  credentialsEncrypted?: string | null
  metadata: Record<string, string>
}
