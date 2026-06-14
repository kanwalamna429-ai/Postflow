// =============================================================================
// Metadata Extractor
// Priority chain: Open Graph → Twitter Cards → JSON-LD → Meta Tags → HTML
// Pure TypeScript — no DOM dependency, no external parser library.
// =============================================================================

import type { ExtractedMetadata, MetadataSource } from './types'

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Extracts all available metadata from raw HTML.
 * Each field is sourced from the highest-priority provider that has a value.
 */
export function extractMetadata(html: string, sourceUrl?: string): ExtractedMetadata {
  const og      = parseOpenGraph(html)
  const twitter = parseTwitterCards(html)
  const jsonLd  = parseJsonLd(html)
  const meta    = parseMetaTags(html)
  const htmlDoc = parseHtmlFallbacks(html)

  const field = makeFieldResolver(og, twitter, jsonLd, meta, htmlDoc)

  const title       = field('title',       ['og', 'twitter', 'json-ld', 'meta', 'html'])
  const description = field('description', ['og', 'twitter', 'json-ld', 'meta', 'html'])
  const image       = field('image',       ['og', 'twitter', 'json-ld', 'meta', 'html'])
  const canonical   = field('canonical',   ['og', 'json-ld', 'meta', 'html'])
  const siteName    = field('siteName',    ['og', 'json-ld', 'meta', 'html'])
  const author      = field('author',      ['json-ld', 'og', 'meta', 'html'])
  const publishDate = field('publishDate', ['json-ld', 'og', 'meta', 'html'])
  const keywords    = field('keywords',    ['json-ld', 'og', 'meta', 'html'])

  // Derive the "primary source" from title (most representative field)
  const primarySource: MetadataSource = title.source ?? 'html'

  const fieldSources: ExtractedMetadata['fieldSources'] = {}
  if (title.value)       fieldSources.title         = title.source
  if (description.value) fieldSources.description   = description.source
  if (image.value)       fieldSources.featuredImage = image.source
  if (canonical.value)   fieldSources.canonicalUrl  = canonical.source
  if (siteName.value)    fieldSources.siteName      = siteName.source
  if (author.value)      fieldSources.author        = author.source
  if (publishDate.value) fieldSources.publishDate   = publishDate.source
  if (keywords.value)    fieldSources.keywords      = keywords.source

  const publishDateParsed = parseDate(publishDate.value)

  return {
    title:        title.value       ?? undefined,
    description:  description.value ?? undefined,
    featuredImage: image.value      ?? undefined,
    canonicalUrl: canonical.value   ?? (sourceUrl ? cleanUrl(sourceUrl) : undefined),
    siteName:     siteName.value    ?? undefined,
    author:       author.value      ?? undefined,
    publishDate:  publishDateParsed ?? undefined,
    ogType:       og.type           ?? undefined,
    keywords:     parseKeywordList(keywords.value),
    locale:       og.locale         ?? undefined,
    twitterCard:  twitter.card      ?? undefined,
    jsonLd:       jsonLd.length > 0 ? jsonLd : undefined,
    primarySource,
    fieldSources,
  }
}

// ---------------------------------------------------------------------------
// Parser: Open Graph
// ---------------------------------------------------------------------------

interface OgData {
  title?: string; description?: string; image?: string; canonical?: string
  siteName?: string; type?: string; locale?: string; author?: string
  publishDate?: string
}

function parseOpenGraph(html: string): OgData {
  const data: OgData = {}

  const metaPattern = /<meta\s[^>]+>/gi
  let match: RegExpExecArray | null

  while ((match = metaPattern.exec(html)) !== null) {
    const tag = match[0]
    const property = getAttr(tag, 'property') ?? getAttr(tag, 'name') ?? ''
    const content   = getAttr(tag, 'content') ?? ''

    if (!property.startsWith('og:') && !property.startsWith('article:')) continue

    const key = property.toLowerCase()
    if (key === 'og:title')              data.title       = data.title       ?? clean(content)
    else if (key === 'og:description')   data.description = data.description ?? clean(content)
    else if (key === 'og:image')         data.image       = data.image       ?? cleanUrl(content)
    else if (key === 'og:url')           data.canonical   = data.canonical   ?? cleanUrl(content)
    else if (key === 'og:site_name')     data.siteName    = data.siteName    ?? clean(content)
    else if (key === 'og:type')          data.type        = data.type        ?? clean(content)
    else if (key === 'og:locale')        data.locale      = data.locale      ?? clean(content)
    else if (key === 'article:author')   data.author      = data.author      ?? clean(content)
    else if (key === 'article:published_time' || key === 'article:modified_time') {
      data.publishDate = data.publishDate ?? clean(content)
    }
  }

  return data
}

