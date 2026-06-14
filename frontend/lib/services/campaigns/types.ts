// =============================================================================
// Campaign Engine — Shared Types
// All interfaces and enums for campaigns, frequencies, and scheduled posts.
// =============================================================================

// ---------------------------------------------------------------------------
// Frequency
// ---------------------------------------------------------------------------

/** How often posts are published in a campaign */
export type FrequencyType =
  | 'hourly'        // every 1 hour
  | 'every_n_hours' // every N hours (N = frequencyValue)
  | 'daily'         // every 24 hours
  | 'every_n_days'  // every N days  (N = frequencyValue)
  | 'weekly'        // every 7 days

export interface CampaignFrequency {
  type: FrequencyType
  /** Multiplier — only meaningful for every_n_hours / every_n_days */
  value: number
}

/** Preset frequency options for the UI */
export const FREQUENCY_PRESETS: ReadonlyArray<{
  label: string
  type: FrequencyType
  value: number
}> = [
  { label: 'Every hour',    type: 'hourly',        value: 1  },
  { label: 'Every 2 hours', type: 'every_n_hours', value: 2  },
  { label: 'Every 4 hours', type: 'every_n_hours', value: 4  },
  { label: 'Every 6 hours', type: 'every_n_hours', value: 6  },
  { label: 'Every 8 hours', type: 'every_n_hours', value: 8  },
  { label: 'Every 12 hours',type: 'every_n_hours', value: 12 },
  { label: 'Daily',         type: 'daily',         value: 1  },
  { label: 'Every 2 days',  type: 'every_n_days',  value: 2  },
  { label: 'Every 3 days',  type: 'every_n_days',  value: 3  },
  { label: 'Weekly',        type: 'weekly',         value: 7  },
]

// ---------------------------------------------------------------------------
// Campaign
// ---------------------------------------------------------------------------

export type CampaignEngineStatus =
  | 'draft'
  | 'active'
  | 'paused'
  | 'completed'
  | 'archived'

/**
 * Full campaign row as returned from Supabase.
 * Field names are camelCased from the snake_case DB columns.
 */
export interface CampaignRow {
  id: string
  userId: string
  name: string
  description: string | null
  status: CampaignEngineStatus
  platforms: string[]
  startDate: string | null      // 'YYYY-MM-DD'
  timezone: string              // IANA timezone (e.g. 'America/New_York')
  frequencyType: FrequencyType | null
  frequencyValue: number        // defaults to 1
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

/** Input shape for creating a new campaign */
export interface CampaignCreateInput {
  name: string
  description?: string
  /** Array of AllPlatformId values */
  platforms: string[]
  /** campaign_urls.id values to include in this campaign */
  urlIds: string[]
  frequency: CampaignFrequency
  /** ISO date string 'YYYY-MM-DD' */
  startDate: string
  /** IANA timezone string */
  timezone: string
}

/** Input shape for updating a campaign (all fields optional) */
export type CampaignUpdateInput = Partial<CampaignCreateInput>

// ---------------------------------------------------------------------------
// Schedule generation
// ---------------------------------------------------------------------------

/**
 * A single time-slot in a generated campaign schedule.
 * One slot = one (url, platform, time) combination.
 */
export interface ScheduledSlot {
  /** campaign_urls.id */
  urlId: string
  platform: string
  scheduledAt: Date
  /** Zero-based index within the full campaign schedule */
  sequenceIndex: number
}

/** Summary returned by the schedule generator */
export interface ScheduleGenerationSummary {
  totalSlots: number
  urlCount: number
  platformCount: number
  firstPublishAt: Date
  lastPublishAt: Date
  durationDays: number
}

// ---------------------------------------------------------------------------
// Scheduled post
// ---------------------------------------------------------------------------

export type ScheduledPostStatus =
  | 'pending'
  | 'processing'
  | 'published'
  | 'failed'
  | 'cancelled'

/** Scheduled post row mapped from Supabase */
export interface ScheduledPostRow {
  id: string
  userId: string
  campaignId: string
  urlId: string | null
  platform: string
  content: string
  scheduledAt: string
  status: ScheduledPostStatus
  sequenceIndex: number | null
  retryCount: number
  maxRetries: number
  errorMessage: string | null
  errorCode: string | null
  /** ISO timestamp when this post was locked for processing (null = unlocked) */
  lockedAt: string | null
  /** Invocation ID that holds the lock */
  lockedBy: string | null
  /** Earliest time to re-process after a retryable failure */
  nextRetryAt: string | null
  /** When the post was successfully published */
  publishedAt: string | null
  metadata: Record<string, unknown>
  createdAt: string
}

/** Result returned by activateCampaign */
export interface ActivationResult {
  campaignId: string
  totalSlots: number
  urlCount: number
  platformCount: number
  firstPublishAt: Date
  lastPublishAt: Date
}

// ---------------------------------------------------------------------------
// Common timezones for the UI
// ---------------------------------------------------------------------------

export const COMMON_TIMEZONES: ReadonlyArray<{ label: string; value: string }> = [
  { label: 'UTC',                   value: 'UTC'                    },
  { label: 'Eastern Time (US)',      value: 'America/New_York'       },
  { label: 'Central Time (US)',      value: 'America/Chicago'        },
  { label: 'Mountain Time (US)',     value: 'America/Denver'         },
  { label: 'Pacific Time (US)',      value: 'America/Los_Angeles'    },
  { label: 'Alaska Time (US)',       value: 'America/Anchorage'      },
  { label: 'Hawaii Time (US)',       value: 'Pacific/Honolulu'       },
  { label: 'London (GMT/BST)',       value: 'Europe/London'          },
  { label: 'Paris / Berlin / Rome',  value: 'Europe/Paris'           },
  { label: 'Athens / Helsinki',      value: 'Europe/Athens'          },
  { label: 'Moscow (MSK)',           value: 'Europe/Moscow'          },
  { label: 'Dubai (GST)',            value: 'Asia/Dubai'             },
  { label: 'Kolkata (IST)',          value: 'Asia/Kolkata'           },
  { label: 'Bangkok (ICT)',          value: 'Asia/Bangkok'           },
  { label: 'Singapore (SGT)',        value: 'Asia/Singapore'         },
  { label: 'Tokyo (JST)',            value: 'Asia/Tokyo'             },
  { label: 'Sydney (AEST/AEDT)',     value: 'Australia/Sydney'       },
  { label: 'Auckland (NZST/NZDT)',   value: 'Pacific/Auckland'       },
  { label: 'São Paulo (BRT)',        value: 'America/Sao_Paulo'      },
  { label: 'Buenos Aires (ART)',     value: 'America/Argentina/Buenos_Aires' },
]
