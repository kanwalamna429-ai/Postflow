// =============================================================================
// POST /api/extract — URL Content Extraction
//
// Fetches HTML from an already-saved campaign_url, extracts metadata,
// and saves (or updates) the record in extracted_content.
//
// Body: { urlId: string }
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchUrl } from '@/lib/services/url/fetcher'
import { extractMetadata } from '@/lib/services/url/extractor'

export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { urlId?: string } = {}
  try { body = await request.json() } catch { /* empty body */ }

  const { urlId } = body
  if (!urlId) {
    return NextResponse.json({ error: 'urlId is required' }, { status: 400 })
  }

  // Load the campaign_url row (enforces ownership via RLS)
  const { data: urlRow, error: urlError } = await supabase
    .from('campaign_urls')
    .select('id, original_url, title')
    .eq('id', urlId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (urlError || !urlRow) {
    return NextResponse.json({ error: 'URL not found' }, { status: 404 })
  }

  // Fetch HTML from the source URL
  const fetchResult = await fetchUrl(urlRow.original_url)
  if (!fetchResult.ok || !fetchResult.html) {
    return NextResponse.json(
      { error: fetchResult.error ?? 'Failed to fetch URL content' },
      { status: 422 }
    )
  }

  // Extract metadata from the HTML
  const metadata = extractMetadata(fetchResult.html, fetchResult.finalUrl ?? urlRow.original_url)

  // Upsert into extracted_content (delete old, insert new — handles re-extraction)
  await supabase
    .from('extracted_content')
    .delete()
    .eq('url_id', urlId)
    .eq('user_id', user.id)

  const { data: contentRow, error: insertError } = await supabase
    .from('extracted_content')
    .insert({
      user_id:      user.id,
      url_id:       urlId,
      source_url:   metadata.canonicalUrl ?? urlRow.original_url,
      title:        metadata.title        ?? urlRow.title ?? null,
      description:  metadata.description  ?? null,
      body:         null,
      author:       metadata.author       ?? null,
      published_at: metadata.publishDate  ?? null,
      og_image_url: metadata.featuredImage ?? null,
      keywords:     metadata.keywords     ?? [],
      raw_html:     fetchResult.html.slice(0, 100_000),
      metadata: {
        ogType:        metadata.ogType,
        locale:        metadata.locale,
        twitterCard:   metadata.twitterCard,
        primarySource: metadata.primarySource,
        canonicalUrl:  metadata.canonicalUrl,
        fieldSources:  metadata.fieldSources,
      },
    })
    .select('id')
    .single()

  if (insertError || !contentRow) {
    return NextResponse.json(
      { error: insertError?.message ?? 'Failed to save extracted content' },
      { status: 500 }
    )
  }

  // Also update campaign_url title if we got a better one
  if (metadata.title && metadata.title !== urlRow.title) {
    await supabase
      .from('campaign_urls')
      .update({ title: metadata.title })
      .eq('id', urlId)
  }

  return NextResponse.json({
    success:            true,
    extractedContentId: contentRow.id,
    title:              metadata.title ?? urlRow.title,
    description:        metadata.description ?? null,
    author:             metadata.author ?? null,
    ogImage:            metadata.featuredImage ?? null,
    keywords:           metadata.keywords ?? [],
    sourceUrl:          metadata.canonicalUrl ?? urlRow.original_url,
    publishDate:        metadata.publishDate ?? null,
  })
}
