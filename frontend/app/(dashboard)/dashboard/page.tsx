"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Header } from "@/components/layout/header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Megaphone,
  Play,
  Calendar,
  CheckCircle2,
  XCircle,
  Plug2,
  TrendingUp,
  Zap,
  AlertTriangle,
  RefreshCw,
  Activity,
  Database,
} from "lucide-react"
import { type Campaign, type CampaignStatus, type Platform } from "@/lib/mock-data"

interface DashboardStats {
  totalCampaigns: number
  activeCampaigns: number
  scheduledPosts: number
  publishedPosts: number
  failedPosts: number
  connectedPlatforms: number
  successRate: number
}

function getSupabase() {
  try {
    return createClient()
  } catch {
    return null
  }
}

const gettingStartedSteps = [
  {
    step: 1,
    title: "Connect a platform",
    description: "Go to Connections and add your first social or publishing account.",
    href: "/connections",
  },
  {
    step: 2,
    title: "Add URLs to publish",
    description: "Paste URLs into the URL Library to build your content queue.",
    href: "/url-library",
  },
  {
    step: 3,
    title: "Create a campaign",
    description: "Set a schedule, pick platforms, and assign URLs to your campaign.",
    href: "/campaigns",
  },
  {
    step: 4,
    title: "Configure publishing engine",
    description: "Set PROCESS_POSTS_SECRET and NEXTJS_SITE_URL in your deployment environment.",
    href: "/settings",
  },
]

