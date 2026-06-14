// =============================================================================
// Prompt Templates
// Platform-specific, context-aware prompts for all 17 platforms.
// =============================================================================

import type {
  SocialPlatform,
  ContentContext,
  ContentTone,
  ContentType,
  SocialPostOptions,
  DescriptionOptions,
  SummaryOptions,
  HashtagOptions,
  TitleOptions,
} from './types'

// ---------------------------------------------------------------------------
// Platform constraints — all 17 platforms
// ---------------------------------------------------------------------------

export const PLATFORM_LIMITS: Record<SocialPlatform, {
  charLimit: number
  hashtagCount: number
  emojiStyle: string
  audienceNote: string
  toneDefault: ContentTone
}> = {
  // --- Existing social ---
  twitter: {
    charLimit:    280,
    hashtagCount: 2,
    emojiStyle:   'minimal',
    audienceNote: 'Twitter/X users who value brevity and wit',
    toneDefault:  'casual',
  },
  linkedin: {
    charLimit:    3000,
    hashtagCount: 5,
    emojiStyle:   'professional',
    audienceNote: 'B2B professionals, executives, and industry peers',
    toneDefault:  'professional',
  },
  instagram: {
    charLimit:    2200,
    hashtagCount: 15,
    emojiStyle:   'expressive',
    audienceNote: 'visual-first Instagram audience focused on lifestyle and aesthetics',
    toneDefault:  'conversational',
  },
  facebook: {
    charLimit:    63206,
    hashtagCount: 3,
    emojiStyle:   'moderate',
    audienceNote: 'mixed-age Facebook audience that values conversation and sharing',
    toneDefault:  'conversational',
  },
  tiktok: {
    charLimit:    2200,
    hashtagCount: 6,
    emojiStyle:   'expressive',
    audienceNote: 'Gen-Z and millennial TikTok audience who love trends, hooks, and energy',
    toneDefault:  'casual',
  },
  // --- New social / microblog ---
  bluesky: {
    charLimit:    300,
    hashtagCount: 2,
    emojiStyle:   'minimal',
    audienceNote: 'Bluesky users who value open, chronological social media and genuine conversation',
    toneDefault:  'casual',
  },
  mastodon: {
    charLimit:    500,
    hashtagCount: 4,
    emojiStyle:   'moderate',
    audienceNote: 'Mastodon users who value open-source, community-driven, and decentralised social media',
    toneDefault:  'conversational',
  },
  misskey: {
    charLimit:    3000,
    hashtagCount: 5,
    emojiStyle:   'expressive',
    audienceNote: 'Misskey users who enjoy expressive, feature-rich decentralised social networking',
    toneDefault:  'casual',
  },
  pixelfed: {
    charLimit:    2200,
    hashtagCount: 10,
    emojiStyle:   'expressive',
    audienceNote: 'Pixelfed users who value privacy-focused, image-first social sharing',
    toneDefault:  'conversational',
  },
  tumblr: {
    charLimit:    4096,
    hashtagCount: 10,
    emojiStyle:   'expressive',
    audienceNote: 'creative and expressive Tumblr users who appreciate aesthetic content and personal blogging',
    toneDefault:  'casual',
  },
  // --- Publishing ---
  devto: {
    charLimit:    5000,
    hashtagCount: 4,
    emojiStyle:   'minimal',
    audienceNote: 'software developers and technical professionals on DEV.to',
    toneDefault:  'educational',
  },
  hashnode: {
    charLimit:    5000,
    hashtagCount: 5,
    emojiStyle:   'minimal',
    audienceNote: 'technical developers and engineering-focused readers on Hashnode',
    toneDefault:  'educational',
  },
  reddit: {
    charLimit:    40000,
    hashtagCount: 0,
    emojiStyle:   'minimal',
    audienceNote: 'Reddit community members who value authentic, community-specific discussion',
    toneDefault:  'conversational',
  },
  // --- Bookmarking ---
  diigo: {
    charLimit:    500,
    hashtagCount: 5,
    emojiStyle:   'none',
    audienceNote: 'research-oriented Diigo users who annotate and organise web content',
    toneDefault:  'professional',
  },
  raindrop: {
    charLimit:    500,
    hashtagCount: 5,
    emojiStyle:   'none',
    audienceNote: 'power users who curate and organise web content in Raindrop.io collections',
    toneDefault:  'professional',
  },
  pocket: {
    charLimit:    200,
    hashtagCount: 5,
    emojiStyle:   'none',
    audienceNote: 'Pocket users who save content for focused, distraction-free reading later',
    toneDefault:  'professional',
  },
  instapaper: {
    charLimit:    200,
    hashtagCount: 0,
    emojiStyle:   'none',
    audienceNote: 'Instapaper users who curate long-form articles for later reading',
    toneDefault:  'professional',
  },
}

