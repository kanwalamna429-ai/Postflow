"use client"

import { useState, useEffect, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import type { SupabaseClient } from "@supabase/supabase-js"
import { Header } from "@/components/layout/header"
import { useCampaigns } from "@/lib/campaigns-store"
import { PLATFORM_BY_ID, PLATFORM_LIGHT_CLASS, PLATFORM_DARK_CLASS, type AllPlatformId } from "@/lib/platforms"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Loader2, RefreshCw, Sparkles, Send, CheckCircle2,
  ChevronDown, ChevronUp, Globe, FileText, Tag, User,
  Calendar, Image as ImageIcon, Link as LinkIcon, Hash,
  AlertCircle, Clock, CalendarDays, Zap,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { Campaign } from "@/lib/mock-data"

// ---------------------------------------------------------------------------
// Supabase helper
// ---------------------------------------------------------------------------
function getSupabase(): SupabaseClient | null {
  try { return createClient() } catch { return null }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CampaignUrl {
  id:           string
  original_url: string
  title:        string | null
  created_at:   string
}

interface ExtractedContent {
  id:           string
  title:        string | null
  description:  string | null
  author:       string | null
  og_image_url: string | null
  keywords:     string[]
  source_url:   string | null
  published_at: string | null
}

interface Connection {
  id:       string
  platform: string
  status:   string
}

interface GeneratedPost {
  platform:           string
  content:            string
  hashtags:           string[]
  charLimit:          number
  scheduledAt:        string
  generatedContentId: string
  scheduledPostId:    string
  connectionId:       string | null
  error?:             string
}

interface GenerateResponse {
  success:              boolean
  rewrittenTitle:       string | null
  rewrittenDescription: string | null
  ogImage:              string | null
  sourceUrl:            string | null
  scheduledAt:          string | null
  posts:                GeneratedPost[]
  error?:               string
}

type ExtractState  = "idle" | "extracting" | "done" | "error"
type GenerateState = "idle" | "generating" | "done"
type PublishState  = "idle" | "publishing" | "done" | "error"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatHost(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, "") } catch { return url }
}

function formatScheduledAt(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  const now = new Date()
  const diffMs = d.getTime() - now.getTime()
  if (diffMs < 0) return "Scheduled (overdue)"
  if (diffMs < 60_000) return "In less than a minute"
  if (diffMs < 3_600_000) return `In ${Math.round(diffMs / 60_000)} min`
  if (diffMs < 86_400_000) return `In ${Math.round(diffMs / 3_600_000)} hr`
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
}

const PLATFORMS_WITH_ADAPTERS = new Set([
  "bluesky", "mastodon", "misskey", "pixelfed", "tumblr",
  "devto", "hashnode", "reddit", "diigo", "raindrop", "pocket", "instapaper",
])

