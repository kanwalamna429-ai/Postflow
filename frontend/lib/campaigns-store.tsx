"use client"

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react"
import { createClient } from "@/lib/supabase/client"
import { type Campaign, type CampaignStatus } from "@/lib/mock-data"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CreateCampaignInput extends Omit<Campaign, "id"> {
  urlIds?: string[]
}

interface UpdateCampaignInput {
  name?: string
  description?: string
  platforms?: string[]
  frequency?: string
  startDate?: string
  endDate?: string
  timezone?: string
  urlCount?: number
  urlIds?: string[]
}

interface CampaignsStore {
  campaigns: Campaign[]
  loading: boolean
  dbError: string | null
  createCampaign: (input: CreateCampaignInput) => Promise<Campaign>
  updateCampaign: (id: string, input: UpdateCampaignInput) => Promise<void>
  updateCampaignStatus: (id: string, status: CampaignStatus, extra?: Partial<Campaign>) => Promise<void>
  deleteCampaign: (id: string) => Promise<void>
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const CampaignsContext = createContext<CampaignsStore | null>(null)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSupabase() {
  try {
    return createClient()
  } catch {
    return null
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToCampaign(row: any): Campaign {
  return {
    id:             row.id,
    name:           row.name,
    description:    row.description ?? undefined,
    status:         row.status as CampaignStatus,
    platforms:      row.platforms ?? [],
    scheduledPosts: row.scheduled_posts ?? 0,
    publishedPosts: row.published_posts ?? 0,
    failedPosts:    row.failed_posts ?? 0,
    startDate:      row.start_date ?? "",
    endDate:        row.end_date ?? row.start_date ?? "",
    successRate:    Number(row.success_rate ?? 0),
    frequency:      row.frequency ?? undefined,
    timezone:       row.timezone ?? "UTC",
    urlCount:       row.url_count ?? 0,
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function CampaignsProvider({ children }: { children: ReactNode }) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading]     = useState(true)
  const [dbError, setDbError]     = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const supabase = getSupabase()
      if (!supabase) { setLoading(false); return }

      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user || cancelled) { setLoading(false); return }

        const { data, error } = await supabase
          .from("campaigns")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })

        if (error) {
          console.error("[campaigns-store] load error:", error)
          setDbError(error.message)
          setLoading(false)
          return
        }
        if (!cancelled) setCampaigns((data ?? []).map(rowToCampaign))
      } catch (err) {
        console.error("[campaigns-store] load failed:", err)
        setDbError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [])

  const createCampaign = useCallback(async (input: CreateCampaignInput): Promise<Campaign> => {
    const optimisticId = crypto.randomUUID()
    const optimistic: Campaign = { ...input, id: optimisticId }

    setCampaigns((prev) => [optimistic, ...prev])

    const supabase = getSupabase()
    if (supabase) {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const { data, error } = await supabase
            .from("campaigns")
            .insert({
              user_id:         user.id,
              name:            input.name,
              description:     input.description || null,
              status:          input.status,
              platforms:       input.platforms,
              url_ids:         input.urlIds ?? [],
              frequency:       input.frequency || null,
              start_date:      input.startDate || null,
              end_date:        input.endDate || null,
              timezone:        input.timezone || "UTC",
              url_count:       input.urlCount ?? 0,
              scheduled_posts: 0,
              published_posts: 0,
              failed_posts:    0,
              success_rate:    0,
            })
            .select()
            .single()

          if (error) {
            console.error("[campaigns-store] insert error:", error)
            setDbError(error.message)
          } else if (data) {
            const saved = rowToCampaign(data)
            setCampaigns((prev) => prev.map((c) => c.id === optimisticId ? saved : c))
            setDbError(null)
            return saved
          }
        }
      } catch (err) {
        console.error("[campaigns-store] createCampaign failed:", err)
        setDbError(err instanceof Error ? err.message : String(err))
      }
    }

    return optimistic
  }, [])

  const updateCampaign = useCallback(async (id: string, input: UpdateCampaignInput) => {
    setCampaigns((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              name:        input.name        ?? c.name,
              description: input.description ?? c.description,
              platforms:   (input.platforms  ?? c.platforms) as Campaign["platforms"],
              frequency:   input.frequency   ?? c.frequency,
              startDate:   input.startDate   ?? c.startDate,
              endDate:     input.endDate     ?? c.endDate,
              timezone:    input.timezone    ?? c.timezone,
              urlCount:    input.urlCount    ?? c.urlCount,
            }
          : c
      )
    )
    const supabase = getSupabase()
    if (supabase) {
      try {
        const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
        if (input.name        !== undefined) patch.name        = input.name
        if (input.description !== undefined) patch.description = input.description || null
        if (input.platforms   !== undefined) patch.platforms   = input.platforms
        if (input.frequency   !== undefined) patch.frequency   = input.frequency || null
        if (input.startDate   !== undefined) patch.start_date  = input.startDate  || null
        if (input.endDate     !== undefined) patch.end_date    = input.endDate    || null
        if (input.timezone    !== undefined) patch.timezone    = input.timezone   || "UTC"
        if (input.urlCount    !== undefined) patch.url_count   = input.urlCount
        if (input.urlIds      !== undefined) patch.url_ids     = input.urlIds
        const { error } = await supabase.from("campaigns").update(patch).eq("id", id)
        if (error) console.error("[campaigns-store] updateCampaign error:", error)
      } catch (err) {
        console.error("[campaigns-store] updateCampaign failed:", err)
      }
    }
  }, [])

  const updateCampaignStatus = useCallback(async (
    id: string,
    status: CampaignStatus,
    extra?: Partial<Campaign>,
  ) => {
    setCampaigns((prev) =>
      prev.map((c) => c.id === id ? { ...c, status, ...(extra ?? {}) } : c)
    )
    const supabase = getSupabase()
    if (supabase) {
      try {
        const { error } = await supabase
          .from("campaigns")
          .update({
            status,
            updated_at: new Date().toISOString(),
            ...(extra?.scheduledPosts !== undefined ? { scheduled_posts: extra.scheduledPosts } : {}),
          })
          .eq("id", id)
        if (error) console.error("[campaigns-store] update error:", error)
      } catch (err) {
        console.error("[campaigns-store] updateCampaignStatus failed:", err)
      }
    }
  }, [])

  const deleteCampaign = useCallback(async (id: string) => {
    setCampaigns((prev) => prev.filter((c) => c.id !== id))
    const supabase = getSupabase()
    if (supabase) {
      try {
        const { error } = await supabase.from("campaigns").delete().eq("id", id)
        if (error) console.error("[campaigns-store] delete error:", error)
      } catch (err) {
        console.error("[campaigns-store] delete failed:", err)
      }
    }
  }, [])

  return (
    <CampaignsContext.Provider
      value={{ campaigns, loading, dbError, createCampaign, updateCampaign, updateCampaignStatus, deleteCampaign }}
    >
      {children}
    </CampaignsContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCampaigns() {
  const ctx = useContext(CampaignsContext)
  if (!ctx) throw new Error("useCampaigns must be used within CampaignsProvider")
  return ctx
}