// ---------------------------------------------------------------------------
// Shared context block
// ---------------------------------------------------------------------------

function buildContextBlock(ctx: ContentContext): string {
  const lines: string[] = []

  if (ctx.title)       lines.push(`Title: ${ctx.title}`)
  if (ctx.author)      lines.push(`Author: ${ctx.author}`)
  if (ctx.siteName)    lines.push(`Source: ${ctx.siteName}`)
  if (ctx.publishDate) lines.push(`Published: ${ctx.publishDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`)
  if (ctx.sourceUrl)   lines.push(`URL: ${ctx.sourceUrl}`)
  if (ctx.keywords?.length) lines.push(`Keywords: ${ctx.keywords.slice(0, 8).join(', ')}`)

  const header = lines.length > 0 ? `${lines.join('\n')}\n\n` : ''

  const maxLen = 3000
  const body = ctx.sourceText.length > maxLen
    ? ctx.sourceText.slice(0, maxLen) + '\n[... content truncated ...]'
    : ctx.sourceText

  return `${header}Content:\n${body}`
}

function toneInstruction(tone?: ContentTone): string {
  const map: Record<ContentTone, string> = {
    professional:  'Write in a professional, authoritative tone. Use industry-standard language.',
    casual:        'Write in a casual, friendly tone. Use everyday language and contractions.',
    humorous:      'Write with light humour and wit. Keep it fun but relevant.',
    inspirational: 'Write in an inspiring, uplifting tone. Motivate the reader to take action.',
    educational:   'Write in a clear, informative tone. Focus on teaching and insight.',
    urgent:        'Write with a sense of urgency. Emphasise time-sensitivity and importance.',
    conversational:'Write conversationally, as if talking to a friend. Be relatable and warm.',
  }
  return tone ? map[tone] : ''
}

// ---------------------------------------------------------------------------
// Social Post Prompts
// ---------------------------------------------------------------------------

