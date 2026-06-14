// =============================================================================
// Campaign Services — Barrel Export
// Import everything from here; never from individual service files directly.
// =============================================================================

// Types & constants
export type {
  FrequencyType,
  CampaignFrequency,
  CampaignEngineStatus,
  CampaignRow,
  CampaignCreateInput,
  CampaignUpdateInput,
  ScheduledSlot,
  ScheduleGenerationSummary,
  ScheduledPostRow,
  ScheduledPostStatus,
  ActivationResult,
} from './types'

export {
  FREQUENCY_PRESETS,
  COMMON_TIMEZONES,
} from './types'

// Frequency utilities (pure functions — safe in any context)
export {
  frequencyToMs,
  frequencyLabel,
  frequencyKey,
  parseFrequencyKey,
  estimateDurationDays,
  lastPublishAt,
} from './frequency'

// Scheduler (pure functions — safe in any context)
export {
  generateSchedule,
  previewSchedule,
  chunkSlots,
} from './scheduler'

// Campaign CRUD (requires Supabase client)
export {
  createCampaign,
  fetchCampaignById,
  fetchCampaigns,
  countCampaigns,
  updateCampaign,
  updateCampaignStatus,
  deleteCampaign,
} from './campaign-service'

// Schedule management (requires Supabase client)
export {
  activateCampaign,
  pauseCampaign,
  completeCampaign,
  archiveCampaign,
  fetchCampaignSchedule,
  countCampaignSchedule,
  // Publishing engine helpers
  fetchDueScheduledPosts,
  fetchScheduledPostById,
  countScheduledPostsByStatus,
} from './schedule-service'

export type { FetchScheduleOptions, FetchDuePostsOptions } from './schedule-service'
export type { FetchCampaignsOptions } from './campaign-service'
