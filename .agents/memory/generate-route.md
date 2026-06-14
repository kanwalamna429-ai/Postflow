---
name: Generate route enrichment
description: What the /api/generate route does and what it saves to the DB
---

## Flow
1. Load `extracted_content` for the URL (body, title, description, og_image_url, keywords, source_url)
2. Load `platform_defaults` from `public.settings` (user's saved AI settings)
3. AI-rewrite title once — `buildTitlePrompt(ctx, { purpose: 'social', variants: 1 })` → parse JSON array → take first
4. AI-rewrite description once — `generateDescription(ctx, { targetWords: 50 })`
5. For each platform: merge DEFAULT_PLATFORM_SETTING + platform code defaults + user DB settings → pSettings
6. Generate platform-specific post body using `generateSocialPost` with pSettings.tone/cta/includeEmoji
7. Append custom hashtags from pSettings.hashtags to generated hashtags

## DB writes per platform
- `generated_content` — content, hashtags, is_approved (from autoApprove), metadata with og_image/rewritten_title/rewritten_description/source_url/char_limit/tone/style
- `scheduled_posts` — scheduled_at = NOW() (for immediate publish), status = 'pending', metadata mirrors generated_content

## Response shape
```ts
{
  success: true,
  rewrittenTitle: string | null,
  rewrittenDescription: string | null,
  ogImage: string | null,
  sourceUrl: string | null,
  posts: [{ platform, content, hashtags, charLimit, generatedContentId, scheduledPostId, connectionId, error? }]
}
```

## Guard
All AI generation is gated on `process.env.GEMINI_API_KEY`. Without it, content falls back to `rewrittenTitle ?? sourceUrl`.
