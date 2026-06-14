---
name: Content page patterns
description: Patterns required to avoid runtime and TypeScript errors in the content/settings pages
---

## Supabase client in "use client" components
Always use the `getSupabase()` wrapper pattern:
```ts
function getSupabase(): SupabaseClient | null {
  try { return createClient() } catch { return null }
}
```
Never call `createClient()` directly at module scope — it throws during SSR if env vars are absent.

## Platform registry lookup
- `PLATFORM_REGISTRY` is `PlatformConfig[]` — cannot be keyed by platform id
- `PLATFORM_BY_ID` is `Record<string, PlatformConfig>` — use this for id-based lookups
- Platform display name is `cfg.ui.displayName`, not `cfg.name`

**How to apply:** Any component that maps over platform strings should import `PLATFORM_BY_ID` and look up via `PLATFORM_BY_ID[platformId]`.

## PlatformDefaultSettings spread in generate route
When building per-platform settings, avoid specifying the same key twice in an object literal:
```ts
// WRONG — TypeScript TS2783
const ps = { ...defaults, tone: x, includeEmoji: y, ...userSettings }
// where defaults also has tone/includeEmoji

// CORRECT — separate the base override step
const base = { tone: x, includeEmoji: y }
const ps = { ...defaults, ...base, ...userSettings }
```
