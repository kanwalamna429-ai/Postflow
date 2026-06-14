// =============================================================================
// Gemini AI Services — Shared Types
// =============================================================================

// ---------------------------------------------------------------------------
// Platform
// ---------------------------------------------------------------------------

export type SocialPlatform =
  // Existing social
  | 'twitter'
  | 'linkedin'
  | 'instagram'
  | 'facebook'
  | 'tiktok'
  // New social / microblog
  | 'bluesky'
  | 'mastodon'
  | 'misskey'
  | 'pixelfed'
  | 'tumblr'
  // Publishing
  | 'devto'
  | 'hashnode'
  | 'reddit'
  // Bookmarking
  | 'diigo'
  | 'raindrop'
  | 'pocket'
  | 'instapaper'

export type ContentType =
  | 'post'
  | 'thread'
  | 'story'
  | 'reel'
  | 'carousel'

// ---------------------------------------------------------------------------
// Input context passed to every generator
// ---------------------------------------------------------------------------

export interface ContentContext {
  /** Primary source text (article body, page content, etc.) */
  sourceText: string
  /** Page / article title */
  title?: string
  /** Short description or excerpt */
  description?: string
  /** Author of the original content */
  author?: string
  /** Original URL */
  sourceUrl?: string
  /** Site or publisher name */
  siteName?: string
  /** Publish date */
  publishDate?: Date
  /** Keywords from the source */
  keywords?: string[]
  /** User-provided tone override */
  tone?: ContentTone
  /** Additional instructions injected into the prompt */
  customInstructions?: string
  /** Extracted content row ID (for DB linkage) */
  extractedContentId?: string
  /** Campaign ID (for DB linkage) */
  campaignId?: string
}

export type ContentTone =
  | 'professional'
  | 'casual'
  | 'humorous'
  | 'inspirational'
  | 'educational'
  | 'urgent'
  | 'conversational'

// ---------------------------------------------------------------------------
// Generation options
// ---------------------------------------------------------------------------

export interface GenerationOptions {
  /** Gemini model to use (default: gemini-1.5-flash) */
  model?: GeminiModel
  /** Sampling temperature 0–1 (default: 0.7) */
  temperature?: number
  /** Max output tokens (default: varies per generator) */
  maxOutputTokens?: number
  /** Number of variants to generate (default: 1, max: 5) */
  variants?: number
  /** Maximum retry attempts on transient errors (default: 3) */
  maxRetries?: number
}

export type GeminiModel =
  | 'gemini-1.5-flash'
  | 'gemini-1.5-flash-8b'
  | 'gemini-1.5-pro'
  | 'gemini-2.0-flash'
  | 'gemini-2.0-flash-lite'

// ---------------------------------------------------------------------------
// Raw Gemini client result
// ---------------------------------------------------------------------------

export interface GeminiResponse {
  text: string
  model: string
  promptTokens: number
  candidateTokens: number
  totalTokens: number
  finishReason: string
}

// ---------------------------------------------------------------------------
// Social post
// ---------------------------------------------------------------------------

export interface SocialPostOptions extends GenerationOptions {
  platform: SocialPlatform
  contentType?: ContentType
  tone?: ContentTone
  includeHashtags?: boolean
  includeEmoji?: boolean
  /** Enforce platform character limit (default: true) */
  enforceCharLimit?: boolean
  /** Call-to-action to append */
  cta?: string
}

export interface SocialPostResult {
  success: boolean
  platform: SocialPlatform
  contentType: ContentType
  /** Generated variants */
  posts: GeneratedPost[]
  error?: string
  /** DB row IDs if stored */
  savedIds?: string[]
}

export interface GeneratedPost {
  content: string
  hashtags: string[]
  characterCount: number
  withinLimit: boolean
  tone: ContentTone
}

// ---------------------------------------------------------------------------
// Bookmark description
// ---------------------------------------------------------------------------

export interface DescriptionOptions extends GenerationOptions {
  /** Target length in words (default: 30) */
  targetWords?: number
  /** Style: sentence | bullets (default: sentence) */
  style?: 'sentence' | 'bullets'
}

export interface DescriptionResult {
  success: boolean
  descriptions: string[]
  error?: string
  savedIds?: string[]
}

// ---------------------------------------------------------------------------
// Article summary
// ---------------------------------------------------------------------------

export interface SummaryOptions extends GenerationOptions {
  /** Output format (default: bullets) */
  format?: 'bullets' | 'paragraph' | 'tldr'
  /** Max number of bullet points (default: 5) */
  maxPoints?: number
  /** Target reading time in seconds (default: 30) */
  targetReadingTimeSeconds?: number
}

export interface SummaryResult {
  success: boolean
  summaries: ArticleSummary[]
  error?: string
  savedIds?: string[]
}

export interface ArticleSummary {
  content: string
  format: 'bullets' | 'paragraph' | 'tldr'
  wordCount: number
}

// ---------------------------------------------------------------------------
// Hashtags
// ---------------------------------------------------------------------------

export interface HashtagOptions extends GenerationOptions {
  platform: SocialPlatform
  /** Number of hashtags to generate (default: platform-specific) */
  count?: number
  /** Include trending / broad tags (default: true) */
  includeBroad?: boolean
  /** Include niche / specific tags (default: true) */
  includeNiche?: boolean
}

export interface HashtagResult {
  success: boolean
  platform: SocialPlatform
  hashtags: string[][]   // array of variant sets
  error?: string
  savedIds?: string[]
}

// ---------------------------------------------------------------------------
// Alternative titles
// ---------------------------------------------------------------------------

export interface TitleOptions extends GenerationOptions {
  /** Purpose of titles */
  purpose?: 'seo' | 'social' | 'email' | 'ab-test' | 'general'
  /** Max title length in characters (default: 80) */
  maxLength?: number
}

export interface TitleResult {
  success: boolean
  titles: AlternativeTitle[]
  error?: string
  savedIds?: string[]
}

export interface AlternativeTitle {
  title: string
  purpose: string
  characterCount: number
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

export interface SaveGeneratedContentParams {
  userId: string
  platform: SocialPlatform
  content: string
  contentType: ContentType
  tone?: ContentTone
  hashtags?: string[]
  campaignId?: string
  extractedContentId?: string
  metadata?: Record<string, unknown>
}

export interface SavedContent {
  id: string
  platform: SocialPlatform
  content: string
  contentType: ContentType
}

// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------

export type AiErrorCode =
  | 'MISSING_API_KEY'
  | 'RATE_LIMITED'
  | 'QUOTA_EXCEEDED'
  | 'INVALID_REQUEST'
  | 'CONTEXT_TOO_LONG'
  | 'SAFETY_BLOCKED'
  | 'MODEL_UNAVAILABLE'
  | 'TIMEOUT'
  | 'PARSE_FAILED'
  | 'UNKNOWN'

export class AiServiceError extends Error {
  constructor(
    message: string,
    public readonly code: AiErrorCode,
    public readonly retryable: boolean,
    public readonly retryAfterMs?: number
  ) {
    super(message)
    this.name = 'AiServiceError'
  }
}
