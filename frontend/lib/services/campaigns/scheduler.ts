// =============================================================================
// Campaign Scheduler — Pure Scheduling Logic
// Converts URLs + platforms + frequency into a flat list of ScheduledSlots.
// No Supabase dependencies. Safe to call from server actions or Edge Functions.
// =============================================================================

import type {
  CampaignFrequency,
  ScheduledSlot,
  ScheduleGenerationSummary,
} from './types'
import { frequencyToMs, estimateDurationDays } from './frequency'

// ---------------------------------------------------------------------------
// Core generator
// ---------------------------------------------------------------------------

/**
 * Generate ALL scheduled post slots for a campaign at activation time.
 *
 * Scheduling model:
 * - Each URL occupies exactly one time slot.
 * - All platforms for a URL fire simultaneously at that slot's timestamp.
 * - Slots are evenly spaced by the frequency interval.
 *
 * Example: 3 URLs × 2 platforms × every 2 hours → 6 rows
 *   Slot 0 (T+0h):  URL[0] → Platform A   sequenceIndex: 0
 *   Slot 1 (T+0h):  URL[0] → Platform B   sequenceIndex: 1
 *   Slot 2 (T+2h):  URL[1] → Platform A   sequenceIndex: 2
 *   Slot 3 (T+2h):  URL[1] → Platform B   sequenceIndex: 3
 *   Slot 4 (T+4h):  URL[2] → Platform A   sequenceIndex: 4
 *   Slot 5 (T+4h):  URL[2] → Platform B   sequenceIndex: 5
 *
 * @param urlIds    Ordered array of campaign_urls.id values
 * @param platforms Array of platform ID strings (AllPlatformId)
 * @param startDate Campaign start datetime (already adjusted for timezone)
 * @param frequency CampaignFrequency defining the interval
 * @returns Object containing all slots and a summary
 */
export function generateSchedule(
  urlIds: string[],
  platforms: string[],
  startDate: Date,
  frequency: CampaignFrequency
): { slots: ScheduledSlot[]; summary: ScheduleGenerationSummary } {
  if (urlIds.length === 0) {
    throw new Error('Cannot generate schedule: campaign has no URLs')
  }
  if (platforms.length === 0) {
    throw new Error('Cannot generate schedule: campaign has no platforms')
  }

  const intervalMs = frequencyToMs(frequency)
  const slots: ScheduledSlot[] = []
  let sequenceIndex = 0

  for (let urlIdx = 0; urlIdx < urlIds.length; urlIdx++) {
    const slotTime = new Date(startDate.getTime() + urlIdx * intervalMs)

    for (const platform of platforms) {
      slots.push({
        urlId:         urlIds[urlIdx],
        platform,
        scheduledAt:   slotTime,
        sequenceIndex: sequenceIndex++,
      })
    }
  }

  const firstPublishAt = slots[0].scheduledAt
  const lastPublishAt  = slots[slots.length - 1].scheduledAt

  const durationMs   = lastPublishAt.getTime() - firstPublishAt.getTime()
  const durationDays = durationMs > 0 ? Math.ceil(durationMs / 86_400_000) : 0

  const summary: ScheduleGenerationSummary = {
    totalSlots:    slots.length,
    urlCount:      urlIds.length,
    platformCount: platforms.length,
    firstPublishAt,
    lastPublishAt,
    durationDays,
  }

  return { slots, summary }
}

// ---------------------------------------------------------------------------
// Preview helper (UI use — no DB needed)
// ---------------------------------------------------------------------------

/**
 * Generate a lightweight schedule preview for the campaign creation form.
 * Returns only the summary (no slot array) to keep it fast.
 */
export function previewSchedule(
  urlCount: number,
  platformCount: number,
  startDate: Date,
  frequency: CampaignFrequency
): ScheduleGenerationSummary & { estimatedEndDate: string } {
  if (urlCount === 0 || platformCount === 0) {
    return {
      totalSlots:    0,
      urlCount,
      platformCount,
      firstPublishAt: startDate,
      lastPublishAt:  startDate,
      durationDays:   0,
      estimatedEndDate: startDate.toISOString().split('T')[0],
    }
  }

  const intervalMs     = frequencyToMs(frequency)
  const firstPublishAt = new Date(startDate)
  const lastOffsetMs   = (urlCount - 1) * intervalMs
  const lastPublishAt  = new Date(startDate.getTime() + lastOffsetMs)
  const durationDays   = estimateDurationDays(urlCount, frequency)

  return {
    totalSlots:      urlCount * platformCount,
    urlCount,
    platformCount,
    firstPublishAt,
    lastPublishAt,
    durationDays,
    estimatedEndDate: lastPublishAt.toISOString().split('T')[0],
  }
}

// ---------------------------------------------------------------------------
// Slot array chunking (for batch DB inserts)
// ---------------------------------------------------------------------------

/**
 * Split a slots array into chunks of `size` for bulk DB insertion.
 * Supabase handles up to ~1000 rows per insert reliably.
 */
export function chunkSlots(slots: ScheduledSlot[], size = 500): ScheduledSlot[][] {
  const chunks: ScheduledSlot[][] = []
  for (let i = 0; i < slots.length; i += size) {
    chunks.push(slots.slice(i, i + size))
  }
  return chunks
}
