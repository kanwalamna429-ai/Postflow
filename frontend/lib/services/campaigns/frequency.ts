// =============================================================================
// Frequency Utilities
// Pure functions for converting frequency types to time intervals.
// No Supabase dependencies.
// =============================================================================

import type { FrequencyType, CampaignFrequency } from './types'

const HOUR_MS = 3_600_000
const DAY_MS  = 86_400_000

// ---------------------------------------------------------------------------
// Interval calculation
// ---------------------------------------------------------------------------

/**
 * Convert a frequency definition to a millisecond interval.
 *
 * @example
 * frequencyToMs({ type: 'every_n_hours', value: 2 }) // → 7_200_000
 */
export function frequencyToMs(frequency: CampaignFrequency): number {
  const { type, value } = frequency
  switch (type) {
    case 'hourly':        return HOUR_MS
    case 'every_n_hours': return value * HOUR_MS
    case 'daily':         return DAY_MS
    case 'every_n_days':  return value * DAY_MS
    case 'weekly':        return 7 * DAY_MS
    default: {
      const _exhaustive: never = type
      return HOUR_MS
    }
  }
}

/**
 * Convert a frequency definition to a human-readable label.
 *
 * @example
 * frequencyLabel({ type: 'every_n_hours', value: 2 }) // → 'Every 2 hours'
 */
export function frequencyLabel(frequency: CampaignFrequency): string {
  const { type, value } = frequency
  switch (type) {
    case 'hourly':        return 'Every hour'
    case 'every_n_hours': return `Every ${value} hour${value === 1 ? '' : 's'}`
    case 'daily':         return 'Daily'
    case 'every_n_days':  return value === 1 ? 'Daily' : `Every ${value} days`
    case 'weekly':        return 'Weekly'
    default: {
      const _exhaustive: never = type
      return 'Unknown'
    }
  }
}

/**
 * Parse a frequency preset key (e.g. "every_n_hours:2") back to a
 * CampaignFrequency. Used to encode/decode select option values.
 */
export function parseFrequencyKey(key: string): CampaignFrequency {
  const [type, valueStr] = key.split(':')
  return {
    type: type as FrequencyType,
    value: valueStr ? parseInt(valueStr, 10) : 1,
  }
}

/**
 * Encode a CampaignFrequency as a select option key.
 */
export function frequencyKey(frequency: CampaignFrequency): string {
  return `${frequency.type}:${frequency.value}`
}

// ---------------------------------------------------------------------------
// Duration estimate
// ---------------------------------------------------------------------------

/**
 * Estimate the total duration of a campaign schedule in days.
 * Given N URLs posted at a given frequency interval.
 */
export function estimateDurationDays(urlCount: number, frequency: CampaignFrequency): number {
  if (urlCount <= 1) return 0
  const totalMs = (urlCount - 1) * frequencyToMs(frequency)
  return Math.ceil(totalMs / DAY_MS)
}

/**
 * Calculate the last publish timestamp given start date, URL count, and frequency.
 */
export function lastPublishAt(
  startDate: Date,
  urlCount: number,
  frequency: CampaignFrequency
): Date {
  if (urlCount <= 1) return new Date(startDate)
  const totalMs = (urlCount - 1) * frequencyToMs(frequency)
  return new Date(startDate.getTime() + totalMs)
}
