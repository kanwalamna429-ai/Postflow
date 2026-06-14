// =============================================================================
// Platform Registry
// Canonical registry of all 17 supported platforms.
// Import from here — never directly from individual config files.
// =============================================================================

export type { AllPlatformId, PlatformCategory, AuthType, CredentialField,
  PlatformCapabilities, PlatformAiConfig, PlatformUiConfig, PlatformConfig,
  PlatformConnection, PlatformSettings, PlatformContent } from './types'

import { twitter }     from './config/twitter'
import { linkedin }    from './config/linkedin'
import { instagram }   from './config/instagram'
import { facebook }    from './config/facebook'
import { tiktok }      from './config/tiktok'
import { bluesky }     from './config/bluesky'
import { mastodon }    from './config/mastodon'
import { misskey }     from './config/misskey'
import { pixelfed }    from './config/pixelfed'
import { devto }       from './config/devto'
import { hashnode }    from './config/hashnode'
import { tumblr }      from './config/tumblr'
import { reddit }      from './config/reddit'
import { diigo }       from './config/diigo'
import { raindrop }    from './config/raindrop'
import { pocket }      from './config/pocket'
import { instapaper }  from './config/instapaper'
import type { AllPlatformId, PlatformCategory, PlatformConfig } from './types'

// ---------------------------------------------------------------------------
// Full registry — ordered by category then name (all 17 platforms)
// ---------------------------------------------------------------------------

export const PLATFORM_REGISTRY: PlatformConfig[] = [
  // Social
  twitter,
  linkedin,
  instagram,
  facebook,
  tiktok,
  bluesky,
  mastodon,
  misskey,
  pixelfed,
  tumblr,
  // Publishing
  devto,
  hashnode,
  reddit,
  // Bookmarking
  diigo,
  raindrop,
  pocket,
  instapaper,
]

/** Fast lookup by platform ID */
export const PLATFORM_BY_ID: Record<string, PlatformConfig> = Object.fromEntries(
  PLATFORM_REGISTRY.map((p) => [p.id, p])
)

/** Get config for a single platform (returns undefined for legacy platforms not in registry) */
export function getPlatformConfig(id: string): PlatformConfig | undefined {
  return PLATFORM_BY_ID[id]
}

/** All platform IDs by category */
export function getPlatformsByCategory(category: PlatformCategory): PlatformConfig[] {
  return PLATFORM_REGISTRY.filter((p) => p.category === category)
}

// ---------------------------------------------------------------------------
// Shared UI label + color maps for ALL 17 platforms
// Used by connections page, logs page, campaign cards, etc.
// ---------------------------------------------------------------------------

export const PLATFORM_LABELS: Record<AllPlatformId, string> = {
  // Existing
  twitter:    '𝕏 Twitter / X',
  linkedin:   'LinkedIn',
  instagram:  'Instagram',
  facebook:   'Facebook',
  tiktok:     'TikTok',
  // New social
  bluesky:    'Bluesky',
  mastodon:   'Mastodon',
  misskey:    'Misskey',
  pixelfed:   'Pixelfed',
  tumblr:     'Tumblr',
  // Publishing
  devto:      'DEV.to',
  hashnode:   'Hashnode',
  reddit:     'Reddit',
  // Bookmarking
  diigo:      'Diigo',
  raindrop:   'Raindrop.io',
  pocket:     'Pocket',
  instapaper: 'Instapaper',
}

/** Light-mode tailwind badge classes */
export const PLATFORM_LIGHT_CLASS: Record<AllPlatformId, string> = {
  twitter:    'bg-slate-100 text-slate-700',
  linkedin:   'bg-blue-100 text-blue-700',
  instagram:  'bg-pink-100 text-pink-700',
  facebook:   'bg-indigo-100 text-indigo-700',
  tiktok:     'bg-zinc-100 text-zinc-700',
  bluesky:    'bg-sky-100 text-sky-700',
  mastodon:   'bg-violet-100 text-violet-700',
  misskey:    'bg-teal-100 text-teal-700',
  pixelfed:   'bg-rose-100 text-rose-700',
  tumblr:     'bg-indigo-100 text-indigo-800',
  devto:      'bg-zinc-100 text-zinc-800',
  hashnode:   'bg-blue-100 text-blue-700',
  reddit:     'bg-orange-100 text-orange-700',
  diigo:      'bg-amber-100 text-amber-700',
  raindrop:   'bg-cyan-100 text-cyan-700',
  pocket:     'bg-red-100 text-red-700',
  instapaper: 'bg-slate-100 text-slate-700',
}

/** Dark-mode tailwind badge classes */
export const PLATFORM_DARK_CLASS: Record<AllPlatformId, string> = {
  twitter:    'dark:bg-slate-800 dark:text-slate-300',
  linkedin:   'dark:bg-blue-900/40 dark:text-blue-300',
  instagram:  'dark:bg-pink-900/40 dark:text-pink-300',
  facebook:   'dark:bg-indigo-900/40 dark:text-indigo-300',
  tiktok:     'dark:bg-zinc-800 dark:text-zinc-300',
  bluesky:    'dark:bg-sky-900/40 dark:text-sky-300',
  mastodon:   'dark:bg-violet-900/40 dark:text-violet-300',
  misskey:    'dark:bg-teal-900/40 dark:text-teal-300',
  pixelfed:   'dark:bg-rose-900/40 dark:text-rose-300',
  tumblr:     'dark:bg-indigo-900/40 dark:text-indigo-300',
  devto:      'dark:bg-zinc-800 dark:text-zinc-200',
  hashnode:   'dark:bg-blue-900/40 dark:text-blue-300',
  reddit:     'dark:bg-orange-900/40 dark:text-orange-300',
  diigo:      'dark:bg-amber-900/40 dark:text-amber-300',
  raindrop:   'dark:bg-cyan-900/40 dark:text-cyan-300',
  pocket:     'dark:bg-red-900/40 dark:text-red-300',
  instapaper: 'dark:bg-slate-800 dark:text-slate-300',
}

/** Short 2–4 char abbrev for icon fallback */
export const PLATFORM_ABBREV: Record<AllPlatformId, string> = {
  twitter:    '𝕏',
  linkedin:   'in',
  instagram:  'IG',
  facebook:   'fb',
  tiktok:     'TT',
  bluesky:    'BS',
  mastodon:   'MD',
  misskey:    'MK',
  pixelfed:   'PF',
  tumblr:     'TB',
  devto:      'DEV',
  hashnode:   'HN',
  reddit:     'RE',
  diigo:      'DG',
  raindrop:   'RD',
  pocket:     'PK',
  instapaper: 'IP',
}

/** Returns combined light + dark tailwind class string for a platform badge */
export function platformBadgeClass(id: string): string {
  const light = PLATFORM_LIGHT_CLASS[id as AllPlatformId] ?? 'bg-muted text-muted-foreground'
  const dark  = PLATFORM_DARK_CLASS[id as AllPlatformId]  ?? ''
  return `${light} ${dark}`
}