// ---------------------------------------------------------------------------
// Parser: Twitter Cards
// ---------------------------------------------------------------------------

interface TwitterData {
  title?: string; description?: string; image?: string; card?: string; site?: string
}

function parseTwitterCards(html: string): TwitterData {
  const data: TwitterData = {}
  const metaPattern = /<meta\s[^>]+>/gi
  let match: RegExpExecArray | null

  while ((match = metaPattern.exec(html)) !== null) {
    const tag  = match[0]
    const name = (getAttr(tag, 'name') ?? getAttr(tag, 'property') ?? '').toLowerCase()
    const content = getAttr(tag, 'content') ?? ''

    if (!name.startsWith('twitter:')) continue

    if (name === 'twitter:title')       data.title       = data.title       ?? clean(content)
    else if (name === 'twitter:description') data.description = data.description ?? clean(content)
    else if (name === 'twitter:image' || name === 'twitter:image:src') {
                                        data.image       = data.image       ?? cleanUrl(content)
    }
    else if (name === 'twitter:card')   data.card        = data.card        ?? clean(content)
    else if (name === 'twitter:site')   data.site        = data.site        ?? clean(content)
  }

  return data
}

// ---------------------------------------------------------------------------
// Parser: JSON-LD
// ---------------------------------------------------------------------------

type JsonLdBlob = Record<string, unknown>

function parseJsonLd(html: string): JsonLdBlob[] {
  const blobs: JsonLdBlob[] = []
  const scriptPattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let match: RegExpExecArray | null

  while ((match = scriptPattern.exec(html)) !== null) {
    try {
      const json = JSON.parse(match[1].trim())
      if (Array.isArray(json)) blobs.push(...json)
      else if (typeof json === 'object' && json !== null) blobs.push(json as JsonLdBlob)
    } catch { /* malformed JSON-LD — skip */ }
  }

  return blobs
}

interface JsonLdExtracted {
  title?: string; description?: string; image?: string
  siteName?: string; author?: string; publishDate?: string
  canonical?: string; keywords?: string
}

function extractFromJsonLd(blobs: JsonLdBlob[]): JsonLdExtracted {
  const data: JsonLdExtracted = {}

  // Priority types: Article, BlogPosting, NewsArticle, WebPage, Product, etc.
  const PRIORITY_TYPES = [
    'Article', 'BlogPosting', 'NewsArticle', 'TechArticle',
    'WebPage', 'WebSite', 'Product', 'Event',
  ]

  const sorted = [...blobs].sort((a, b) => {
    const aType = String(a['@type'] ?? '')
    const bType = String(b['@type'] ?? '')
    const aScore = PRIORITY_TYPES.findIndex((t) => aType.includes(t))
    const bScore = PRIORITY_TYPES.findIndex((t) => bType.includes(t))
    return (aScore === -1 ? 999 : aScore) - (bScore === -1 ? 999 : bScore)
  })

  for (const blob of sorted) {
    data.title       = data.title       ?? strField(blob, 'headline', 'name')
    data.description = data.description ?? strField(blob, 'description', 'abstract')
    data.image       = data.image       ?? imageField(blob, 'image', 'thumbnailUrl')
    data.canonical   = data.canonical   ?? strField(blob, 'url', 'mainEntityOfPage')
    data.author      = data.author      ?? authorField(blob)
    data.publishDate = data.publishDate ?? strField(blob, 'datePublished', 'dateModified')
    data.siteName    = data.siteName    ?? publisherField(blob)
    data.keywords    = data.keywords    ?? keywordsField(blob)
  }

  return data
}

// ---------------------------------------------------------------------------
// Parser: Standard Meta Tags
// ---------------------------------------------------------------------------

interface MetaTagData {
  title?: string; description?: string; author?: string
  keywords?: string; canonical?: string; siteName?: string
}

