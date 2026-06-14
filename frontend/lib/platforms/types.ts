// =============================================================================
// Platform Registry — Shared Types
// Canonical type definitions for all 17 supported platforms.
// =============================================================================

// ---------------------------------------------------------------------------
// Platform identifiers
// ---------------------------------------------------------------------------

/** All supported platform IDs — the single source of truth */
export type AllPlatformId =
  // --- Existing social ---
  | 'twitter'
  | 'linkedin'
  | 'instagram'
  | 'facebook'
  | 'tiktok'
  // --- New social / microblog ---
  | 'bluesky'
  | 'mastodon'
  | 'misskey'
  | 'pixelfed'
  | 'tumblr'
  // --- Publishing ---
  | 'devto'
  | 'hashnode'
  | 'reddit'
  // --- Bookmarking / read-later ---
  | 'diigo'
  | 'raindrop'
  | 'pocket'
  | 'instapaper'

export type PlatformCategory = 'social' | 'publishing' | 'bookmarking'

export type AuthType =
  | 'oauth2'         // Standard OAuth 2.0 (most platforms)
  | 'oauth1'         // OAuth 1.0a (Tumblr legacy)
  | 'apikey'         // Simple bearer/header API key
  | 'app_password'   // Bluesky app passwords (handle + app-specific password)
  | 'xauth'          // xAuth username+password (Instapaper legacy)

// ---------------------------------------------------------------------------
// Credential field descriptor
// ---------------------------------------------------------------------------

export interface CredentialField {
  /** Storage key in platform_connections.metadata or encrypted columns */
  key: string
  /** Human-readable label */
  label: string
  /** HTML input type */
  type: 'text' | 'password' | 'url' | 'email'
  placeholder?: string
  required: boolean
  /** Shown below the input as hint text */
  helpText?: string
  /** True = must be stored in encrypted column (access_token_enc / refresh_token_enc) */
  encrypted: boolean
}

// ---------------------------------------------------------------------------
// Platform capabilities
// ---------------------------------------------------------------------------

export interface PlatformCapabilities {
  /** Short-form posts (≤ 500 chars) */
  shortPost: boolean
  /** Long-form posts (> 500 chars) */
  longPost: boolean
  /** Full articles with markdown/HTML */
  article: boolean
  /** Image-focused captions */
  imageCaption: boolean
  /** Threaded posts (reply chains) */
  thread: boolean
  /** Save / bookmark a URL */
  bookmark: boolean
  /** Uses # hashtags */
  hashtags: boolean
  /** Uses plain tag system (non-hashtag) */
  tags: boolean
  /** Requires an instance/server URL */
  requiresInstanceUrl: boolean
  /** Supports media attachments */
  media: boolean
}

// ---------------------------------------------------------------------------
// AI generation config per platform
// ---------------------------------------------------------------------------

export interface PlatformAiConfig {
  /** How this platform labels its content unit (post, note, article, bookmark) */
  contentLabel: string
  /** Hard character limit (0 = no practical limit) */
  charLimit: number
  /** Recommended hashtag / tag count for AI generation */
  tagCount: number
  /** Default generation tone */
  toneDefault: string
  /** Audience description injected into prompts */
  audienceNote: string
  /** Emoji usage level for prompts */
  emojiStyle: 'none' | 'minimal' | 'moderate' | 'expressive'
  /** Which AI generator this platform primarily maps to */
  promptCategory: 'social_post' | 'article_content' | 'bookmark_note'
}

// ---------------------------------------------------------------------------
// UI display config
// ---------------------------------------------------------------------------

export interface PlatformUiConfig {
  /** Full display name */
  displayName: string
  /** Short abbreviation for icon fallback (2–4 chars) */
  abbrev: string
  /** Tailwind light-mode badge/icon classes */
  lightClass: string
  /** Tailwind dark-mode badge/icon classes */
  darkClass: string
  /** Hex accent colour (for charts / analytics) */
  accentHex: string
}

// ---------------------------------------------------------------------------
// Full platform config shape
// ---------------------------------------------------------------------------

export interface PlatformConfig {
  id: AllPlatformId
  category: PlatformCategory
  authType: AuthType
  /** Ordered list of fields shown in the "Connect" modal */
  credentialFields: CredentialField[]
  capabilities: PlatformCapabilities
  aiConfig: PlatformAiConfig
  ui: PlatformUiConfig
  /** Link to the platform's API / developer docs */
  docsUrl?: string
}

// ---------------------------------------------------------------------------
// Runtime connection shape (extends DB row for UI use)
// ---------------------------------------------------------------------------

export interface PlatformConnection {
  id: string
  userId: string
  platform: AllPlatformId
  accountName: string
  accountHandle: string
  instanceUrl?: string        // Mastodon / Misskey / Pixelfed
  platformUserId?: string     // platform-assigned user ID
  status: 'connected' | 'error' | 'disconnected'
  postsPublished: number
  lastSyncAt?: string
  tokenExpiresAt?: string
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

// ---------------------------------------------------------------------------
// Per-platform user settings
// ---------------------------------------------------------------------------

export interface PlatformSettings {
  platformId: AllPlatformId
  defaultHashtags: string[]
  defaultTone: string
  defaultCta: string
  contentStyle: 'concise' | 'detailed' | 'listicle' | 'storytelling'
  articleLengthPreference: 'short' | 'medium' | 'long'
  includeEmoji: boolean
  autoApprove: boolean
}

// ---------------------------------------------------------------------------
// Content shape produced for a platform
// ---------------------------------------------------------------------------

export interface PlatformContent {
  platform: AllPlatformId
  contentType: string
  body: string
  hashtags: string[]
  characterCount: number
  withinLimit: boolean
  mediaRequired: boolean
  metadata: Record<string, unknown>
}
