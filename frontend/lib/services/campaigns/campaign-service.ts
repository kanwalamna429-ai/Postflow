// =============================================================================
// Campaign Service — Supabase CRUD
// All database operations for the campaigns table.
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  CampaignRow,
  CampaignCreateInput,
  CampaignUpdateInput,
  CampaignEngineStatus,
  FrequencyType,
} from './types'

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

/**
 * Create a new campaign in draft status and link its URLs.
 * Returns the newly created CampaignRow.
 */
export async function createCampaign(
  supabase: SupabaseClient,
  userId: string,
  input: CampaignCreateInput
): Promise<CampaignRow> {
  const { data, error } = await supabase
    .from('campaigns')
    .insert({
      user_id:         userId,
      name:            input.name,
      description:     input.description ?? null,
      platforms:       input.platforms,
      start_date:      input.startDate,
      timezone:        input.timezone,
      frequency_type:  input.frequency.type,
      frequency_value: input.frequency.value,
      status:          'draft',
      metadata:        {},
    })
    .select()
    .single()

  if (error) throw new Error(`createCampaign: ${error.message}`)

  // Link URL records to the new campaign
  if (input.urlIds.length > 0) {
    const { error: linkError } = await supabase
      .from('campaign_urls')
      .update({ campaign_id: data.id })
      .in('id', input.urlIds)

    if (linkError) {
      console.error('createCampaign: failed to link URLs', linkError.message)
    }
  }

  return mapCampaignRow(data)
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/** Fetch a single campaign by ID (returns null if not found / soft-deleted). */
export async function fetchCampaignById(
  supabase: SupabaseClient,
  campaignId: string
): Promise<CampaignRow | null> {
  const { data, error } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', campaignId)
    .is('deleted_at', null)
    .maybeSingle()

  if (error || !data) return null
  return mapCampaignRow(data)
}

export interface FetchCampaignsOptions {
  status?: CampaignEngineStatus
  search?: string
  limit?: number
  offset?: number
}

/** Fetch campaigns for a user with optional filtering. */
export async function fetchCampaigns(
  supabase: SupabaseClient,
  userId: string,
  opts: FetchCampaignsOptions = {}
): Promise<CampaignRow[]> {
  let query = supabase
    .from('campaigns')
    .select('*')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (opts.status) query = query.eq('status', opts.status)
  if (opts.search) query = query.ilike('name', `%${opts.search}%`)
  if (opts.limit)  query = query.limit(opts.limit)
  if (opts.offset !== undefined && opts.limit) {
    query = query.range(opts.offset, opts.offset + opts.limit - 1)
  }

  const { data, error } = await query
  if (error) throw new Error(`fetchCampaigns: ${error.message}`)
  return (data ?? []).map(mapCampaignRow)
}

/** Count campaigns for a user, optionally filtered by status. */
export async function countCampaigns(
  supabase: SupabaseClient,
  userId: string,
  status?: CampaignEngineStatus
): Promise<number> {
  let query = supabase
    .from('campaigns')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('deleted_at', null)

  if (status) query = query.eq('status', status)

  const { count, error } = await query
  if (error) throw new Error(`countCampaigns: ${error.message}`)
  return count ?? 0
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

/** Update editable fields on a campaign. Only updates provided fields. */
export async function updateCampaign(
  supabase: SupabaseClient,
  campaignId: string,
  input: CampaignUpdateInput
): Promise<CampaignRow> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (input.name        !== undefined) patch.name            = input.name
  if (input.description !== undefined) patch.description     = input.description
  if (input.platforms   !== undefined) patch.platforms        = input.platforms
  if (input.startDate   !== undefined) patch.start_date       = input.startDate
  if (input.timezone    !== undefined) patch.timezone         = input.timezone
  if (input.frequency   !== undefined) {
    patch.frequency_type  = input.frequency.type
    patch.frequency_value = input.frequency.value
  }

  const { data, error } = await supabase
    .from('campaigns')
    .update(patch)
    .eq('id', campaignId)
    .select()
    .single()

  if (error) throw new Error(`updateCampaign: ${error.message}`)
  return mapCampaignRow(data)
}

/** Update only the campaign status. Used by the schedule-service. */
export async function updateCampaignStatus(
  supabase: SupabaseClient,
  campaignId: string,
  status: CampaignEngineStatus
): Promise<void> {
  const { error } = await supabase
    .from('campaigns')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', campaignId)

  if (error) throw new Error(`updateCampaignStatus: ${error.message}`)
}

// ---------------------------------------------------------------------------
// Delete (soft)
// ---------------------------------------------------------------------------

/** Soft-delete a campaign (sets deleted_at). */
export async function deleteCampaign(
  supabase: SupabaseClient,
  campaignId: string
): Promise<void> {
  const { error } = await supabase
    .from('campaigns')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', campaignId)

  if (error) throw new Error(`deleteCampaign: ${error.message}`)
}

// ---------------------------------------------------------------------------
// Internal mapper
// ---------------------------------------------------------------------------

/** Map a raw Supabase campaign row to a typed CampaignRow. */
function mapCampaignRow(raw: Record<string, unknown>): CampaignRow {
  return {
    id:             String(raw.id),
    userId:         String(raw.user_id),
    name:           String(raw.name),
    description:    raw.description != null ? String(raw.description) : null,
    status:         String(raw.status) as CampaignEngineStatus,
    platforms:      Array.isArray(raw.platforms) ? (raw.platforms as string[]) : [],
    startDate:      raw.start_date != null ? String(raw.start_date) : null,
    timezone:       String(raw.timezone ?? 'UTC'),
    frequencyType:  raw.frequency_type != null ? (String(raw.frequency_type) as FrequencyType) : null,
    frequencyValue: Number(raw.frequency_value ?? 1),
    metadata:       (raw.metadata as Record<string, unknown>) ?? {},
    createdAt:      String(raw.created_at),
    updatedAt:      String(raw.updated_at),
    deletedAt:      raw.deleted_at != null ? String(raw.deleted_at) : null,
  }
}