function parseMetaTags(html: string): MetaTagData {
  const data: MetaTagData = {}

  // <meta name="..." content="...">
  const metaPattern = /<meta\s[^>]+>/gi
  let match: RegExpExecArray | null

  while ((match = metaPattern.exec(html)) !== null) {
    const tag  = match[0]
    const name = (getAttr(tag, 'name') ?? '').toLowerCase()
    const content = getAttr(tag, 'content') ?? ''

    if (name === 'description')        data.description = data.description ?? clean(content)
    else if (name === 'author')        data.author      = data.author      ?? clean(content)
    else if (name === 'keywords')      data.keywords    = data.keywords    ?? clean(content)
    else if (name === 'title')         data.title       = data.title       ?? clean(content)
    else if (name === 'application-name' || name === 'site-name') {
                                       data.siteName    = data.siteName    ?? clean(content)
    }
    else if (name === 'pubdate' || name === 'publish-date' || name === 'dc.date') {
      /* not stored in this bucket — handled by other parsers */
    }
  }

  // <link rel="canonical" href="...">
  const canonicalPattern = /<link\s[^>]*rel=["']canonical["'][^>]*>/gi
  while ((match = canonicalPattern.exec(html)) !== null) {
    data.canonical = data.canonical ?? (cleanUrl(getAttr(match[0], 'href') ?? '') || undefined)
  }

  return data
}

// ---------------------------------------------------------------------------
// Parser: HTML fallbacks
// ---------------------------------------------------------------------------

interface HtmlFallbackData {
  title?: string; description?: string; canonical?: string
  siteName?: string; author?: string; publishDate?: string
  keywords?: string
}

function parseHtmlFallbacks(html: string): HtmlFallbackData {
  const data: HtmlFallbackData = {}

  // <title>
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)
  if (titleMatch) {
    data.title = clean(stripHtml(titleMatch[1]))
  }

  // First <h1>
  if (!data.title) {
    const h1Match = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)
    if (h1Match) data.title = clean(stripHtml(h1Match[1]))
  }

  // First substantial <p> as description fallback
  const pPattern = /<p[^>]*>([\s\S]*?)<\/p>/gi
  let pMatch: RegExpExecArray | null
  while ((pMatch = pPattern.exec(html)) !== null) {
    const text = clean(stripHtml(pMatch[1]))
    if (text && text.length >= 50) {
      data.description = text.slice(0, 300)
      break
    }
  }

  // <time datetime="...">
  const timeMatch = /<time[^>]+datetime=["']([^"']+)["']/i.exec(html)
  if (timeMatch) data.publishDate = timeMatch[1]

  // rel=author link or <a rel="author">
  const authorMatch = /<(?:link|a)\s[^>]*rel=["']author["'][^>]*>/.exec(html)
  if (authorMatch) {
    data.author = clean(
      getAttr(authorMatch[0], 'title') ??
      stripHtml(authorMatch[0].replace(/<[^>]+>/g, ''))
    )
  }

  return data
}

// ---------------------------------------------------------------------------
// Field resolver — priority chain
// ---------------------------------------------------------------------------

type SourceMap = {
  og:       OgData
  twitter:  TwitterData
  'json-ld': JsonLdExtracted
  meta:     MetaTagData
  html:     HtmlFallbackData
}

type FieldName = 'title' | 'description' | 'image' | 'canonical' |
                 'siteName' | 'author' | 'publishDate' | 'keywords'

