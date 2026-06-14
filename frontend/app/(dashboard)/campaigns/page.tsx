"use client"

import { useState, useMemo, useCallback } from "react"
import { Header } from "@/components/layout/header"
import { SearchFilter } from "@/components/layout/search-filter"
import { Pagination } from "@/components/layout/pagination"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { BulkUrlUpload } from "@/components/url/bulk-url-upload"
import { useUrlStore } from "@/lib/url-store"
import { useCampaigns } from "@/lib/campaigns-store"
import { type Campaign, type CampaignStatus, type UrlEntry } from "@/lib/mock-data"
import {
  PLATFORM_REGISTRY,
  PLATFORM_LABELS,
  PLATFORM_ABBREV,
  PLATFORM_LIGHT_CLASS,
  PLATFORM_DARK_CLASS,
  type AllPlatformId,
} from "@/lib/platforms"
import {
  FREQUENCY_PRESETS,
  COMMON_TIMEZONES,
  parseFrequencyKey,
  frequencyKey,
  previewSchedule,
  frequencyLabel,
  type CampaignFrequency,
} from "@/lib/services/campaigns"
import {
  Plus,
  X,
  Upload,
  MoreHorizontal,
  TrendingUp,
  CalendarDays,
  Clock,
  Globe,
  Link2,
  Zap,
  ChevronRight,
  ExternalLink,
  Database,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const PAGE_SIZE = 5

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------

const STATUS_VARIANTS: Record<CampaignStatus, "success" | "warning" | "destructive" | "secondary" | "outline" | "info"> = {
  active:    "success",
  scheduled: "info",
  paused:    "warning",
  completed: "secondary",
  draft:     "outline",
  archived:  "secondary",
}

const STATUS_ACTIONS: Record<CampaignStatus, Array<{ label: string; action: string; destructive?: boolean }>> = {
  draft:     [{ label: "Activate", action: "activate" }, { label: "Delete", action: "delete", destructive: true }],
  active:    [{ label: "Pause", action: "pause" }, { label: "Complete", action: "complete" }],
  scheduled: [{ label: "Pause", action: "pause" }, { label: "Complete", action: "complete" }],
  paused:    [{ label: "Resume", action: "activate" }, { label: "Complete", action: "complete" }],
  completed: [{ label: "Archive", action: "archive" }],
  archived:  [{ label: "Restore to Draft", action: "restore" }],
}

// ---------------------------------------------------------------------------
// Platform badge helper
// ---------------------------------------------------------------------------

function platformBadge(id: string) {
  const light = PLATFORM_LIGHT_CLASS[id as AllPlatformId] ?? "bg-muted text-muted-foreground"
  const dark  = PLATFORM_DARK_CLASS[id as AllPlatformId]  ?? ""
  return `${light} ${dark}`
}

// ---------------------------------------------------------------------------
// Default form state
// ---------------------------------------------------------------------------

const DEFAULT_FREQUENCY_KEY = frequencyKey({ type: "every_n_hours", value: 2 })

interface FormState {
  name: string
  description: string
  platforms: string[]
  urlIds: string[]
  campaignUrls: UrlEntry[]
  frequencyKey: string
  startDate: string
  timezone: string
}

const EMPTY_FORM: FormState = {
  name:          "",
  description:   "",
  platforms:     [],
  urlIds:        [],
  campaignUrls:  [],
  frequencyKey:  DEFAULT_FREQUENCY_KEY,
  startDate:     new Date().toISOString().split("T")[0],
  timezone:      "UTC",
}

// ---------------------------------------------------------------------------
// Activation notice
// ---------------------------------------------------------------------------

interface ActivationNotice {
  campaignName: string
  totalPosts: number
  firstDate: string
  lastDate: string
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CampaignsPage() {
  const { urls: libraryUrls } = useUrlStore()
  const { campaigns, createCampaign, updateCampaign, updateCampaignStatus, deleteCampaign, dbError: campaignDbError } = useCampaigns()

  const [showForm, setShowForm]       = useState(false)
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(null)
  const [form, setForm]               = useState<FormState>(EMPTY_FORM)
  const [formError, setFormError]     = useState<string | null>(null)
  const [notice, setNotice]           = useState<ActivationNotice | null>(null)
  const [bulkCampaignOpen, setBulkCampaignOpen] = useState(false)
  const [generatingFor, setGeneratingFor]       = useState<string | null>(null)

  const [search, setSearch]             = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [page, setPage]                 = useState(1)

  const totalUrlCount = form.urlIds.length + form.campaignUrls.length

  // ---- Filtering & pagination ----
  const filtered = useMemo(() => {
    return campaigns.filter((c) => {
      const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase())
      const matchesStatus = statusFilter === "all" || c.status === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [campaigns, search, statusFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function handleClear() {
    setSearch(""); setStatusFilter("all"); setPage(1)
  }

  // ---- Schedule preview ----
  const schedulePreview = useMemo(() => {
    if (!form.startDate || form.platforms.length === 0 || totalUrlCount === 0) return null
    const freq = parseFrequencyKey(form.frequencyKey)
    return previewSchedule(totalUrlCount, form.platforms.length, new Date(form.startDate + "T00:00:00"), freq)
  }, [totalUrlCount, form.platforms.length, form.frequencyKey, form.startDate])

  const togglePlatform = useCallback((id: string) => {
    setForm((f) => ({
      ...f,
      platforms: f.platforms.includes(id)
        ? f.platforms.filter((p) => p !== id)
        : [...f.platforms, id],
    }))
  }, [])

  const toggleUrl = useCallback((id: string) => {
    setForm((f) => ({
      ...f,
      urlIds: f.urlIds.includes(id)
        ? f.urlIds.filter((u) => u !== id)
        : [...f.urlIds, id],
    }))
  }, [])

  const addCampaignUrls = useCallback((entries: UrlEntry[]) => {
    setForm((f) => ({
      ...f,
      campaignUrls: [...f.campaignUrls, ...entries],
    }))
  }, [])

  const removeCampaignUrl = useCallback((id: string) => {
    setForm((f) => ({
      ...f,
      campaignUrls: f.campaignUrls.filter((u) => u.id !== id),
    }))
  }, [])

  const clearCampaignUrls = useCallback(() => {
    setForm((f) => ({ ...f, campaignUrls: [] }))
  }, [])

  // ---- Auto-generate posts after activation (fire-and-forget with UI feedback) ----
  async function triggerAutoGenerate(campaignId: string, campaignName: string) {
    setGeneratingFor(campaignId)
    try {
      await fetch("/api/campaign/auto-generate", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ campaignId }),
      })
    } catch {
      // Non-blocking; user can manually generate on Content page
    } finally {
      setGeneratingFor(null)
    }
  }

  // ---- Submit campaign (create or edit) ----
  async function handleCreateCampaign(activateAfter = false) {
    if (!form.name.trim()) { setFormError("Campaign name is required."); return }
    if (form.platforms.length === 0) { setFormError("Select at least one platform."); return }
    if (!form.startDate) { setFormError("Start date is required."); return }
    setFormError(null)

    const freq = parseFrequencyKey(form.frequencyKey)

    if (editingCampaignId) {
      // ---- Edit existing campaign ----
      await updateCampaign(editingCampaignId, {
        name:        form.name.trim(),
        description: form.description.trim() || undefined,
        platforms:   form.platforms,
        frequency:   frequencyLabel(freq),
        startDate:   form.startDate,
        endDate:     form.startDate,
        timezone:    form.timezone,
      })
      setForm(EMPTY_FORM)
      setEditingCampaignId(null)
      setShowForm(false)
      return
    }

    // ---- Create new campaign ----
    const campaign = await createCampaign({
      name:           form.name.trim(),
      description:    form.description.trim() || undefined,
      status:         "draft",
      platforms:      form.platforms as AllPlatformId[],
      scheduledPosts: 0,
      publishedPosts: 0,
      failedPosts:    0,
      startDate:      form.startDate,
      endDate:        form.startDate,
      successRate:    0,
      frequency:      frequencyLabel(freq),
      timezone:       form.timezone,
      urlCount:       totalUrlCount,
      urlIds:         form.urlIds,
    })

    if (activateAfter && schedulePreview) {
      const preview = schedulePreview
      await updateCampaignStatus(campaign.id, "active")
      setNotice({
        campaignName: campaign.name,
        totalPosts:   preview.totalSlots,
        firstDate:    preview.firstPublishAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
        lastDate:     preview.lastPublishAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      })
      setTimeout(() => setNotice(null), 6000)
      // Auto-generate AI posts for all URLs in the background
      triggerAutoGenerate(campaign.id, campaign.name)
    }

    setForm(EMPTY_FORM)
    setShowForm(false)
  }

  // ---- Status transitions ----
  async function handleAction(campaignId: string, action: string) {
    const campaign = campaigns.find((c) => c.id === campaignId)
    if (!campaign) return

    if (action === "activate" || action === "resume") {
      const freqMatch = campaign.frequency
        ? FREQUENCY_PRESETS.find((p) => frequencyLabel({ type: p.type, value: p.value }) === campaign.frequency)
        : null
      const freqObj: CampaignFrequency = freqMatch
        ? { type: freqMatch.type, value: freqMatch.value }
        : { type: "daily", value: 1 }

      const urlCount     = campaign.urlCount ?? 0
      const platformCount = campaign.platforms.length
      const startDate    = campaign.startDate
        ? new Date(campaign.startDate + "T00:00:00")
        : new Date()
      const preview = previewSchedule(urlCount || 1, platformCount, startDate, freqObj)

      await updateCampaignStatus(campaignId, "active")
      setNotice({
        campaignName: campaign.name,
        totalPosts:   preview.totalSlots,
        firstDate:    preview.firstPublishAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
        lastDate:     preview.lastPublishAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      })
      setTimeout(() => setNotice(null), 6000)
      // Auto-generate AI posts for all URLs in the background
      triggerAutoGenerate(campaignId, campaign.name)

    } else if (action === "pause") {
      await updateCampaignStatus(campaignId, "paused", { scheduledPosts: 0 })
    } else if (action === "complete") {
      await updateCampaignStatus(campaignId, "completed", { scheduledPosts: 0 })
    } else if (action === "archive") {
      await updateCampaignStatus(campaignId, "archived")
    } else if (action === "restore") {
      await updateCampaignStatus(campaignId, "draft")
    } else if (action === "delete") {
      await deleteCampaign(campaignId)
    } else if (action === "edit") {
      const freqMatch = campaign.frequency
        ? FREQUENCY_PRESETS.find((p) => frequencyLabel({ type: p.type, value: p.value }) === campaign.frequency)
        : null
      setEditingCampaignId(campaignId)
      setForm({
        name:         campaign.name,
        description:  campaign.description ?? "",
        platforms:    campaign.platforms as string[],
        urlIds:       [],
        campaignUrls: [],
        frequencyKey: freqMatch
          ? frequencyKey({ type: freqMatch.type, value: freqMatch.value })
          : DEFAULT_FREQUENCY_KEY,
        startDate:    campaign.startDate || new Date().toISOString().split("T")[0],
        timezone:     campaign.timezone || "UTC",
      })
      setFormError(null)
      setShowForm(true)
    } else if (action === "duplicate") {
      await createCampaign({
        name:           `${campaign.name} (copy)`,
        description:    campaign.description,
        status:         "draft",
        platforms:      campaign.platforms,
        scheduledPosts: 0,
        publishedPosts: 0,
        failedPosts:    0,
        startDate:      campaign.startDate,
        endDate:        campaign.endDate,
        successRate:    0,
        frequency:      campaign.frequency,
        timezone:       campaign.timezone,
        urlCount:       campaign.urlCount,
      })
    }
  }

  // ---- Stat counts ----
  const activeCt  = campaigns.filter((c) => c.status === "active").length
  const draftCt   = campaigns.filter((c) => c.status === "draft").length
  const pausedCt  = campaigns.filter((c) => c.status === "paused").length

  return (
    <div className="flex flex-col flex-1">
      <Header title="Campaigns" />

      <main className="flex-1 p-4 lg:p-6 space-y-4">

        {/* ---- Migration needed banner ---- */}
        {campaignDbError && (
          campaignDbError.toLowerCase().includes("does not exist") ||
          campaignDbError.toLowerCase().includes("relation") ||
          campaignDbError.toLowerCase().includes("42p01")
        ) && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30 p-4 flex gap-3">
            <Database className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                Database tables not found — run the SQL migration
              </p>
              <p className="text-xs text-amber-800 dark:text-amber-300">
                Open your Supabase project → SQL Editor → paste and run{" "}
                <code className="font-mono bg-amber-100 dark:bg-amber-900/40 px-1 rounded">
                  supabase/migrations/001_initial.sql
                </code>{" "}
                from this repo, then reload this page.
              </p>
            </div>
          </div>
        )}

        {/* ---- Activation notice ---- */}
        {notice && (
          <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30 p-4">
            <Zap className="h-4 w-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
                Campaign activated — schedule generated
              </p>
              <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-0.5">
                <strong>{notice.campaignName}</strong> · {notice.totalPosts} posts scheduled
                · {notice.firstDate} → {notice.lastDate}
              </p>
            </div>
            <button onClick={() => setNotice(null)} className="text-emerald-600 hover:text-emerald-800 shrink-0">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* ---- Header bar ---- */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>{campaigns.length} total</span>
            <span className="text-emerald-600 font-medium">{activeCt} active</span>
            {pausedCt > 0 && <span className="text-amber-600 font-medium">{pausedCt} paused</span>}
            <span>{draftCt} draft</span>
          </div>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => {
              if (showForm) {
                setShowForm(false)
                setEditingCampaignId(null)
                setForm(EMPTY_FORM)
                setFormError(null)
              } else {
                setShowForm(true)
                setFormError(null)
              }
            }}
          >
            {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showForm ? "Cancel" : "New Campaign"}
          </Button>
        </div>

        {/* ---- New Campaign Form ---- */}
        {showForm && (
          <Card className="border-primary/20 bg-primary/[0.02]">
            <CardHeader className="pb-4">
              <CardTitle className="text-base flex items-center gap-2">
                <Plus className="h-4 w-4" />
                {editingCampaignId ? "Edit Campaign" : "Create Campaign"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">

              {/* Row 1: Name + Description */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Campaign Name <span className="text-destructive">*</span></Label>
                  <Input
                    placeholder="e.g. Q3 Product Announcement"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Description</Label>
                  <Input
                    placeholder="Optional — what this campaign is about"
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  />
                </div>
              </div>

              <Separator />

              {/* Row 2: Platforms */}
              <div className="space-y-2">
                <Label className="text-xs flex items-center gap-1">
                  Platforms <span className="text-destructive">*</span>
                  {form.platforms.length > 0 && (
                    <span className="ml-1 text-muted-foreground">({form.platforms.length} selected)</span>
                  )}
                </Label>
                <div className="space-y-2">
                  {(["social", "publishing", "bookmarking"] as const).map((cat) => {
                    const platforms = PLATFORM_REGISTRY.filter((p) => p.category === cat)
                    return (
                      <div key={cat} className="space-y-1">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{cat}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {platforms.map((p) => {
                            const selected = form.platforms.includes(p.id)
                            return (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => togglePlatform(p.id)}
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-all ${
                                  selected
                                    ? `${platformBadge(p.id)} border-current/30 ring-1 ring-current/20`
                                    : "border-border text-muted-foreground hover:border-border/80 hover:bg-muted/50"
                                }`}
                              >
                                <span className={`inline-flex h-4 w-5 items-center justify-center rounded text-[9px] font-bold ${selected ? "" : "bg-muted"}`}>
                                  {PLATFORM_ABBREV[p.id as AllPlatformId]}
                                </span>
                                {p.ui.displayName}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <Separator />

              {/* Row 3: URLs */}
              <div className="space-y-3">
                <Label className="text-xs flex items-center gap-1">
                  <Link2 className="h-3 w-3" />
                  URLs
                  {totalUrlCount > 0 && (
                    <span className="ml-1 text-muted-foreground">({totalUrlCount} total)</span>
                  )}
                </Label>

                {/* — From library — */}
                <div className="space-y-1.5">
                  <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">
                    From Library
                    {form.urlIds.length > 0 && ` · ${form.urlIds.length} selected`}
                  </p>
                  {libraryUrls.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">
                      No URLs in your library yet. Add them on the{" "}
                      <a href="/url-library" className="underline text-primary">URL Library</a> page,
                      or add campaign-only URLs below.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-44 overflow-y-auto pr-1">
                      {libraryUrls.map((url) => {
                        const selected = form.urlIds.includes(url.id)
                        return (
                          <button
                            key={url.id}
                            type="button"
                            onClick={() => toggleUrl(url.id)}
                            className={`flex items-start gap-2 rounded-md border px-3 py-2 text-left text-xs transition-all ${
                              selected
                                ? "border-primary/40 bg-primary/5 text-foreground"
                                : "border-border text-muted-foreground hover:bg-muted/40"
                            }`}
                          >
                            <span className={`mt-0.5 h-3.5 w-3.5 shrink-0 rounded-sm border flex items-center justify-center ${
                              selected ? "border-primary bg-primary" : "border-muted-foreground/40"
                            }`}>
                              {selected && <span className="text-primary-foreground text-[9px]">✓</span>}
                            </span>
                            <div className="min-w-0">
                              <p className="font-medium text-foreground truncate">{url.title}</p>
                              <p className="text-muted-foreground truncate">{url.shortUrl}</p>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* — Campaign-only URLs — */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">
                      Campaign-Only URLs
                      {form.campaignUrls.length > 0 && ` · ${form.campaignUrls.length}`}
                    </p>
                    <div className="flex items-center gap-1.5">
                      {form.campaignUrls.length > 0 && (
                        <button
                          type="button"
                          onClick={clearCampaignUrls}
                          className="text-[10px] text-muted-foreground hover:text-destructive transition-colors"
                        >
                          Clear all
                        </button>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-6 text-[11px] px-2 gap-1"
                        onClick={() => setBulkCampaignOpen(true)}
                      >
                        <Upload className="h-3 w-3" />
                        Bulk Upload
                      </Button>
                    </div>
                  </div>

                  {form.campaignUrls.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">
                      These URLs stay private to this campaign and won&apos;t appear in your library.
                    </p>
                  ) : (
                    <div className="space-y-1 max-h-44 overflow-y-auto pr-1">
                      {form.campaignUrls.map((url) => (
                        <div
                          key={url.id}
                          className="flex items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-foreground truncate">{url.title}</p>
                            <p className="text-muted-foreground truncate">{url.originalUrl}</p>
                          </div>
                          <a
                            href={url.originalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 text-muted-foreground hover:text-foreground"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                          <button
                            type="button"
                            onClick={() => removeCampaignUrl(url.id)}
                            className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <Separator />

              {/* Row 4: Frequency + Start Date + Timezone */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Frequency <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={form.frequencyKey}
                    onValueChange={(v) => setForm((f) => ({ ...f, frequencyKey: v }))}
                  >
                    <SelectTrigger className="text-sm">
                      <SelectValue placeholder="Choose frequency" />
                    </SelectTrigger>
                    <SelectContent>
                      {FREQUENCY_PRESETS.map((preset) => {
                        const key = frequencyKey({ type: preset.type, value: preset.value })
                        return (
                          <SelectItem key={key} value={key}>
                            {preset.label}
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1">
                    <CalendarDays className="h-3 w-3" />
                    Start Date <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    type="date"
                    value={form.startDate}
                    onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                    className="text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1">
                    <Globe className="h-3 w-3" />
                    Timezone <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={form.timezone}
                    onValueChange={(v) => setForm((f) => ({ ...f, timezone: v }))}
                  >
                    <SelectTrigger className="text-sm">
                      <SelectValue placeholder="Select timezone" />
                    </SelectTrigger>
                    <SelectContent>
                      {COMMON_TIMEZONES.map((tz) => (
                        <SelectItem key={tz.value} value={tz.value}>
                          {tz.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Schedule preview */}
              {schedulePreview && (
                <div className="rounded-lg bg-muted/60 border border-border/60 px-4 py-3 space-y-1">
                  <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Zap className="h-3.5 w-3.5 text-amber-500" />
                    Schedule Preview
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total posts</p>
                      <p className="text-sm font-bold">{schedulePreview.totalSlots.toLocaleString()}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {totalUrlCount} URLs × {form.platforms.length} platform{form.platforms.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">First post</p>
                      <p className="text-sm font-bold">
                        {schedulePreview.firstPublishAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Last post</p>
                      <p className="text-sm font-bold">
                        {schedulePreview.lastPublishAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Duration</p>
                      <p className="text-sm font-bold">
                        {schedulePreview.durationDays === 0 ? "Same day" : `${schedulePreview.durationDays} days`}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Error */}
              {formError && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <X className="h-3 w-3" /> {formError}
                </p>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-1">
                <Button variant="ghost" size="sm" onClick={() => { setShowForm(false); setEditingCampaignId(null); setForm(EMPTY_FORM); setFormError(null) }}>
                  Cancel
                </Button>
                {editingCampaignId ? (
                  <Button size="sm" onClick={() => handleCreateCampaign(false)}>
                    Save Changes
                  </Button>
                ) : (
                  <>
                    <Button size="sm" onClick={() => handleCreateCampaign(false)}>
                      Create as Draft
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      onClick={() => handleCreateCampaign(true)}
                      disabled={!schedulePreview}
                    >
                      <Zap className="h-3.5 w-3.5" />
                      Create &amp; Activate
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ---- Filters ---- */}
        <SearchFilter
          search={search}
          onSearchChange={(v) => { setSearch(v); setPage(1) }}
          filters={[
            {
              placeholder: "All Statuses",
              value: statusFilter,
              onChange: (v) => { setStatusFilter(v); setPage(1) },
              options: [
                { label: "Active",    value: "active"    },
                { label: "Scheduled", value: "scheduled" },
                { label: "Paused",    value: "paused"    },
                { label: "Completed", value: "completed" },
                { label: "Draft",     value: "draft"     },
                { label: "Archived",  value: "archived"  },
              ],
            },
          ]}
          onClear={handleClear}
        />

        {/* ---- Campaign list ---- */}
        <div className="space-y-3">
          {paginated.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center text-muted-foreground">
                {search || statusFilter !== "all"
                  ? "No campaigns match your filters."
                  : "No campaigns yet. Create your first campaign above."}
              </CardContent>
            </Card>
          ) : (
            paginated.map((campaign) => (
              <CampaignCard
                key={campaign.id}
                campaign={campaign}
                onAction={handleAction}
                isGenerating={generatingFor === campaign.id}
              />
            ))
          )}
        </div>

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

      {/* ---- Campaign-only bulk upload dialog ---- */}
      <BulkUrlUpload
        open={bulkCampaignOpen}
        onOpenChange={setBulkCampaignOpen}
        onAdd={addCampaignUrls}
        mode="campaign"
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Campaign card component
// ---------------------------------------------------------------------------

function CampaignCard({
  campaign,
  onAction,
  isGenerating = false,
}: {
  campaign:    Campaign
  onAction:    (id: string, action: string) => void
  isGenerating?: boolean
}) {
  const actions = STATUS_ACTIONS[campaign.status] ?? []

  return (
    <Card className="hover:shadow-sm transition-shadow">
      <CardContent className="p-4 lg:p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0 space-y-2.5">

            {/* Name + status */}
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-sm leading-none">{campaign.name}</h3>
              <Badge variant={STATUS_VARIANTS[campaign.status]} className="capitalize text-[11px]">
                {campaign.status}
              </Badge>
              {isGenerating && (
                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground animate-pulse">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" />
                  Generating posts…
                </span>
              )}
            </div>

            {/* Description */}
            {campaign.description && (
              <p className="text-xs text-muted-foreground line-clamp-1">{campaign.description}</p>
            )}

            {/* Meta row */}
            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1">
                <CalendarDays className="h-3 w-3 shrink-0" />
                {campaign.startDate}
              </span>
              {campaign.frequency && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3 shrink-0" />
                  {campaign.frequency}
                </span>
              )}
              {campaign.timezone && (
                <span className="flex items-center gap-1">
                  <Globe className="h-3 w-3 shrink-0" />
                  {campaign.timezone.replace("_", " ")}
                </span>
              )}
              {(campaign.urlCount ?? 0) > 0 && (
                <span className="flex items-center gap-1">
                  <Link2 className="h-3 w-3 shrink-0" />
                  {campaign.urlCount} URL{(campaign.urlCount ?? 0) !== 1 ? "s" : ""}
                </span>
              )}
            </div>

            {/* Platform badges + stats */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex gap-1">
                {campaign.platforms.map((p) => (
                  <span
                    key={p}
                    title={PLATFORM_LABELS[p as AllPlatformId] ?? p}
                    className={`inline-flex items-center justify-center h-5 min-w-[22px] px-1 rounded text-[9px] font-bold ${platformBadge(p)}`}
                  >
                    {PLATFORM_ABBREV[p as AllPlatformId] ?? p.slice(0, 2).toUpperCase()}
                  </span>
                ))}
              </div>

              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {campaign.publishedPosts > 0 && (
                  <span>{campaign.publishedPosts} published</span>
                )}
                {campaign.scheduledPosts > 0 && (
                  <span>{campaign.scheduledPosts} scheduled</span>
                )}
                {campaign.failedPosts > 0 && (
                  <span className="text-destructive">{campaign.failedPosts} failed</span>
                )}
              </div>

              {campaign.successRate > 0 && (
                <div className="flex items-center gap-1.5">
                  <div className="h-1.5 w-20 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{ width: `${campaign.successRate}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                    <TrendingUp className="h-3 w-3" />
                    {campaign.successRate}%
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Actions dropdown */}
          <div className="flex items-center gap-1 shrink-0">
            {actions[0] && !actions[0].destructive && (
              <Button
                size="sm"
                variant={actions[0].action === "activate" || actions[0].action === "resume" ? "default" : "outline"}
                className="hidden sm:flex gap-1 h-7 text-xs px-2.5"
                onClick={() => onAction(campaign.id, actions[0].action)}
              >
                {actions[0].action === "activate" || actions[0].action === "resume" ? (
                  <Zap className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                {actions[0].label}
              </Button>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>View details</DropdownMenuItem>
                <DropdownMenuItem onClick={() => onAction(campaign.id, "edit")}>Edit</DropdownMenuItem>
                <DropdownMenuItem onClick={() => onAction(campaign.id, "duplicate")}>Duplicate</DropdownMenuItem>
                {actions.length > 0 && <DropdownMenuSeparator />}
                {actions.map((a) => (
                  <DropdownMenuItem
                    key={a.action}
                    className={a.destructive ? "text-destructive focus:text-destructive" : ""}
                    onClick={() => onAction(campaign.id, a.action)}
                  >
                    {a.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