export function buildSocialPostPrompt(
  ctx: ContentContext,
  options: SocialPostOptions
): string {
  const platform  = PLATFORM_LIMITS[options.platform]
  const tone      = options.tone ?? platform.toneDefault
  const charLimit = options.enforceCharLimit !== false ? platform.charLimit : null
  const ct        = options.contentType ?? 'post'
  const emoji     = options.includeEmoji !== false

  const contextBlock = buildContextBlock(ctx)
  const toneBlock    = toneInstruction(tone)

  const platformRules: Record<SocialPlatform, string> = {
    // --- Existing ---
    twitter: `
- Maximum ${platform.charLimit} characters (including spaces, NOT counting the URL separately)
- Lead with the most interesting point — no preamble
- One clear idea per tweet
- ${options.includeHashtags !== false ? `Add ${platform.hashtagCount} relevant hashtags AT THE END` : 'No hashtags'}
- ${emoji ? 'Use 1–2 strategic emojis maximum' : 'No emojis'}
- Optional: end with a question or provocation to drive engagement`,

    linkedin: `
- Write ${ct === 'post' ? '150–300 words' : '80–150 words'} for maximum engagement
- Start with a strong hook — a bold statement, surprising fact, or question
- Use short paragraphs (2–3 sentences each) for readability
- ${emoji ? 'Use emojis sparingly as visual breaks (max 3)' : 'No emojis'}
- Add a thought-provoking question or call-to-action at the end
- ${options.includeHashtags !== false ? `End with ${platform.hashtagCount} relevant hashtags on a new line` : 'No hashtags'}`,

    instagram: `
- Start with a strong first line that stops the scroll (visible before "more")
- Write 3–5 short paragraphs, each with line breaks for readability
- ${emoji ? 'Use emojis liberally to add personality and visual texture' : 'Minimal emojis only'}
- Include a clear call-to-action (e.g. "Save this post", "Tag a friend", "Link in bio")
- ${options.includeHashtags !== false ? `Add ${platform.hashtagCount} hashtags — mix of broad and niche — at the END separated by a line break` : 'No hashtags'}
- Maximum ${platform.charLimit} characters`,

    facebook: `
- Write a conversational, shareable post (100–250 words optimal)
- Ask a question to encourage comments
- ${emoji ? 'Use a few friendly emojis' : 'No emojis'}
- ${options.includeHashtags !== false ? `Add ${platform.hashtagCount} hashtags maximum` : 'No hashtags'}
- Include a clear call-to-action (share, comment, or visit link)`,

    tiktok: `
- Lead with a hook in the FIRST sentence that demands attention (starts with a question, bold claim, or "POV:")
- Keep it high-energy and punchy
- Write for someone watching while multitasking
- ${emoji ? 'Use expressive emojis throughout' : 'No emojis'}
- ${options.includeHashtags !== false ? `Add ${platform.hashtagCount} trending-style hashtags at the end` : 'No hashtags'}
- Maximum ${platform.charLimit} characters`,

    // --- New social / microblog ---
    bluesky: `
- Maximum ${platform.charLimit} characters — every character counts
- Lead with the most interesting idea, no preamble
- Write in a genuine, human voice — Bluesky values authenticity over marketing polish
- ${options.includeHashtags !== false ? `Add ${platform.hashtagCount} relevant hashtags AT THE END` : 'No hashtags'}
- ${emoji ? 'Use 1 emoji maximum' : 'No emojis'}
- Optional: end with a question to spark replies`,

    mastodon: `
- Maximum ${platform.charLimit} characters
- Write as part of a community, not as a broadcaster — be conversational
- Avoid corporate-speak; Mastodon users value authenticity
- ${emoji ? 'Use a few friendly emojis' : 'No emojis'}
- ${options.includeHashtags !== false ? `Add ${platform.hashtagCount} relevant hashtags AT THE END (hashtags are searchable on Mastodon)` : 'No hashtags'}
- Optional: use a content warning (CW) label for sensitive topics`,

    misskey: `
- Up to ${platform.charLimit} characters (notes can be longer here)
- Expressive and personal — Misskey culture celebrates creativity
- ${emoji ? 'Use custom and standard emojis freely' : 'No emojis'}
- ${options.includeHashtags !== false ? `Add ${platform.hashtagCount} relevant hashtags` : 'No hashtags'}
- Can include reactions and casual commentary`,

    pixelfed: `
- Image-focused caption — assume an image will accompany this post
- Start with a compelling first line that describes or contextualises the visual
- ${emoji ? 'Use emojis to add personality and warmth' : 'Minimal emojis only'}
- ${options.includeHashtags !== false ? `Add ${platform.hashtagCount} hashtags — mix of broad and niche — at the END` : 'No hashtags'}
- Maximum ${platform.charLimit} characters
- Include a call-to-action (e.g. "Double tap if you agree", "Share your thoughts below")`,

    tumblr: `
- Creative and expressive — Tumblr celebrates personality, fandoms, and aesthetic
- Can be whimsical, earnest, or analytical depending on the topic
- ${emoji ? 'Use emojis to match the vibe' : 'No emojis'}
- Write up to ${platform.charLimit} characters
- Add relevant tags at the end (space-separated, NO # symbol — Tumblr uses plain tags)
- DO NOT prefix tags with #`,

    // --- Publishing ---
    devto: `
- Write a compelling article intro / summary for DEV.to (${platform.charLimit} chars max)
- Technical and informative tone — developers want substance, not hype
- ${emoji ? 'Use minimal technical emojis (e.g. 🚀, 💡)' : 'No emojis'}
- Start with the problem being solved or the concept being introduced
- End with what the reader will learn or gain
- ${options.includeHashtags !== false ? `Include ${platform.hashtagCount} relevant tags (without # — DEV.to uses plain tags)` : 'No tags'}`,

    hashnode: `
- Write an article introduction or summary for Hashnode (${platform.charLimit} chars max)
- Developer-focused, educational tone — emphasise technical depth and practical value
- ${emoji ? 'Use 1–2 appropriate tech emojis' : 'No emojis'}
- Hook the reader with a clear problem statement or insight in the first two sentences
- ${options.includeHashtags !== false ? `Include ${platform.hashtagCount} relevant tags (without # — Hashnode uses plain tags)` : 'No tags'}`,

    reddit: `
- Write a Reddit post body (${ct === 'post' ? 'full text post' : 'intro paragraph'})
- Tone must be authentic — Reddit hates obvious marketing or self-promotion
- Be direct, provide real value, and acknowledge the community context
- Use markdown formatting where appropriate (e.g. **bold**, bullet lists)
- Write as a genuine community member, not a brand
- NO hashtags — Reddit does not use hashtags
- Optional: end with a genuine question to invite discussion`,

    // --- Bookmarking ---
    diigo: `
- Write a concise bookmark annotation for Diigo (max ${platform.charLimit} chars)
- Focus on WHY this content is valuable for research or professional reference
- Be factual and specific — mention the key insight, technique, or data point
- No emojis, no marketing language
- ${options.includeHashtags !== false ? `Suggest ${platform.hashtagCount} plain tags (no # symbol) for organisation` : 'No tags'}`,

    raindrop: `
- Write a bookmark description for Raindrop.io (max ${platform.charLimit} chars)
- Explain what this URL contains and why someone would return to it later
- Be concise and informative — think of it as a personal note to your future self
- No emojis, no marketing language
- ${options.includeHashtags !== false ? `Suggest ${platform.hashtagCount} plain tags (no # symbol) for collection organisation` : 'No tags'}`,

    pocket: `
- Write a brief save note for Pocket (max ${platform.charLimit} chars)
- Summarise the main topic in one clear sentence
- Mention who would benefit from reading this
- No emojis, no fluff
- ${options.includeHashtags !== false ? `Suggest ${platform.hashtagCount} plain tags for filtering` : 'No tags'}`,

    instapaper: `
- Write a brief note for saving to Instapaper (max ${platform.charLimit} chars)
- One clear sentence: what is this and why save it?
- Strictly factual and concise
- No emojis, no hashtags`,
  }

  const ctaBlock = options.cta
    ? `\n\nCall-to-action to include: "${options.cta}"`
    : ''

  const customBlock = ctx.customInstructions
    ? `\n\nAdditional instructions: ${ctx.customInstructions}`
    : ''

  const limitBlock = charLimit
    ? `\n\nIMPORTANT: The final post MUST be under ${charLimit} characters.`
    : ''

  return `You are an expert content writer specialising in ${options.platform} content.

${toneBlock}

Platform rules for ${options.platform.toUpperCase()}:${platformRules[options.platform]}

Your audience: ${platform.audienceNote}

---
SOURCE MATERIAL:
${contextBlock}
---
${ctaBlock}${customBlock}${limitBlock}

Write ONLY the post content. No explanations, no "Here's your post:" preamble. Output the text directly.`
}

// ---------------------------------------------------------------------------
// Hashtag / Tag Prompts
// ---------------------------------------------------------------------------

export function buildHashtagPrompt(
  ctx: ContentContext,
  options: HashtagOptions
): string {
  const platform  = PLATFORM_LIMITS[options.platform]
  const count     = options.count ?? platform.hashtagCount
  const contextBlock = buildContextBlock(ctx)

  const platformNotes: Record<SocialPlatform, string> = {
    twitter:    'Use 1–3 highly specific, moderately popular hashtags. Avoid overused generic tags.',
    linkedin:   'Use professional, industry-specific hashtags. Mix of broad (e.g. #Marketing) and niche.',
    instagram:  'Mix broad (1M+ posts), mid-tier (100K–1M posts), and niche (<100K posts) hashtags.',
    facebook:   'Use 1–3 well-known, broad hashtags. Facebook hashtags are less impactful than other platforms.',
    tiktok:     'Include trending tags, FYP-boosting tags, and niche community tags.',
    bluesky:    'Use 1–2 highly relevant hashtags. Bluesky users prefer clean, minimal tagging.',
    mastodon:   'Use CamelCase hashtags (e.g. #OpenSource not #opensource) — they are searchable across instances.',
    misskey:    'Mix trending and niche hashtags. Misskey communities are topic-specific.',
    pixelfed:   'Mix visual aesthetic tags (e.g. #Photography) with topic tags. Similar strategy to Instagram.',
    tumblr:     'Use plain tags (no # symbol). Tumblr tags are informal — can include spaces and full phrases.',
    devto:      'Use plain tags (no #) matching DEV.to\'s official tag taxonomy (e.g. javascript, webdev, tutorial).',
    hashnode:   'Use plain tags (no #) that match Hashnode\'s tag taxonomy for maximum discoverability.',
    reddit:     'Reddit does not use hashtags. Return an empty array.',
    diigo:      'Use plain organisational tags (no #). Focus on subject area, content type, and project.',
    raindrop:   'Use plain collection-friendly tags (no #). Descriptive, reusable across bookmarks.',
    pocket:     'Use plain tags (no #) for filtering saved items. Keep them short and reusable.',
    instapaper: 'Instapaper does not support tags. Return an empty array.',
  }

  if (count === 0) {
    return `Output an empty JSON array: []`
  }

  return `You are a content tagging specialist for ${options.platform}.

Platform guidance: ${platformNotes[options.platform]}

Generate exactly ${count} relevant tags for the following content.
${options.includeBroad !== false ? '- Include some broad/popular tags for reach.' : ''}
${options.includeNiche !== false ? '- Include some niche/specific tags for relevance.' : ''}

---
SOURCE MATERIAL:
${contextBlock}
---

Output ONLY a JSON array of tag strings. Include # prefix only if the platform uses hashtags (Twitter, LinkedIn, Instagram, Facebook, TikTok, Bluesky, Mastodon, Misskey, Pixelfed).
Example: ["#Marketing", "#ContentStrategy", "#SocialMedia"]

No explanation, no markdown code fences, just the raw JSON array.`
}

// ---------------------------------------------------------------------------
// Bookmark Description Prompts
// ---------------------------------------------------------------------------

export function buildDescriptionPrompt(
  ctx: ContentContext,
  options: DescriptionOptions
): string {
  const targetWords = options.targetWords ?? 30
  const style       = options.style ?? 'sentence'
  const contextBlock = buildContextBlock(ctx)
  const toneBlock    = toneInstruction(ctx.tone)

  const styleInstruction = style === 'bullets'
    ? `Format as 2–3 concise bullet points. Each bullet: one key insight.`
    : `Write ${targetWords}–${targetWords + 10} words in 1–2 clear sentences. No fluff.`

  return `You are a content curator writing bookmark descriptions for a social media URL library.

A bookmark description should instantly tell someone WHY this link is worth reading.
${toneBlock}

${styleInstruction}

Focus on: the main insight, who should read it, and what they will learn or gain.
Do NOT start with "This article…" or "This post…"

---
SOURCE MATERIAL:
${contextBlock}
---

Output ONLY the description text. No preamble.`
}

// ---------------------------------------------------------------------------
// Article Summary Prompts
// ---------------------------------------------------------------------------

export function buildSummaryPrompt(
  ctx: ContentContext,
  options: SummaryOptions
): string {
  const format     = options.format ?? 'bullets'
  const maxPoints  = options.maxPoints ?? 5
  const contextBlock = buildContextBlock(ctx)
  const toneBlock    = toneInstruction(ctx.tone)

  const formatInstructions: Record<string, string> = {
    bullets: `Write exactly ${maxPoints} bullet points. Each bullet:
- Starts with a bold key phrase (e.g. **Key insight:** …)
- Is 15–25 words
- Captures one distinct, actionable insight
- Uses active voice`,

    paragraph: `Write a single coherent paragraph of 80–120 words that summarises the core message, main arguments, and key takeaways. Use active voice and clear transitions.`,

    tldr: `Write a TL;DR in 2–3 sentences (max 50 words total). Capture the essential point someone needs to know if they read nothing else.`,
  }

  return `You are an expert content analyst creating summaries for busy professionals.

${toneBlock}

${formatInstructions[format]}

Do NOT include your opinion. Do NOT use phrases like "The author argues…" or "This article…"
Extract only what is actually stated in the content.

---
SOURCE MATERIAL:
${contextBlock}
---

Output ONLY the summary. No preamble, no meta-commentary.`
}

// ---------------------------------------------------------------------------
// Alternative Titles Prompts
// ---------------------------------------------------------------------------

export function buildTitlePrompt(
  ctx: ContentContext,
  options: TitleOptions
): string {
  const count     = options.variants ?? 5
  const purpose   = options.purpose ?? 'general'
  const maxLen    = options.maxLength ?? 80
  const contextBlock = buildContextBlock(ctx)

  const purposeNotes: Record<string, string> = {
    seo:      'Optimised for search engines: include primary keyword near the start, clear topic signal, 50–60 chars ideal.',
    social:   'Optimised for social media shares: curiosity-driven, emotional, or surprising. Makes people want to click.',
    email:    'Optimised for email subject lines: personal, urgent, benefit-driven. Avoid spam trigger words.',
    'ab-test':'Create varied styles: one direct, one question-form, one curiosity-gap, one benefit-driven, one bold claim.',
    general:  'Varied styles: informational, question-based, listicle, how-to, and statement formats.',
  }

  return `You are a headline copywriter and SEO specialist.

Original title: "${ctx.title ?? 'Untitled'}"
Purpose: ${purposeNotes[purpose]}
Max length: ${maxLen} characters per title.

Generate exactly ${count} alternative titles for the content below.

Rules:
- Each title must be distinct in structure and angle
- No clickbait that misrepresents the content
- Maximum ${maxLen} characters each
- Do NOT start multiple titles with the same word

---
SOURCE MATERIAL:
${contextBlock}
---

Output ONLY a JSON array of title strings. Example:
["Title One", "Title Two", "Title Three"]

No explanation, no markdown code fences, just the raw JSON array.`
}