function makeFieldResolver(
  og: OgData,
  twitter: TwitterData,
  jsonLdBlobs: JsonLdBlob[],
  meta: MetaTagData,
  html: HtmlFallbackData
) {
  const jsonLd = extractFromJsonLd(jsonLdBlobs)
  const sourceMap: SourceMap = { og, twitter, 'json-ld': jsonLd, meta, html }

  const FIELD_MAP: Record<FieldName, Record<MetadataSource, string | undefined>> = {
    title:       { og: og.title,       twitter: twitter.title,       'json-ld': jsonLd.title,       meta: meta.title,       html: html.title },
    description: { og: og.description, twitter: twitter.description, 'json-ld': jsonLd.description, meta: meta.description, html: html.description },
    image:       { og: og.image,       twitter: twitter.image,       'json-ld': jsonLd.image,       meta: undefined,        html: undefined },
    canonical:   { og: og.canonical,   twitter: undefined,           'json-ld': jsonLd.canonical,   meta: meta.canonical,   html: html.canonical },
    siteName:    { og: og.siteName,    twitter: undefined,           'json-ld': jsonLd.siteName,    meta: meta.siteName,    html: html.siteName },
    author:      { og: og.author,      twitter: undefined,           'json-ld': jsonLd.author,      meta: meta.author,      html: html.author },
    publishDate: { og: og.publishDate, twitter: undefined,           'json-ld': jsonLd.publishDate, meta: undefined,        html: html.publishDate },
    keywords:    { og: undefined,      twitter: undefined,           'json-ld': jsonLd.keywords,    meta: meta.keywords,    html: html.keywords },
  }

  return function resolve(
    field: FieldName,
    priority: MetadataSource[]
  ): { value: string | undefined; source: MetadataSource | undefined } {
    for (const source of priority) {
      const val = FIELD_MAP[field]?.[source]
      if (val && val.trim()) {
        return { value: val.trim(), source }
      }
    }
    return { value: undefined, source: undefined }
  }
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/** Extract the value of an HTML attribute (handles single, double, and no quotes) */
function getAttr(tag: string, attr: string): string | undefined {
  const re = new RegExp(`\\b${attr}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s/>]+))`, 'i')
  const m = re.exec(tag)
  return m ? (m[1] ?? m[2] ?? m[3]) : undefined
}

/** Strip HTML tags from a string */
function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
             .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'")
             .replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Trim and collapse whitespace */
function clean(s?: string): string | undefined {
  if (!s) return undefined
  const trimmed = s.replace(/\s+/g, ' ').trim()
  return trimmed || undefined
}

/** Validate and return a URL string, or undefined if invalid */
function cleanUrl(s?: string): string | undefined {
  if (!s) return undefined
  try {
    new URL(s)
    return s.trim()
  } catch {
    return undefined
  }
}

function parseDate(raw?: string): Date | undefined {
  if (!raw) return undefined
  const d = new Date(raw)
  return isNaN(d.getTime()) ? undefined : d
}

function parseKeywordList(raw?: string): string[] | undefined {
  if (!raw) return undefined
  return raw
    .split(/[,;|]/)
    .map((k) => k.trim())
    .filter((k) => k.length > 0)
    .slice(0, 20)
}

function strField(blob: JsonLdBlob, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const val = blob[key]
    if (typeof val === 'string' && val.trim()) return val.trim()
    if (typeof val === 'object' && val !== null) {
      const nested = (val as Record<string, unknown>)['@id'] ?? (val as Record<string, unknown>)['url']
      if (typeof nested === 'string' && nested.trim()) return nested.trim()
    }
  }
  return undefined
}

function imageField(blob: JsonLdBlob, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const val = blob[key]
    if (typeof val === 'string' && val.trim()) return cleanUrl(val)
    if (Array.isArray(val) && val.length > 0) {
      const first = val[0]
      if (typeof first === 'string') return cleanUrl(first)
      if (typeof first === 'object' && first !== null) {
        const url = (first as Record<string, unknown>)['url']
        if (typeof url === 'string') return cleanUrl(url)
      }
    }
    if (typeof val === 'object' && val !== null) {
      const url = (val as Record<string, unknown>)['url']
      if (typeof url === 'string') return cleanUrl(url)
    }
  }
  return undefined
}

function authorField(blob: JsonLdBlob): string | undefined {
  const author = blob['author']
  if (typeof author === 'string') return author.trim() || undefined
  if (Array.isArray(author) && author.length > 0) {
    const first = author[0]
    if (typeof first === 'string') return first.trim() || undefined
    if (typeof first === 'object' && first !== null) {
      return strField(first as JsonLdBlob, 'name')
    }
  }
  if (typeof author === 'object' && author !== null) {
    return strField(author as JsonLdBlob, 'name')
  }
  return undefined
}

function publisherField(blob: JsonLdBlob): string | undefined {
  const publisher = blob['publisher']
  if (typeof publisher === 'string') return publisher.trim() || undefined
  if (typeof publisher === 'object' && publisher !== null) {
    return strField(publisher as JsonLdBlob, 'name')
  }
  return undefined
}

function keywordsField(blob: JsonLdBlob): string | undefined {
  const kw = blob['keywords']
  if (typeof kw === 'string') return kw.trim() || undefined
  if (Array.isArray(kw)) return kw.filter((k) => typeof k === 'string').join(', ')
  return undefined
}
