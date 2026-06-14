// =============================================================================
// Platform Adapter — Shared Types
// All interfaces used by every platform adapter.
// Adapters are server-side only — never import into client components.
// =============================================================================

import type { AllPlatformId } from '../types'

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------

/**
 * Fully decrypted credential map keyed by CredentialField.key.
 * Produced by decryptConnectionCredentials() before being passed to adapters.
 */
export type DecryptedCredentials = Readonly<Record<string, string>>

// ---------------------------------------------------------------------------
// Publish input
// ---------------------------------------------------------------------------

export type PublishContentType = 'post' | 'article' | 'bookmark' | 'note'

export interface PublishInput {
  /** Primary text body — truncated to platform limit if too long */
  content: string
  /** Source URL (required for bookmark platforms; optional for others) */
  url?: string
  /** Article / post title (publishing platforms) */
  title?: string
  /** Tags / hashtags — adapter applies platform-specific prefix and count limits */
  tags?: string[]
  /** Public URLs of media already uploaded to Supabase Storage */
  mediaUrls?: string[]
  /** Hint for which content type to create */
  contentType?: PublishContentType
  /** Platform-specific overrides (subreddit, collection ID, etc.) */
  options?: Record<string, string | number | boolean>
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export interface PublishResult {
  success: boolean
  /** ID on the remote platform — pass back to deletePost() */
  platformPostId?: string
  /** Public permalink to the published post / bookmark */
  platformPostUrl?: string
  /** Remaining API calls in the current rate-limit window */
  rateLimitRemaining?: number
  /** When the rate-limit window resets */
  rateLimitResetAt?: Date
  error?: AdapterError
}

export interface ValidationResult {
  valid: boolean
  /** Display name on the platform */
  accountName?: string
  /** Handle / username on the platform */
  accountHandle?: string
  /** Platform-assigned user ID */
  platformUserId?: string
  /** OAuth scopes confirmed during verification */
  scopes?: string[]
  error?: AdapterError
}

export interface DeleteResult {
  success: boolean
  error?: AdapterError
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type AdapterErrorCode =
  | 'AUTH_EXPIRED'           // Token valid but expired; reconnect
  | 'AUTH_INVALID'           // Bad credentials; re-enter
  | 'RATE_LIMITED'           // 429; retryable after reset
  | 'CONTENT_TOO_LONG'       // Exceeds char limit
  | 'CONTENT_REJECTED'       // 422 / content policy violation
  | 'MEDIA_UNSUPPORTED'      // Unsupported media format
  | 'NETWORK_ERROR'          // TCP / DNS failure
  | 'NETWORK_TIMEOUT'        // AbortController timeout
  | 'API_ERROR'              // Unexpected HTTP error
  | 'NOT_FOUND'              // 404
  | 'PERMISSION_DENIED'      // 403 (scopes / permissions)
  | 'OPERATION_NOT_SUPPORTED' // Platform API does not support this operation

export interface AdapterError {
  code: AdapterErrorCode
  message: string
  /** True = safe to retry; False = requires human action */
  retryable: boolean
  httpStatus?: number
  /** Raw platform error detail for logging */
  detail?: unknown
}

// ---------------------------------------------------------------------------
// The adapter contract
// ---------------------------------------------------------------------------

export interface PlatformAdapter {
  readonly platformId: AllPlatformId

  /**
   * Verify credentials are valid and the account is reachable.
   * Safe to call frequently — should NOT create or mutate any content.
   */
  validateConnection(credentials: DecryptedCredentials): Promise<ValidationResult>

  /**
   * Publish content to the platform.
   * Returns platformPostId needed for deletePost().
   */
  publish(credentials: DecryptedCredentials, input: PublishInput): Promise<PublishResult>

  /**
   * Delete or retract a previously published post / bookmark.
   * platformPostId is the value returned by publish().
   */
  deletePost(credentials: DecryptedCredentials, platformPostId: string): Promise<DeleteResult>
}

// ---------------------------------------------------------------------------
// Credential encryption helpers (type-level only — implementation in crypto.ts)
// ---------------------------------------------------------------------------

/** Shape stored in Supabase for a connection's encrypted credentials */
export interface StoredConnectionCredentials {
  /** Encrypted access token (AES-256-GCM, base64) */
  accessTokenEnc?: string
  /** Encrypted refresh token (AES-256-GCM, base64) */
  refreshTokenEnc?: string
  /** Non-sensitive fields stored as plain JSON */
  metadata: Record<string, string>
}