export default function DashboardPage() {
  const [stats, setStats]                     = useState<DashboardStats | null>(null)
  const [recentCampaigns, setRecentCampaigns] = useState<Campaign[]>([])
  const [connections, setConnections]         = useState(0)
  const [stepsCompleted, setStepsCompleted]   = useState<boolean[]>([false, false, false, false])
  const [migrationNeeded, setMigrationNeeded] = useState(false)

  useEffect(() => {
    async function load() {
      const supabase = getSupabase()
      if (!supabase) return

      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const [
          campaignsRes,
          activeCampaignsRes,
          connectionsRes,
          publishedRes,
          failedRes,
          scheduledRes,
          recentRes,
          urlsRes,
        ] = await Promise.all([
          supabase.from("campaigns").select("*", { count: "exact", head: true }).eq("user_id", user.id),
          supabase.from("campaigns").select("*", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "active"),
          supabase.from("platform_connections").select("*", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "connected"),
          supabase.from("system_logs").select("*", { count: "exact", head: true }).eq("user_id", user.id).eq("level", "success"),
          supabase.from("system_logs").select("*", { count: "exact", head: true }).eq("user_id", user.id).eq("level", "error"),
          supabase.from("campaigns").select("scheduled_posts").eq("user_id", user.id),
          supabase.from("campaigns").select("id, name, status, platforms, scheduled_posts, published_posts, failed_posts, start_date, end_date, success_rate, frequency, timezone, url_count, description").eq("user_id", user.id).order("created_at", { ascending: false }).limit(5),
          supabase.from("campaign_urls").select("*", { count: "exact", head: true }).eq("user_id", user.id).is("deleted_at", null),
        ])

        // Detect missing tables (PostgreSQL error code 42P01)
        const firstError = [campaignsRes, connectionsRes, urlsRes].find((r) => r.error)?.error
        if (firstError) {
          console.error("[dashboard] DB error:", firstError)
          const isMissing =
            firstError.code === "42P01" ||
            (firstError.message ?? "").toLowerCase().includes("does not exist") ||
            (firstError.message ?? "").toLowerCase().includes("relation")
          if (isMissing) { setMigrationNeeded(true); return }
        }

        const totalScheduled = (scheduledRes.data ?? []).reduce(
          (sum: number, c: { scheduled_posts: number }) => sum + (c.scheduled_posts ?? 0), 0
        )
        const published = publishedRes.count ?? 0
        const failed    = failedRes.count ?? 0
        const connCount = connectionsRes.count ?? 0

        setConnections(connCount)
        setStats({
          totalCampaigns:     campaignsRes.count ?? 0,
          activeCampaigns:    activeCampaignsRes.count ?? 0,
          scheduledPosts:     totalScheduled,
          publishedPosts:     published,
          failedPosts:        failed,
          connectedPlatforms: connCount,
          successRate:        published + failed > 0
            ? Math.round((published / (published + failed)) * 100)
            : 0,
        })

        setRecentCampaigns(
          (recentRes.data ?? []).map((r: Record<string, unknown>) => ({
            id:             r.id as string,
            name:           r.name as string,
            description:    r.description as string | undefined,
            status:         r.status as CampaignStatus,
            platforms:      (r.platforms as Platform[]) ?? [],
            scheduledPosts: (r.scheduled_posts as number) ?? 0,
            publishedPosts: (r.published_posts as number) ?? 0,
            failedPosts:    (r.failed_posts as number) ?? 0,
            startDate:      (r.start_date as string) ?? "",
            endDate:        (r.end_date as string) ?? "",
            successRate:    Number(r.success_rate ?? 0),
            frequency:      r.frequency as string | undefined,
            timezone:       r.timezone as string | undefined,
            urlCount:       (r.url_count as number) ?? 0,
          }))
        )

        setStepsCompleted([
          (connectionsRes.count ?? 0) > 0,
          (urlsRes.count ?? 0) > 0,
          (campaignsRes.count ?? 0) > 0,
          false,
        ])
      } catch (err) {
        console.error("[dashboard] load failed:", err)
      }
    }

    load()
  }, [])

  const statCards = [
    { title: "Total Campaigns",      value: stats?.totalCampaigns,     icon: Megaphone,    description: "All time",            color: "text-blue-600 dark:text-blue-400",       bg: "bg-blue-50 dark:bg-blue-950/40"       },
    { title: "Active Campaigns",     value: stats?.activeCampaigns,    icon: Play,         description: "Currently running",   color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/40" },
    { title: "Scheduled Posts",      value: stats?.scheduledPosts,     icon: Calendar,     description: "Queued up",           color: "text-violet-600 dark:text-violet-400",   bg: "bg-violet-50 dark:bg-violet-950/40"   },
    { title: "Published Posts",      value: stats?.publishedPosts,     icon: CheckCircle2, description: "Successfully sent",   color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/40" },
    { title: "Failed Posts",         value: stats?.failedPosts,        icon: XCircle,      description: "Need attention",      color: "text-red-600 dark:text-red-400",         bg: "bg-red-50 dark:bg-red-950/40"         },
    { title: "Connected Platforms",  value: stats?.connectedPlatforms, icon: Plug2,        description: "Active integrations", color: "text-orange-600 dark:text-orange-400",   bg: "bg-orange-50 dark:bg-orange-950/40"   },
    { title: "Success Rate",         value: stats ? `${stats.successRate}%` : undefined, icon: TrendingUp, description: "Last 30 days", color: "text-teal-600 dark:text-teal-400", bg: "bg-teal-50 dark:bg-teal-950/40" },
  ]

  const systemHealthItems = [
    {
      label: "Publishing Engine",
      status: "idle",
      description: "No posts due",
      icon: Zap,
      color: "text-muted-foreground",
      dot: "bg-muted-foreground/40",
    },
    {
      label: "Edge Function",
      status: "unconfigured",
      description: "Set NEXTJS_SITE_URL to activate",
      icon: Activity,
      color: "text-amber-600 dark:text-amber-400",
      dot: "bg-amber-400",
    },
    {
      label: "Platform Connections",
      status: connections > 0 ? "ok" : "none",
      description: connections > 0 ? `${connections} connected` : "No platforms connected",
      icon: Plug2,
      color: connections > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
      dot: connections > 0 ? "bg-emerald-500" : "bg-muted-foreground/40",
    },
    {
      label: "Failed Posts",
      status: (stats?.failedPosts ?? 0) > 0 ? "warning" : "ok",
      description: (stats?.failedPosts ?? 0) > 0 ? `${stats?.failedPosts} failures` : "No failures",
      icon: AlertTriangle,
      color: (stats?.failedPosts ?? 0) > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400",
      dot: (stats?.failedPosts ?? 0) > 0 ? "bg-amber-400" : "bg-emerald-500",
    },
    {
      label: "Retry Backlog",
      status: "ok",
      description: "Queue empty",
      icon: RefreshCw,
      color: "text-emerald-600 dark:text-emerald-400",
      dot: "bg-emerald-500",
    },
  ]

  return (
    <div className="flex flex-col flex-1">
      <Header title="Dashboard" />

      <main className="flex-1 p-4 lg:p-6 space-y-6">

        {/* Migration needed banner */}
        {migrationNeeded && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30 p-4 flex gap-3">
            <Database className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                Database tables not found — run the SQL migration
              </p>
              <p className="text-xs text-amber-800 dark:text-amber-300">
                Open your Supabase project → SQL Editor → paste and run the contents of{" "}
                <code className="font-mono bg-amber-100 dark:bg-amber-900/40 px-1 rounded">
                  supabase/migrations/001_initial.sql
                </code>{" "}
                from this repo. Then reload this page.
              </p>
            </div>
          </div>
        )}

        {/* KPI Stats */}
        <div>
          <h2 className="text-sm font-medium text-muted-foreground mb-4">Overview</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 lg:gap-4">
            {statCards.map((card) => (
              <Card key={card.title} className="border">
                <CardContent className="p-4 lg:p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground leading-none">
                        {card.title}
                      </p>
                      <p className={`text-2xl font-bold tracking-tight ${card.value !== undefined ? "" : "text-muted-foreground/60"}`}>
                        {card.value !== undefined ? card.value : "—"}
                      </p>
                      <p className="text-xs text-muted-foreground">{card.description}</p>
                    </div>
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${card.bg}`}>
                      <card.icon className={`h-4 w-4 ${card.color}`} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Two-column layout: System Health + Getting Started */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* System Health */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4 text-muted-foreground" />
                System Health
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {systemHealthItems.map((item) => (
                  <div key={item.label} className="flex items-center gap-3 px-4 lg:px-6 py-3">
                    <div className={`h-2 w-2 rounded-full shrink-0 ${item.dot}`} />
                    <item.icon className={`h-4 w-4 shrink-0 ${item.color}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.description}</p>
                    </div>
                    <Badge
                      variant={item.status === "ok" ? "success" : item.status === "unconfigured" || item.status === "warning" ? "warning" : "secondary"}
                      className="text-[10px] capitalize shrink-0"
                    >
                      {item.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Getting Started */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-500" />
                Getting Started
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {gettingStartedSteps.map((s, i) => {
                  const done = stepsCompleted[i] ?? false
                  return (
                    <a
                      key={s.step}
                      href={s.href}
                      className="flex items-start gap-3 px-4 lg:px-6 py-3 hover:bg-muted/30 transition-colors group"
                    >
                      <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold mt-0.5 ${
                        done
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                          : "bg-muted text-muted-foreground"
                      }`}>
                        {done ? "✓" : s.step}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${done ? "line-through text-muted-foreground" : ""}`}>
                          {s.title}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">{s.description}</p>
                      </div>
                    </a>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Campaigns */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Recent Campaigns</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {recentCampaigns.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-4">
                  <Megaphone className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium">No campaigns yet</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                  Create your first campaign to start scheduling posts across your connected platforms.
                </p>
                <a
                  href="/campaigns"
                  className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                >
                  Go to Campaigns →
                </a>
              </div>
            ) : (
              <div className="divide-y">
                {recentCampaigns.map((c) => (
                  <div key={c.id} className="flex items-center gap-4 px-4 lg:px-6 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{c.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {c.platforms.slice(0, 3).join(", ")}{c.platforms.length > 3 ? ` +${c.platforms.length - 3}` : ""}
                      </p>
                    </div>
                    <Badge
                      variant={c.status === "active" ? "success" : c.status === "paused" ? "warning" : c.status === "completed" ? "secondary" : "outline"}
                      className="text-[10px] capitalize shrink-0"
                    >
                      {c.status}
                    </Badge>
                  </div>
                ))}
                <div className="px-4 lg:px-6 py-3">
                  <a href="/campaigns" className="text-xs font-medium text-primary hover:underline">
                    View all campaigns →
                  </a>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

      </main>
    </div>
  )
}