// ---------------------------------------------------------------------------
// Platform dot badge
// ---------------------------------------------------------------------------
function PlatformDot({ id, connected }: { id: string; connected: boolean }) {
  const light = PLATFORM_LIGHT_CLASS[id as AllPlatformId] ?? "bg-muted text-muted-foreground"
  const dark  = PLATFORM_DARK_CLASS[id as AllPlatformId]  ?? ""
  const cfg   = PLATFORM_BY_ID[id]
  return (
    <span
      title={`${cfg?.ui.displayName ?? id} — ${connected ? "connected" : "disconnected"}`}
      className={cn(
        "inline-flex h-5 w-5 items-center justify-center rounded text-[9px] font-bold shrink-0",
        light, dark,
        !connected && "opacity-40"
      )}
    >
      {cfg?.ui.abbrev ?? id.slice(0, 2).toUpperCase()}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Generated post card
// ---------------------------------------------------------------------------
interface PostCardProps {
  post:           GeneratedPost
  rewrittenTitle: string | null
  rewrittenDesc:  string | null
  ogImage:        string | null
  sourceUrl:      string | null
  editedContent:  string
  onChange:       (v: string) => void
  publishState:   PublishState
  publishError:   string
  publishSuccess: boolean
  onPublish:      () => void
}

function PostCard({
  post, rewrittenTitle, rewrittenDesc, ogImage, sourceUrl,
  editedContent, onChange, publishState, publishError, publishSuccess, onPublish,
}: PostCardProps) {
  const cfg        = PLATFORM_BY_ID[post.platform]
  const hasAdapter = PLATFORMS_WITH_ADAPTERS.has(post.platform)
  const canPublish = !!post.connectionId && hasAdapter
  const charCount  = editedContent.length
  const overLimit  = post.charLimit > 0 && charCount > post.charLimit

  const light = PLATFORM_LIGHT_CLASS[post.platform as AllPlatformId] ?? "bg-muted text-muted-foreground"
  const dark  = PLATFORM_DARK_CLASS[post.platform as AllPlatformId]  ?? ""

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* Platform header strip */}
      <div className={cn("flex items-center justify-between gap-2 px-3 py-2", light, dark)}>
        <span className="text-xs font-bold tracking-wide uppercase">
          {cfg?.ui.displayName ?? post.platform}
        </span>
        <div className="flex items-center gap-1.5">
          {post.charLimit > 0 && (
            <span className={cn(
              "text-[10px] tabular-nums font-medium",
              overLimit ? "text-destructive bg-white/80 px-1 rounded" : "opacity-70"
            )}>
              {charCount}/{post.charLimit.toLocaleString()}
            </span>
          )}
          {publishSuccess
            ? <Badge className="text-[10px] h-4 gap-0.5 bg-white/20 text-current border-current/20"><CheckCircle2 className="h-2.5 w-2.5" /> Published</Badge>
            : publishState === "error"
            ? <Badge variant="destructive" className="text-[10px] h-4">Failed</Badge>
            : !hasAdapter
            ? <Badge variant="outline" className="text-[10px] h-4 bg-white/20 border-current/20 text-current">No adapter</Badge>
            : !post.connectionId
            ? <Badge variant="outline" className="text-[10px] h-4 bg-white/20 border-current/20 text-current">Not connected</Badge>
            : <Badge variant="outline" className="text-[10px] h-4 bg-white/20 border-current/20 text-current">Ready</Badge>
          }
        </div>
      </div>

      <div className="p-3 space-y-3">
        {/* Featured image */}
        {ogImage && (
          <div className="rounded-md overflow-hidden border bg-muted/30 relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={ogImage}
              alt="Featured"
              className="w-full h-28 object-cover"
              onError={(e) => { (e.currentTarget as HTMLImageElement).parentElement!.style.display = "none" }}
            />
            <div className="absolute top-1.5 left-1.5">
              <span className="text-[9px] bg-black/50 text-white px-1.5 py-0.5 rounded-full flex items-center gap-1">
                <ImageIcon className="h-2.5 w-2.5" /> Image
              </span>
            </div>
          </div>
        )}

        {/* AI Title */}
        {rewrittenTitle && (
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-0.5 flex items-center gap-1">
              <Sparkles className="h-2.5 w-2.5" /> AI Title
            </p>
            <p className="text-sm font-semibold leading-snug">{rewrittenTitle}</p>
          </div>
        )}

        {/* AI Description */}
        {rewrittenDesc && (
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-0.5 flex items-center gap-1">
              <FileText className="h-2.5 w-2.5" /> Description
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">{rewrittenDesc}</p>
          </div>
        )}

        {/* Post body */}
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Post body</p>
          {post.error ? (
            <p className="text-xs text-destructive flex items-start gap-1.5 rounded bg-destructive/5 p-2">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> {post.error}
            </p>
          ) : (
            <Textarea
              value={editedContent}
              onChange={(e) => onChange(e.target.value)}
              className={cn(
                "text-sm min-h-[80px] resize-none",
                overLimit && "border-destructive focus-visible:ring-destructive"
              )}
              disabled={publishState === "publishing" || publishSuccess}
            />
          )}
        </div>

        {/* Hashtags */}
        {post.hashtags.length > 0 && (
          <div className="flex items-start gap-1.5 flex-wrap">
            <Hash className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
            {post.hashtags.map((h) => (
              <span key={h} className="text-xs text-primary font-medium">
                {h.startsWith("#") ? h : `#${h}`}
              </span>
            ))}
          </div>
        )}

        {/* Source URL */}
        {sourceUrl && (
          <div className="flex items-center gap-1.5">
            <LinkIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <a href={sourceUrl} target="_blank" rel="noopener noreferrer"
              className="text-xs text-primary hover:underline truncate">
              {sourceUrl}
            </a>
          </div>
        )}

        {/* Scheduled time */}
        {post.scheduledAt && !publishSuccess && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            <span>Scheduled: {formatScheduledAt(post.scheduledAt)}</span>
          </div>
        )}

        {/* Error */}
        {publishError && (
          <p className="text-xs text-destructive flex items-start gap-1.5">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> {publishError}
          </p>
        )}

        {/* Action */}
        {!publishSuccess && !post.error && (
          <Button
            size="sm"
            className="h-8 text-xs gap-1.5 w-full"
            variant={canPublish ? "default" : "outline"}
            onClick={onPublish}
            disabled={publishState === "publishing" || !canPublish || overLimit}
          >
            {publishState === "publishing"
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : <Send className="h-3 w-3" />}
            {publishState === "publishing"
              ? "Publishing…"
              : canPublish
              ? "Publish Now"
              : !hasAdapter
              ? "Adapter Pending"
              : "Connect Platform First"}
          </Button>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// URL Card — one per URL in the campaign
// ---------------------------------------------------------------------------
interface UrlCardProps {
  url:         CampaignUrl
  campaign:    Campaign
  connections: Connection[]
}

function UrlCard({ url, campaign, connections }: UrlCardProps) {
  const [extractState,  setExtractState]  = useState<ExtractState>("idle")
  const [extractError,  setExtractError]  = useState<string | null>(null)
  const [extracted,     setExtracted]     = useState<ExtractedContent | null>(null)
  const [showExtracted, setShowExtracted] = useState(false)

  const [generateState,        setGenerateState]        = useState<GenerateState>("idle")
  const [generateError,        setGenerateError]        = useState<string | null>(null)
  const [generatedPosts,       setGeneratedPosts]       = useState<GeneratedPost[]>([])
  const [rewrittenTitle,       setRewrittenTitle]       = useState<string | null>(null)
  const [rewrittenDesc,        setRewrittenDesc]        = useState<string | null>(null)
  const [generatedOgImage,     setGeneratedOgImage]     = useState<string | null>(null)
  const [generatedSourceUrl,   setGeneratedSourceUrl]   = useState<string | null>(null)

  const [editedContent,  setEditedContent]  = useState<Record<string, string>>({})
  const [publishStates,  setPublishStates]  = useState<Record<string, PublishState>>({})
  const [publishErrors,  setPublishErrors]  = useState<Record<string, string>>({})
  const [publishSuccess, setPublishSuccess] = useState<Record<string, boolean>>({})

  // Load any existing extracted_content for this URL
  useEffect(() => {
    const supabase = getSupabase()
    if (!supabase) return
    supabase
      .from("extracted_content")
      .select("id, title, description, author, og_image_url, keywords, source_url, published_at")
      .eq("url_id", url.id)
      .maybeSingle()
      .then(({ data }) => { if (data) setExtracted(data) })
  }, [url.id])

  // Restore previously generated posts from Supabase so state survives navigation
  useEffect(() => {
    let active = true
    const supabase = getSupabase()
    if (!supabase) return
    ;(async () => {
      try {
        const { data: posts } = await supabase
          .from("scheduled_posts")
          .select("id, platform, content, metadata, connection_id, scheduled_at")
          .eq("campaign_id", campaign.id)
          .eq("url_id", url.id)
          .in("status", ["pending", "failed"])
          .is("deleted_at", null)
          .order("created_at", { ascending: true })

        if (!active) return
        if (!posts || posts.length === 0) return

        // Skip placeholder rows that have no real AI content yet
        const readyPosts = posts.filter(
          (p) => p.content && !(p.metadata as Record<string, unknown>)?.content_pending
        )
        if (readyPosts.length === 0) return

        const reconstructed: GeneratedPost[] = readyPosts.map((p) => {
          const meta = (p.metadata ?? {}) as Record<string, unknown>
          return {
            platform:           p.platform,
            content:            p.content ?? "",
            hashtags:           Array.isArray(meta.hashtags) ? (meta.hashtags as string[]) : [],
            charLimit:          typeof meta.char_limit === "number" ? meta.char_limit : 500,
            scheduledAt:        p.scheduled_at ?? "",
            generatedContentId: "",
            scheduledPostId:    p.id,
            connectionId:       p.connection_id ?? null,
          }
        })

        setGeneratedPosts(reconstructed)
        setGenerateState("done")

        // Restore shared display metadata from the first post
        const firstMeta = (readyPosts[0].metadata ?? {}) as Record<string, unknown>
        if (typeof firstMeta.title       === "string") setRewrittenTitle(firstMeta.title)
        if (typeof firstMeta.description === "string") setRewrittenDesc(firstMeta.description)
        if (typeof firstMeta.og_image    === "string") setGeneratedOgImage(firstMeta.og_image)
        if (typeof firstMeta.source_url  === "string") setGeneratedSourceUrl(firstMeta.source_url)

        // Pre-populate editable content
        const init: Record<string, string> = {}
        for (const p of reconstructed) init[p.platform] = p.content
        setEditedContent(init)
      } catch {
        // Persistence is best-effort — ignore errors silently
      }
    })()
    return () => { active = false }
  }, [url.id, campaign.id])

  // ---- Extract ----
  async function handleExtract() {
    setExtractState("extracting")
    setExtractError(null)
    try {
      const res  = await fetch("/api/extract", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urlId: url.id }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error ?? "Extraction failed")
      setExtracted({
        id:           data.extractedContentId,
        title:        data.title,
        description:  data.description,
        author:       data.author,
        og_image_url: data.ogImage,
        keywords:     data.keywords ?? [],
        source_url:   data.sourceUrl,
        published_at: data.publishDate,
      })
      setExtractState("done")
      setShowExtracted(true)
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : "Unknown error")
      setExtractState("error")
    }
  }

  // ---- Generate posts for all campaign platforms ----
  async function handleGenerate() {
    setGenerateState("generating")
    setGenerateError(null)
    setGeneratedPosts([])
    try {
      const res  = await fetch("/api/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urlId: url.id, campaignId: campaign.id }),
      })
      const data: GenerateResponse = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error ?? "Generation failed")

      setGeneratedPosts(data.posts)
      setRewrittenTitle(data.rewrittenTitle)
      setRewrittenDesc(data.rewrittenDescription)
      setGeneratedOgImage(data.ogImage)
      setGeneratedSourceUrl(data.sourceUrl)

      const init: Record<string, string> = {}
      for (const p of data.posts) init[p.platform] = p.content
      setEditedContent(init)
      setGenerateState("done")
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "Unknown error")
      setGenerateState("done")
    }
  }

  // ---- Publish ----
  async function handlePublish(post: GeneratedPost) {
    if (!post.scheduledPostId) return
    const { platform } = post
    setPublishStates((s) => ({ ...s, [platform]: "publishing" }))
    setPublishErrors((e)  => ({ ...e, [platform]: "" }))

    try {
      let scheduledPostId = post.scheduledPostId

      // If content edited, re-generate just this platform with the edited text
      const edited = editedContent[platform]
      if (edited && edited !== post.content) {
        const regenRes = await fetch("/api/generate", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            urlId: url.id,
            campaignId: campaign.id,
            editedContent: { [platform]: edited },
          }),
        })
        const regenData: GenerateResponse = await regenRes.json()
        // Match by platform — posts[0] may be a different platform
        const regenPost = regenData.posts?.find((p: GeneratedPost) => p.platform === platform)
        if (regenData.success && regenPost?.scheduledPostId) {
          scheduledPostId = regenPost.scheduledPostId
        }
      }

      const res  = await fetch("/api/publish-now", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledPostIds: [scheduledPostId] }),
      })
      const data = await res.json()
      const result = data.results?.[0]

      if (!res.ok || !result?.success) {
        setPublishErrors((e) => ({ ...e, [platform]: result?.error ?? data.error ?? "Publish failed" }))
        setPublishStates((s) => ({ ...s, [platform]: "error" }))
      } else {
        setPublishStates((s)  => ({ ...s, [platform]: "done" }))
        setPublishSuccess((s) => ({ ...s, [platform]: true }))
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error"
      setPublishErrors((e) => ({ ...e, [platform]: msg }))
      setPublishStates((s) => ({ ...s, [platform]: "error" }))
    }
  }

  const connectedSet = new Set(
    connections.filter((c) => c.status === "connected").map((c) => c.platform)
  )

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-tight truncate">
              {url.title ?? formatHost(url.original_url)}
            </p>
            <a href={url.original_url} target="_blank" rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:underline truncate block mt-0.5">
              {formatHost(url.original_url)}
            </a>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {extracted && (
              <Badge variant="secondary" className="text-xs gap-1 h-6">
                <CheckCircle2 className="h-3 w-3 text-green-500" /> Extracted
              </Badge>
            )}
            <Button size="sm" variant="outline" onClick={handleExtract}
              disabled={extractState === "extracting"} className="h-7 text-xs gap-1.5">
              {extractState === "extracting"
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : <RefreshCw className="h-3 w-3" />}
              {extractState === "extracting" ? "Extracting…" : extracted ? "Re-extract" : "Extract"}
            </Button>
          </div>
        </div>
        {extractState === "error" && extractError && (
          <p className="text-xs text-destructive mt-1 flex items-center gap-1">
            <AlertCircle className="h-3.5 w-3.5" /> {extractError}
          </p>
        )}
      </CardHeader>

      {/* Extracted content summary */}
      {extracted && (
        <div className="px-6 pb-3">
          <button onClick={() => setShowExtracted((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            {showExtracted ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {showExtracted ? "Hide" : "Show"} extracted content
          </button>

          {showExtracted && (
            <div className="mt-2 rounded-lg border bg-muted/40 p-3 space-y-2 text-sm">
              {extracted.og_image_url && (
                <div className="rounded overflow-hidden border max-h-28">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={extracted.og_image_url} alt="OG"
                    className="w-full h-28 object-cover"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).parentElement!.style.display = "none" }} />
                </div>
              )}
              {extracted.title && (
                <div className="flex gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  <p className="text-sm font-medium leading-snug">{extracted.title}</p>
                </div>
              )}
              {extracted.description && (
                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 pl-6">
                  {extracted.description}
                </p>
              )}
              <div className="flex flex-wrap gap-x-4 gap-y-1 pl-6">
                {extracted.author && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <User className="h-3 w-3" /> {extracted.author}
                  </span>
                )}
                {extracted.published_at && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    {new Date(extracted.published_at).toLocaleDateString()}
                  </span>
                )}
              </div>
              {extracted.keywords.length > 0 && (
                <div className="flex items-start gap-2 pl-6">
                  <Tag className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="flex flex-wrap gap-1">
                    {extracted.keywords.slice(0, 6).map((k) => (
                      <Badge key={k} variant="outline" className="text-xs px-1.5 py-0">{k}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <CardContent className="pt-0">
        <div className="border-t pt-4 space-y-3">
          {/* Platform targets for this URL */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Posting to:</span>
            {campaign.platforms.map((p) => (
              <PlatformDot key={p} id={p} connected={connectedSet.has(p)} />
            ))}
          </div>

          {/* Generate button */}
          <Button
            onClick={handleGenerate}
            disabled={generateState === "generating"}
            size="sm"
            className="h-8 text-xs gap-1.5 w-full sm:w-auto"
          >
            {generateState === "generating"
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Sparkles className="h-3.5 w-3.5" />}
            {generateState === "generating"
              ? `Generating for ${campaign.platforms.length} platform${campaign.platforms.length > 1 ? "s" : ""}…`
              : generatedPosts.length > 0
              ? "Re-generate All"
              : "Generate & Schedule Posts"}
          </Button>

          {generateError && (
            <p className="text-xs text-destructive flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5" /> {generateError}
            </p>
          )}

          {/* Generated post cards — one per platform */}
          {generatedPosts.length > 0 && (
            <div className="space-y-3 pt-1">
              <div className="flex items-center gap-2">
                <p className="text-xs font-medium text-muted-foreground">Generated posts</p>
                {(rewrittenTitle || rewrittenDesc) && (
                  <Badge variant="secondary" className="text-[10px] gap-1 h-4">
                    <Sparkles className="h-2.5 w-2.5" /> AI-enhanced
                  </Badge>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {generatedPosts.map((post) => (
                  <PostCard
                    key={post.platform}
                    post={post}
                    rewrittenTitle={rewrittenTitle}
                    rewrittenDesc={rewrittenDesc}
                    ogImage={generatedOgImage}
                    sourceUrl={generatedSourceUrl}
                    editedContent={editedContent[post.platform] ?? post.content}
                    onChange={(v) => setEditedContent((prev) => ({ ...prev, [post.platform]: v }))}
                    publishState={publishStates[post.platform]  ?? "idle"}
                    publishError={publishErrors[post.platform]  ?? ""}
                    publishSuccess={publishSuccess[post.platform] ?? false}
                    onPublish={() => handlePublish(post)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Campaign info bar
// ---------------------------------------------------------------------------
function CampaignInfoBar({ campaign, connections }: { campaign: Campaign; connections: Connection[] }) {
  const connectedSet = new Set(
    connections.filter((c) => c.status === "connected").map((c) => c.platform)
  )
  const connectedCount = campaign.platforms.filter((p) => connectedSet.has(p)).length

  return (
    <div className="rounded-lg border bg-muted/30 px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
      <div className="flex items-center gap-2">
        <div className="flex gap-1">
          {campaign.platforms.map((p) => (
            <PlatformDot key={p} id={p} connected={connectedSet.has(p)} />
          ))}
        </div>
        <span className="text-xs text-muted-foreground">
          {connectedCount}/{campaign.platforms.length} connected
        </span>
      </div>

      {campaign.frequency && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Zap className="h-3.5 w-3.5" />
          <span>{campaign.frequency}</span>
        </div>
      )}

      {campaign.startDate && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarDays className="h-3.5 w-3.5" />
          <span>Starts {new Date(campaign.startDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
        </div>
      )}

      {campaign.timezone && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Globe className="h-3.5 w-3.5" />
          <span>{campaign.timezone}</span>
        </div>
      )}

      <Badge
        variant={campaign.status === "active" ? "default" : "secondary"}
        className="text-xs ml-auto capitalize"
      >
        {campaign.status}
      </Badge>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------
export default function ContentPage() {
  const { campaigns, loading: campaignsLoading } = useCampaigns()

  const [selectedCampaignId, setSelectedCampaignId] = useState<string>("")
  const [campaignUrls,       setCampaignUrls]        = useState<CampaignUrl[]>([])
  const [connections,        setConnections]         = useState<Connection[]>([])
  const [urlsLoading,        setUrlsLoading]         = useState(false)
  const [connectionsLoaded,  setConnectionsLoaded]   = useState(false)

  const selectedCampaign = campaigns.find((c) => c.id === selectedCampaignId) ?? null

  // Auto-select first campaign when loaded
  useEffect(() => {
    if (!campaignsLoading && campaigns.length > 0 && !selectedCampaignId) {
      setSelectedCampaignId(campaigns[0].id)
    }
  }, [campaigns, campaignsLoading, selectedCampaignId])

  // Load connections once on mount
  useEffect(() => {
    const supabase = getSupabase()
    if (!supabase) { setConnectionsLoaded(true); return }
    ;(async () => {
      try {
        const { data, error } = await supabase
          .from("platform_connections")
          .select("id, platform, status")
          .is("deleted_at", null)
        if (!error) setConnections(data ?? [])
      } catch {
        // ignore fetch errors
      } finally {
        setConnectionsLoaded(true)
      }
    })()
  }, [])

  // Load URLs for selected campaign using campaign.url_ids
  const loadUrls = useCallback(async (campaignId: string) => {
    const supabase = getSupabase()
    if (!supabase) return

    setUrlsLoading(true)
    setCampaignUrls([])

    try {
      // Step 1: get the ordered url_ids from the campaign row
      const { data: campRow } = await supabase
        .from("campaigns")
        .select("url_ids")
        .eq("id", campaignId)
        .single()

      const urlIds: string[] = campRow?.url_ids ?? []

      if (urlIds.length === 0) {
        setUrlsLoading(false)
        return
      }

      // Step 2: fetch the URL rows matching those IDs
      const { data: urls } = await supabase
        .from("campaign_urls")
        .select("id, original_url, title, created_at")
        .in("id", urlIds)
        .is("deleted_at", null)

      // Preserve the order from url_ids
      const sorted = (urls ?? []).sort(
        (a, b) => urlIds.indexOf(a.id) - urlIds.indexOf(b.id)
      )
      setCampaignUrls(sorted)
    } finally {
      setUrlsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (selectedCampaignId) loadUrls(selectedCampaignId)
  }, [selectedCampaignId, loadUrls])

  // ---- Render ----
  const isLoading = campaignsLoading || !connectionsLoaded

  return (
    <div className="flex flex-col flex-1">
      <Header title="Content" />

      <main className="flex-1 p-4 lg:p-6 space-y-5">

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : campaigns.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <Sparkles className="h-10 w-10 text-muted-foreground mb-4" />
              <h3 className="font-medium mb-1">No campaigns yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Create a campaign with platforms and URLs to start generating content.
              </p>
              <Button size="sm" asChild><a href="/campaigns">Go to Campaigns</a></Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Campaign selector */}
            <div className="flex items-center gap-3 flex-wrap">
              <label className="text-sm font-medium shrink-0">Campaign</label>
              <Select value={selectedCampaignId} onValueChange={setSelectedCampaignId}>
                <SelectTrigger className="w-72">
                  <SelectValue placeholder="Select a campaign…" />
                </SelectTrigger>
                <SelectContent>
                  {campaigns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="flex items-center gap-2">
                        {c.name}
                        <Badge
                          variant={c.status === "active" ? "default" : "secondary"}
                          className="text-[10px] h-4"
                        >
                          {c.status}
                        </Badge>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="ghost" size="sm" className="text-xs h-7 text-muted-foreground gap-1" asChild>
                <a href="/settings"><Sparkles className="h-3 w-3" /> AI settings</a>
              </Button>
            </div>

            {/* Campaign info bar */}
            {selectedCampaign && (
              <CampaignInfoBar campaign={selectedCampaign} connections={connections} />
            )}

            {/* URL list */}
            {urlsLoading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : campaignUrls.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <Globe className="h-8 w-8 text-muted-foreground mb-3" />
                  <h3 className="font-medium mb-1">No URLs in this campaign</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Add URLs to this campaign from the Campaigns page.
                  </p>
                  <Button size="sm" variant="outline" asChild>
                    <a href="/campaigns">Open Campaigns</a>
                  </Button>
                </CardContent>
              </Card>
            ) : selectedCampaign && (
              <>
                <p className="text-xs text-muted-foreground">
                  {campaignUrls.length} URL{campaignUrls.length > 1 ? "s" : ""} in this campaign.
                  Extract content, generate AI posts for all platforms, then publish or let the scheduler handle it.
                </p>
                <div className="grid gap-5 lg:grid-cols-2">
                  {campaignUrls.map((u) => (
                    <UrlCard
                      key={u.id}
                      url={u}
                      campaign={selectedCampaign}
                      connections={connections}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </main>
    </div>
  )
}
