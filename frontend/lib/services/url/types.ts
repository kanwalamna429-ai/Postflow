// =============================================================================
// URL Ingestion & Metadata Extraction — Shared Types
// =============================================================================

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

/** The source that supplied a given metadata field. Higher = lower priority. */
export type MetadataSource = 'og' | 'twitter' | 'json-ld' | 'meta' | 'html'

export interface ExtractedMetadata {
  /** Page title */
  title?: string
  /** Page description / excerpt */
  description?: string
  /** Primary image URL (og:image, twitter:image, JSON-LD image) */
  featuredImage?: string
  /** Canonical URL declared by the page */
  canonicalUrl?: string
  /** Site / publisher name */
  siteName?: string
  /** Content author */
  author?: string
  /** Publish / modified date */
  publishDate?: Date
  /** og:type value (article, website, etc.) */
  ogType?: string
  /** Extracted keywords */
  keywords?: string[]
  /** og:locale value */
  locale?: string
  /** twitter:card value */
  twitterCard?: string
  /** All JSON-LD blobs found on the page */
  jsonLd?: Record<string, unknown>[]
  /** Which source provided the primary title/description */
  primarySource: MetadataSource
  /** Per-field source attribution */
  fieldSources: Partial<Record<keyof Omit<ExtractedMetadata, 'primarySource' | 'fieldSources'>, MetadataSource>>
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface UrlValidationResult {
  valid: boolean
  /** Parsed + normalized URL string (present when valid) */
  normalizedUrl?: string
  error?: string
  /** Specific validation failure code */
  code?: UrlValidationErrorCode
}

export type UrlValidationErrorCode =
  | 'INVALID_FORMAT'
  | 'UNSAFE_PROTOCOL'
  | 'PRIVATE_IP'
  | 'LOCALHOST'
  | 'TOO_LONG'
  | 'EMPTY'
  | 'INVALID_TLD'

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

export interface NormalizationResult {
  /** Final normalized URL */
  url: string
  /** Changes applied during normalization */
  changes: NormalizationChange[]
}

export type NormalizationChange =
  | 'lowercased_scheme'
  | 'lowercased_host'
  | 'removed_default_port'
  | 'removed_trailing_slash'
  | 'removed_utm_params'
  | 'removed_tracking_params'
  | 'resolved_relative_path'
  | 'removed_fragment'
  | 'removed_www'

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

export interface FetchResult {
  ok: boolean
  html?: string
  finalUrl?: string      // URL after redirects
  statusCode?: number
  contentType?: string
  error?: string
}

// ---------------------------------------------------------------------------
// Duplicate detection
// ---------------------------------------------------------------------------

export interface DuplicateCheckResult {
  isDuplicate: boolean
  /** ID of the existing campaign_urls row (if duplicate) */
  existingUrlId?: string
  /** The URL that matched */
  matchedUrl?: string
  /** How the duplicate was detected */
  matchType?: 'exact' | 'canonical' | 'normalized'
}

// ---------------------------------------------------------------------------
// Single URL ingestion
// ---------------------------------------------------------------------------

export interface IngestionOptions {
  /** Associate URL with this campaign */
  campaignId?: string
  /** Override title (skips extraction title) */
  title?: string
  /** Tags to attach */
  tags?: string[]
  /** Return the existing URL record instead of failing on duplicate */
  skipDuplicates?: boolean
  /** Run metadata extraction (default: true) */
  extractMetadata?: boolean
  /** Auto-generate a URL slug for short links */
  generateSlug?: boolean
  /** User ID — required when called outside of a Supabase auth context */
  userId?: string
}

export interface IngestionResult {
  success: boolean
  /** ID of the inserted / existing campaign_urls row */
  urlId?: string
  /** ID of the inserted extracted_content row */
  extractedContentId?: string
  isDuplicate: boolean
  /** Existing row ID when isDuplicate = true */
  existingUrlId?: string
  metadata?: ExtractedMetadata
  normalizedUrl?: string
  error?: string
  /** Original input URL */
  inputUrl: string
}

// ---------------------------------------------------------------------------
// Bulk ingestion
// ---------------------------------------------------------------------------

export interface BulkIngestionOptions extends IngestionOptions {
  /** Max concurrent fetches (default: 5) */
  concurrency?: number
  /** Milliseconds to wait between batches (default: 200) */
  batchDelayMs?: number
  /** Stop on first error (default: false) */
  failFast?: boolean
}

export interface BulkIngestionResult {
  total: number
  succeeded: number
  failed: number
  duplicates: number
  skipped: number
  results: IngestionResult[]
  durationMs: number
}

// ---------------------------------------------------------------------------
// Supabase row shapes (mirrors DB schema)
// ---------------------------------------------------------------------------

export interface CampaignUrlRow {
  id: string
  user_id: string
  campaign_id: string | null
  title: string
  original_url: string
  short_url: string | null
  slug: string | null
  clicks: number
  tags: string[]
  is_active: boolean
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface ExtractedContentRow {
  id: string
  user_id: string
  url_id: string | null
  source_url: string
  title: string | null
  description: string | null
  body: string | null
  author: string | null
  published_at: string | null
  og_image_url: string | null
  keywords: string[]
  raw_html: string | null
  metadata: Record<string, unknown>
  extracted_at: string
  created_at: string
  updated_at: string
}
