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
import { type UrlEntry } from "@/lib/mock-data"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UrlStore {
  urls: UrlEntry[]
  loading: boolean
  dbError: string | null
  addUrls: (entries: UrlEntry[]) => Promise<void>
  removeUrl: (id: string) => Promise<void>
  clearAll: () => Promise<void>
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const UrlStoreContext = createContext<UrlStore | null>(null)

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
function rowToEntry(row: any): UrlEntry {
  return {
    id:          row.id,
    title:       row.title,
    originalUrl: row.original_url,
    shortUrl:    row.short_url ?? row.original_url,
    clicks:      row.clicks ?? 0,
    campaigns:   [],
    createdAt:   new Date(row.created_at).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
    }),
    tags: row.tags ?? [],
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function UrlStoreProvider({ children }: { children: ReactNode }) {
  const [urls, setUrls]       = useState<UrlEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [dbError, setDbError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const supabase = getSupabase()
      if (!supabase) { setLoading(false); return }

      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user || cancelled) { setLoading(false); return }

        const { data, error } = await supabase
          .from("campaign_urls")
          .select("id, title, original_url, short_url, clicks, tags, created_at")
          .eq("user_id", user.id)
          .is("campaign_id", null)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })

        if (error) {
          console.error("[url-store] load error:", error)
          setDbError(error.message)
          setLoading(false)
          return
        }
        if (!cancelled) setUrls((data ?? []).map(rowToEntry))
      } catch (err) {
        console.error("[url-store] load failed:", err)
        setDbError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [])

  const addUrls = useCallback(async (entries: UrlEntry[]) => {
    const supabase = getSupabase()
    if (supabase) {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const rows = entries.map((e) => ({
            id:           e.id,
            user_id:      user.id,
            campaign_id:  null,
            title:        e.title,
            original_url: e.originalUrl,
            slug:         e.id.replace(/-/g, ""),
            short_url:    null,
            clicks:       0,
            tags:         e.tags,
            is_active:    true,
          }))
          const { error } = await supabase.from("campaign_urls").insert(rows)
          if (error) {
            console.error("[url-store] insert error:", error)
            setDbError(error.message)
          } else {
            setDbError(null)
          }
        }
      } catch (err) {
        console.error("[url-store] addUrls failed:", err)
        setDbError(err instanceof Error ? err.message : String(err))
      }
    }
    setUrls((prev) => [...entries, ...prev])
  }, [])

  const removeUrl = useCallback(async (id: string) => {
    const supabase = getSupabase()
    if (supabase) {
      try {
        const { error } = await supabase
          .from("campaign_urls")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", id)
        if (error) console.error("[url-store] remove error:", error)
      } catch (err) {
        console.error("[url-store] removeUrl failed:", err)
      }
    }
    setUrls((prev) => prev.filter((u) => u.id !== id))
  }, [])

  const clearAll = useCallback(async () => {
    const supabase = getSupabase()
    if (supabase) {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const { error } = await supabase
            .from("campaign_urls")
            .update({ deleted_at: new Date().toISOString() })
            .eq("user_id", user.id)
            .is("campaign_id", null)
            .is("deleted_at", null)
          if (error) console.error("[url-store] clearAll error:", error)
        }
      } catch (err) {
        console.error("[url-store] clearAll failed:", err)
      }
    }
    setUrls([])
  }, [])

  return (
    <UrlStoreContext.Provider value={{ urls, loading, dbError, addUrls, removeUrl, clearAll }}>
      {children}
    </UrlStoreContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useUrlStore() {
  const ctx = useContext(UrlStoreContext)
  if (!ctx) throw new Error("useUrlStore must be used within UrlStoreProvider")
  return ctx
}
