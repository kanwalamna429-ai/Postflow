// =============================================================================
// Retry Logic — Publishing Engine
// Defines retry schedule and helpers for determining whether / when to retry.
//
// Retry schedule (from PROJECT_CONTEXT.md):
//   Attempt 1 → +1 minute
//   Attempt 2 → +5 minutes
//   Attempt 3 → +15 minutes
//   After 3 failures → status = failed (no more retries)
// =============================================================================

/** Delay in milliseconds for each retry attempt (0-indexed by retryCount) */
const RETRY_DELAYS_MS: readonly number[] = [
  1  * 60 * 1_000,   // attempt 1: +1 minute
  5  * 60 * 1_000,   // attempt 2: +5 minutes
  15 * 60 * 1_000,   // attempt 3: +15 minutes
]

/**
 * Maximum number of retry attempts before marking status = 'failed'.
 * Mirrors the max_retries default in the scheduled_posts table.
 */
export const MAX_RETRY_ATTEMPTS = RETRY_DELAYS_MS.length

/**
 * Returns true if the post is eligible for a retry given the current retry count.
 * @param retryCount Current retry_count value from the DB row.
 * @param maxRetries Max retries configured for this row (defaults to MAX_RETRY_ATTEMPTS).
 */
export function shouldRetry(retryCount: number, maxRetries = MAX_RETRY_ATTEMPTS): boolean {
  return retryCount < maxRetries && retryCount < RETRY_DELAYS_MS.length
}

/**
 * Returns the Date for the next retry attempt, or null if no more retries remain.
 * @param retryCount Current retry_count value (before incrementing).
 * @param maxRetries Max retries configured for this row.
 * @param from      Base timestamp to calculate from (default: now).
 */
export function getNextRetryAt(
  retryCount: number,
  maxRetries = MAX_RETRY_ATTEMPTS,
  from: Date = new Date()
): Date | null {
  if (!shouldRetry(retryCount, maxRetries)) return null
  const delayMs = RETRY_DELAYS_MS[retryCount]
  return new Date(from.getTime() + delayMs)
}

/**
 * Returns a human-readable description of the retry delay.
 * Useful for log messages.
 */
export function retryDelayLabel(retryCount: number): string {
  const delayMs = RETRY_DELAYS_MS[retryCount]
  if (delayMs === undefined) return 'no retry'
  if (delayMs < 60_000)           return `${delayMs / 1_000}s`
  if (delayMs < 3_600_000)        return `${delayMs / 60_000}m`
  return `${Math.round(delayMs / 3_600_000)}h`
}

/**
 * Stale lock threshold: locks older than this are considered abandoned.
 * A crashed or timed-out invocation will leave a stale lock.
 */
export const STALE_LOCK_THRESHOLD_MS = 10 * 60 * 1_000  // 10 minutes

/**
 * Returns true if a locked_at timestamp is considered stale.
 */
export function isLockStale(lockedAt: string | null | undefined): boolean {
  if (!lockedAt) return false
  return Date.now() - new Date(lockedAt).getTime() > STALE_LOCK_THRESHOLD_MS
}
