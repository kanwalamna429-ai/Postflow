// =============================================================================
// Settings Service
// Thin wrapper around public.settings (key/value store per user).
// Keys used by this app:
//   "workspace_profile"  → WorkspaceProfile
//   "platform_defaults"  → Record<platformId, PlatformDefaultSettings>
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkspaceProfile {
  orgName:      string
  websiteUrl:   string
  timezone:     string
  contactEmail: string
}

export interface PlatformDefaultSettings {
  tone:          string
  style:         string
  hashtags:      string   // space-separated default hashtags/tags
  cta:           string   // call-to-action text
  includeEmoji:  boolean
  autoApprove:   boolean
  maxHashtags:   number   // max hashtag count to generate (0 = use platform default)
}

export type PlatformDefaults = Record<string, PlatformDefaultSettings>

export const DEFAULT_PROFILE: WorkspaceProfile = {
  orgName:      '',
  websiteUrl:   '',
  timezone:     'UTC',
  contactEmail: '',
}

export const DEFAULT_PLATFORM_SETTING: PlatformDefaultSettings = {
  tone:         'professional',
  style:        'concise',
  hashtags:     '',
  cta:          '',
  includeEmoji: true,
  autoApprove:  false,
  maxHashtags:  0,
}

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

export async function loadSettings<T>(
  supabase: SupabaseClient,
  userId:   string,
  key:      string,
  fallback: T
): Promise<T> {
  const { data } = await supabase
    .from('settings')
    .select('value')
    .eq('user_id', userId)
    .eq('key', key)
    .maybeSingle()

  if (!data?.value) return fallback
  return data.value as T
}

// ---------------------------------------------------------------------------
// Save (upsert)
// ---------------------------------------------------------------------------

export async function saveSettings<T>(
  supabase: SupabaseClient,
  userId:   string,
  key:      string,
  value:    T
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('settings')
    .upsert({ user_id: userId, key, value }, { onConflict: 'user_id,key' })

  return { error: error?.message ?? null }
}
