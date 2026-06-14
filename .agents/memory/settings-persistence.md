---
name: Settings persistence
description: How platform AI settings and workspace profile are saved/loaded from Supabase
---

## Table
`public.settings` — one row per (user_id, key) with JSONB value. Unique constraint on (user_id, key). RLS enabled.

## Keys used
- `"workspace_profile"` → `{ orgName, websiteUrl, timezone, contactEmail }`
- `"platform_defaults"` → `Record<platformId, { tone, style, hashtags, cta, includeEmoji, autoApprove }>`

## Service
`frontend/lib/services/settings/index.ts`
- `loadSettings<T>(supabase, userId, key, fallback)` — uses `.maybeSingle()`, returns fallback if no row
- `saveSettings<T>(supabase, userId, key, value)` — upserts on (user_id, key) conflict

## Settings page load order
1. Get user from `supabase.auth.getUser()`
2. `Promise.all([loadSettings profile, loadSettings platform_defaults])`
3. Merge saved platform settings over code defaults (preserves per-platform tone/emoji defaults for unsaved platforms)

**Why:** The settings page was previously local-state only. DB persistence lets the generate route read the user's saved tone/style/cta/emoji and apply them to every AI generation.

## Generate route reads settings
```ts
const platformDefaults = await loadSettings<PlatformDefaults>(supabase, userId, 'platform_defaults', {})
// then per platform:
const pSettings = { ...DEFAULT_PLATFORM_SETTING, ...platformBaseDefaults, ...(platformDefaults[platform] ?? {}) }
```
