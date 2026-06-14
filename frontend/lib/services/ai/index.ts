// =============================================================================
// Gemini AI Services — Barrel Export
// =============================================================================

// Types
export type {
  SocialPlatform,
  ContentType,
  ContentTone,
  ContentContext,
  GeminiModel,
  GeminiResponse,
  GenerationOptions,
  // Social post
  SocialPostOptions,
  SocialPostResult,
  GeneratedPost,
  // Description
  DescriptionOptions,
  DescriptionResult,
  // Summary
  SummaryOptions,
  SummaryResult,
  ArticleSummary,
  // Hashtags
  HashtagOptions,
  HashtagResult,
  // Titles
  TitleOptions,
  TitleResult,
  AlternativeTitle,
  // Storage
  SaveGeneratedContentParams,
  SavedContent,
  // Errors
  AiErrorCode,
} from './types'

export { AiServiceError } from './types'

// Gemini client (low-level)
export { generate, generateVariants, getRateLimiterStatus } from './client'

// Prompt builders (for custom use cases)
export {
  buildSocialPostPrompt,
  buildHashtagPrompt,
  buildDescriptionPrompt,
  buildSummaryPrompt,
  buildTitlePrompt,
  PLATFORM_LIMITS,
} from './prompts'

// Generators (primary API)
export { generateSocialPost, generateCrossPostContent } from './social-post'
export { generateDescription }                          from './description'
export { generateSummary }                              from './summary'
export { generateHashtags }                             from './hashtags'
export { generateTitles }                               from './titles'

// Storage helpers
export {
  saveGeneratedContent,
  saveGeneratedContentBatch,
  approveGeneratedContent,
  deleteGeneratedContent,
  fetchGeneratedContent,
} from './storage'
