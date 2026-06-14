// =============================================================================
// URL Services — Barrel Export
// =============================================================================

// Types
export type {
  ExtractedMetadata,
  MetadataSource,
  UrlValidationResult,
  UrlValidationErrorCode,
  NormalizationResult,
  NormalizationChange,
  FetchResult,
  DuplicateCheckResult,
  IngestionOptions,
  IngestionResult,
  BulkIngestionOptions,
  BulkIngestionResult,
  CampaignUrlRow,
  ExtractedContentRow,
} from './types'

// Validation
export { validateUrl, validateUrls, partitionUrls } from './validator'

// Normalization
export { normalizeUrl, toComparisonKey, generateSlug } from './normalizer'

// Fetching
export { fetchUrl, resolveRedirects } from './fetcher'

// Metadata extraction
export { extractMetadata } from './extractor'

// Duplicate detection
export { checkDuplicate, checkDuplicates } from './deduplicator'

// Ingestion (primary API)
export { ingestUrl, ingestUrls } from './ingestion'
