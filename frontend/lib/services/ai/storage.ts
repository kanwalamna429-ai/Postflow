// =============================================================================
// Generated Content Storage
// Persists AI-generated content to the generated_content Supabase table.
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  SaveGeneratedContentParams,
  SavedContent,
  SocialPlatform,
  ContentType,
} from './types'

/**
 * Saves a single piece of generated content to the database.
 * Returns the inserted row's ID, platform, content, and type.
 */
export async function saveGeneratedContent(
  supabase: SupabaseClient,
  params: SaveGeneratedContentParams
): Promise<SavedContent> {
  const {
    userId,
    platform,
    content,
    contentType,
    tone,
    hashtags = [],
    campaignId,
    extractedContentId,
    metadata = {},
  } = params

  const { data, error } = await supabase
    .from('generated_content')
    .insert({
      user_id:               userId,
      platform,
      content,
      content_type:          contentType,
      tone:                  tone ?? null,
      hashtags,
      campaign_id:           campaignId          ?? null,
      extracted_content_id:  extractedContentId  ?? null,
      is_approved:           false,
      metadata,
    })
    .select('id, platform, content, content_type')
    .single()

  if (error || !data) {
    throw new Error(
      `Failed to save generated content: ${error?.message ?? 'unknown error'}`
    )
  }

  return {
    id:          data.id,
    platform:    data.platform as SocialPlatform,
    content:     data.content,
    contentType: data.content_type as ContentType,
  }
}

/**
 * Saves multiple content variants in a single batch insert.
 * Returns an array of saved content IDs.
 */
export async function saveGeneratedContentBatch(
  supabase: SupabaseClient,
  items: SaveGeneratedContentParams[]
): Promise<SavedContent[]> {
  if (items.length === 0) return []

  const rows = items.map((params) => ({
    user_id:               params.userId,
    platform:              params.platform,
    content:               params.content,
    content_type:          params.contentType,
    tone:                  params.tone           ?? null,
    hashtags:              params.hashtags        ?? [],
    campaign_id:           params.campaignId      ?? null,
    extracted_content_id:  params.extractedContentId ?? null,
    is_approved:           false,
    metadata:              params.metadata        ?? {},
  }))

  const { data, error } = await supabase
    .from('generated_content')
    .insert(rows)
    .select('id, platform, content, content_type')

  if (error || !data) {
    throw new Error(
      `Failed to batch-save generated content: ${error?.message ?? 'unknown error'}`
    )
  }

  return data.map((row) => ({
    id:          row.id,
    platform:    row.platform as SocialPlatform,
    content:     row.content,
    contentType: row.content_type as ContentType,
  }))
}

/**
 * Marks a generated content row as approved.
 */
export async function approveGeneratedContent(
  supabase: SupabaseClient,
  contentId: string,
  userId: string
): Promise<void> {
  const { error } = await supabase
    .from('generated_content')
    .update({ is_approved: true, approved_at: new Date().toISOString() })
    .eq('id', contentId)
    .eq('user_id', userId)

  if (error) {
    throw new Error(`Failed to approve content: ${error.message}`)
  }
}

/**
 * Soft-deletes a generated content row.
 */
export async function deleteGeneratedContent(
  supabase: SupabaseClient,
  contentId: string,
  userId: string
): Promise<void> {
  const { error } = await supabase
    .from('generated_content')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', contentId)
    .eq('user_id', userId)

  if (error) {
    throw new Error(`Failed to delete content: ${error.message}`)
  }
}

/**
 * Fetches all generated content for a given user and optional campaign.
 */
export async function fetchGeneratedContent(
  supabase: SupabaseClient,
  userId: string,
  options: {
    campaignId?:  string
    platform?:    SocialPlatform
    isApproved?:  boolean
    limit?:       number
    offset?:      number
  } = {}
) {
  let query = supabase
    .from('generated_content')
    .select('*')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (options.campaignId)          query = query.eq('campaign_id', options.campaignId)
  if (options.platform)            query = query.eq('platform', options.platform)
  if (options.isApproved !== undefined) query = query.eq('is_approved', options.isApproved)

  query = query.range(
    options.offset ?? 0,
    (options.offset ?? 0) + (options.limit ?? 50) - 1
  )

  const { data, error } = await query
  if (error) throw new Error(`Failed to fetch generated content: ${error.message}`)
  return data ?? []
}
