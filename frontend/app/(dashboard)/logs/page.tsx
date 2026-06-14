"use client"

import { useState, useMemo, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Header } from "@/components/layout/header"
import { SearchFilter } from "@/components/layout/search-filter"
import { Pagination } from "@/components/layout/pagination"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { type LogLevel, type LogEntry } from "@/lib/mock-data"
import { PLATFORM_LABELS, PLATFORM_ABBREV, type AllPlatformId } from "@/lib/platforms"
import { CheckCircle2, XCircle, AlertTriangle, Info, ScrollText } from "lucide-react"

const PAGE_SIZE = 7

const levelConfig: Record<
  LogLevel,
  {
    icon: React.ElementType
    variant: "success" | "destructive" | "warning" | "info"
    label: string
    rowClass: string
  }
> = {
  success: {
    icon: CheckCircle2,
    variant: "success",
    label: "Success",
    rowClass: "",
  },
  error: {
    icon: XCircle,
    variant: "destructive",
    label: "Error",
    rowClass: "bg-red-50/30 dark:bg-red-950/10",
  },
  warning: {
    icon: AlertTriangle,
    variant: "warning",
    label: "Warning",
    rowClass: "bg-amber-50/30 dark:bg-amber-950/10",
  },
  info: {
    icon: Info,
    variant: "info",
    label: "Info",
    rowClass: "",
  },
}

const PLATFORM_FILTER_OPTIONS = [
  { label: "𝕏 Twitter",   value: "twitter"    },
  { label: "LinkedIn",    value: "linkedin"   },
  { label: "Instagram",   value: "instagram"  },
  { label: "Facebook",    value: "facebook"   },
  { label: "TikTok",      value: "tiktok"     },
  { label: "Bluesky",     value: "bluesky"    },
  { label: "Mastodon",    value: "mastodon"   },
  { label: "Misskey",     value: "misskey"    },
  { label: "Pixelfed",    value: "pixelfed"   },
  { label: "Tumblr",      value: "tumblr"     },
  { label: "DEV.to",      value: "devto"      },
  { label: "Hashnode",    value: "hashnode"   },
  { label: "Reddit",      value: "reddit"     },
  { label: "Diigo",       value: "diigo"      },
  { label: "Raindrop.io", value: "raindrop"   },
  { label: "Pocket",      value: "pocket"     },
  { label: "Instapaper",  value: "instapaper" },
]

function getSupabase() {
  try {
    return createClient()
  } catch {
    return null
  }
}

export default function LogsPage() {
  const [logs, setLogs]                     = useState<LogEntry[]>([])
  const [loading, setLoading]               = useState(true)
  const [search, setSearch]                 = useState("")
  const [levelFilter, setLevelFilter]       = useState("all")
  const [platformFilter, setPlatformFilter] = useState("all")
  const [page, setPage]                     = useState(1)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const supabase = getSupabase()
      if (!supabase) { setLoading(false); return }

      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user || cancelled) { setLoading(false); return }

        const { data, error } = await supabase
          .from("system_logs")
          .select("id, level, campaign, platform, message, post_id, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(500)

        if (error) throw error

        if (!cancelled) {
          setLogs(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (data ?? []).map((r: any) => ({
              id:        r.id,
              timestamp: r.created_at,
              level:     r.level as LogLevel,
              campaign:  r.campaign,
              platform:  r.platform,
              message:   r.message,
              postId:    r.post_id ?? undefined,
            }))
          )
        }
      } catch (err) {
        console.error("[logs] load failed:", err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return logs.filter((l) => {
      const matchesSearch =
        l.message.toLowerCase().includes(q) ||
        l.campaign.toLowerCase().includes(q) ||
        l.platform.includes(q) ||
        (l.postId ?? "").toLowerCase().includes(q)
      const matchesLevel    = levelFilter    === "all" || l.level    === levelFilter
      const matchesPlatform = platformFilter === "all" || l.platform === platformFilter
      return matchesSearch && matchesLevel && matchesPlatform
    })
  }, [logs, search, levelFilter, platformFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function handleClear() {
    setSearch("")
    setLevelFilter("all")
    setPlatformFilter("all")
    setPage(1)
  }

  return (
    <div className="flex flex-col flex-1">
      <Header title="Publish Logs" />

      <main className="flex-1 p-4 lg:p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {loading
              ? "Loading…"
              : logs.length === 0
              ? "No log entries yet"
              : `${filtered.length} of ${logs.length} entries`}
          </p>
        </div>

        {logs.length > 0 && (
          <SearchFilter
            search={search}
            onSearchChange={(v) => { setSearch(v); setPage(1) }}
            onClear={handleClear}
            filters={[
              {
                value: levelFilter,
                onChange: (v) => { setLevelFilter(v); setPage(1) },
                placeholder: "All levels",
                options: [
                  { label: "Success", value: "success" },
                  { label: "Error",   value: "error"   },
                  { label: "Warning", value: "warning" },
                  { label: "Info",    value: "info"    },
                ],
              },
              {
                value: platformFilter,
                onChange: (v) => { setPlatformFilter(v); setPage(1) },
                placeholder: "All platforms",
                options: PLATFORM_FILTER_OPTIONS,
              },
            ]}
          />
        )}

        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="py-16 text-center text-sm text-muted-foreground">Loading logs…</div>
            ) : logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                  <ScrollText className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium">No publish events yet</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                    Events will appear here once your campaigns start publishing. Connect a platform and create a campaign to get started.
                  </p>
                </div>
              </div>
            ) : paginated.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                No entries match your filters.
              </div>
            ) : (
              <div className="divide-y">
                {paginated.map((entry) => {
                  const cfg    = levelConfig[entry.level]
                  const Icon   = cfg.icon
                  const abbrev = PLATFORM_ABBREV[entry.platform as AllPlatformId] ?? entry.platform.slice(0, 2).toUpperCase()
                  return (
                    <div
                      key={entry.id}
                      className={`flex items-start gap-3 px-4 lg:px-6 py-3 hover:bg-muted/30 transition-colors ${cfg.rowClass}`}
                    >
                      <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${
                        entry.level === "success" ? "text-emerald-500" :
                        entry.level === "error"   ? "text-destructive" :
                        entry.level === "warning" ? "text-amber-500"   :
                        "text-blue-500"
                      }`} />

                      <div className="flex-1 min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant={cfg.variant} className="text-[10px] h-4 px-1.5">
                            {cfg.label}
                          </Badge>
                          <span className="text-xs font-medium text-muted-foreground">
                            [{abbrev}]
                          </span>
                          <span className="text-xs font-medium">
                            {PLATFORM_LABELS[entry.platform as AllPlatformId] ?? entry.platform}
                          </span>
                          <span className="text-xs text-muted-foreground hidden sm:inline">
                            · {entry.campaign}
                          </span>
                        </div>
                        <p className="text-sm">{entry.message}</p>
                        {entry.postId && (
                          <p className="text-xs text-muted-foreground font-mono">
                            Post ID: {entry.postId}
                          </p>
                        )}
                      </div>

                      <time className="text-xs text-muted-foreground whitespace-nowrap shrink-0 mt-0.5">
                        {new Date(entry.timestamp).toLocaleString(undefined, {
                          month:  "short",
                          day:    "numeric",
                          hour:   "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {filtered.length > PAGE_SIZE && (
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={setPage}
            totalItems={filtered.length}
            pageSize={PAGE_SIZE}
          />
        )}
      </main>
    </div>
  )
}
