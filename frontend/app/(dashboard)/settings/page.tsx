"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import type { SupabaseClient } from "@supabase/supabase-js"
import { Header } from "@/components/layout/header"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react"
import {
  PLATFORM_LABELS,
  PLATFORM_ABBREV,
  PLATFORM_LIGHT_CLASS,
  PLATFORM_DARK_CLASS,
  PLATFORM_REGISTRY,
  type AllPlatformId,
} from "@/lib/platforms"
import {
  loadSettings,
  saveSettings,
  DEFAULT_PROFILE,
  DEFAULT_PLATFORM_SETTING,
  type WorkspaceProfile,
  type PlatformDefaults,
  type PlatformDefaultSettings,
} from "@/lib/services/settings"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSupabase(): SupabaseClient | null {
  try { return createClient() } catch { return null }
}

const TONE_OPTIONS  = ["professional", "casual", "conversational", "educational", "inspirational", "humorous"]
const STYLE_OPTIONS = ["concise", "detailed", "listicle", "storytelling"]

type SaveStatus = "idle" | "saving" | "saved" | "error"

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const [userId, setUserId] = useState<string | null>(null)

  // Profile state
  const [profile,       setProfile]       = useState<WorkspaceProfile>(DEFAULT_PROFILE)
  const [profileStatus, setProfileStatus] = useState<SaveStatus>("idle")
  const [profileError,  setProfileError]  = useState<string | null>(null)

  // Platform defaults state
  const [platformSettings,   setPlatformSettings]   = useState<PlatformDefaults>(() =>
    Object.fromEntries(
      PLATFORM_REGISTRY.map((p) => [
        p.id,
        {
          ...DEFAULT_PLATFORM_SETTING,
          tone:         p.aiConfig.toneDefault,
          includeEmoji: p.aiConfig.emojiStyle !== "none",
        },
      ])
    )
  )
  const [platformStatus, setPlatformStatus] = useState<SaveStatus>("idle")
  const [platformError,  setPlatformError]  = useState<string | null>(null)
  const [expandedPlatform, setExpandedPlatform] = useState<string | null>(null)
  const [loadingSettings,  setLoadingSettings]  = useState(true)

  // -------------------------------------------------------------------------
  // Load settings on mount
  // -------------------------------------------------------------------------
  useEffect(() => {
    async function load() {
      const supabase = getSupabase()
      if (!supabase) { setLoadingSettings(false); return }

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoadingSettings(false); return }

      setUserId(user.id)

      const [savedProfile, savedPlatforms] = await Promise.all([
        loadSettings<WorkspaceProfile>(supabase, user.id, "workspace_profile", DEFAULT_PROFILE),
        loadSettings<PlatformDefaults>(supabase, user.id, "platform_defaults", {}),
      ])

      setProfile(savedProfile)

      // Merge saved settings over the defaults (preserves default tone/emoji for platforms not yet saved)
      if (Object.keys(savedPlatforms).length > 0) {
        setPlatformSettings((prev) => {
          const merged = { ...prev }
          for (const id of Object.keys(savedPlatforms)) {
            merged[id] = { ...prev[id], ...savedPlatforms[id] }
          }
          return merged
        })
      }

      setLoadingSettings(false)
    }
    load()
  }, [])

  // -------------------------------------------------------------------------
  // Save profile
  // -------------------------------------------------------------------------
  async function handleSaveProfile() {
    if (!userId) return
    const supabase = getSupabase()
    if (!supabase) return

    setProfileStatus("saving")
    setProfileError(null)

    const { error } = await saveSettings(supabase, userId, "workspace_profile", profile)
    if (error) {
      setProfileError(error)
      setProfileStatus("error")
    } else {
      setProfileStatus("saved")
      setTimeout(() => setProfileStatus("idle"), 2500)
    }
  }

  // -------------------------------------------------------------------------
  // Save platform defaults
  // -------------------------------------------------------------------------
  async function handleSavePlatformDefaults() {
    if (!userId) return
    const supabase = getSupabase()
    if (!supabase) return

    setPlatformStatus("saving")
    setPlatformError(null)

    const { error } = await saveSettings(supabase, userId, "platform_defaults", platformSettings)
    if (error) {
      setPlatformError(error)
      setPlatformStatus("error")
    } else {
      setPlatformStatus("saved")
      setTimeout(() => setPlatformStatus("idle"), 2500)
    }
  }

  function updatePlatformSetting(platformId: string, key: keyof PlatformDefaultSettings, value: string | boolean | number) {
    setPlatformSettings((prev) => ({
      ...prev,
      [platformId]: { ...prev[platformId], [key]: value },
    }))
  }

  function platformClass(id: string) {
    const light = PLATFORM_LIGHT_CLASS[id as AllPlatformId] ?? "bg-muted text-muted-foreground"
    const dark  = PLATFORM_DARK_CLASS[id as AllPlatformId]  ?? ""
    return `${light} ${dark}`
  }

  function SaveButton({
    status,
    error,
    onClick,
    label = "Save changes",
    size = "default",
  }: {
    status: SaveStatus
    error: string | null
    onClick: () => void
    label?: string
    size?: "default" | "sm"
  }) {
    return (
      <div className="flex items-center gap-2">
        {error && (
          <span className="flex items-center gap-1 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5" /> {error}
          </span>
        )}
        {status === "saved" && (
          <span className="flex items-center gap-1 text-xs text-green-600">
            <CheckCircle2 className="h-3.5 w-3.5" /> Saved
          </span>
        )}
        <Button
          size={size}
          onClick={onClick}
          disabled={status === "saving" || !userId}
          variant={size === "sm" ? "outline" : "default"}
        >
          {status === "saving" && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
          {status === "saving" ? "Saving…" : label}
        </Button>
      </div>
    )
  }

  if (loadingSettings) {
    return (
      <div className="flex flex-col flex-1">
        <Header title="Settings" />
        <main className="flex-1 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </main>
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1">
      <Header title="Settings" />

      <main className="flex-1 p-4 lg:p-6">
        <Tabs defaultValue="profile" className="space-y-4">
          <TabsList className="w-full sm:w-auto flex-wrap h-auto gap-1">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="platforms">Platforms</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
            <TabsTrigger value="team">Team</TabsTrigger>
            <TabsTrigger value="billing">Billing</TabsTrigger>
            <TabsTrigger value="danger">Danger</TabsTrigger>
          </TabsList>

          {/* ---------------------------------------------------------------- */}
          {/* Profile                                                           */}
          {/* ---------------------------------------------------------------- */}
          <TabsContent value="profile" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Workspace Profile</CardTitle>
                <CardDescription>Update your organization details and preferences.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="org-name">Organization name</Label>
                    <Input
                      id="org-name"
                      value={profile.orgName}
                      onChange={(e) => setProfile((p) => ({ ...p, orgName: e.target.value }))}
                      placeholder="Your organization"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="org-url">Website URL</Label>
                    <Input
                      id="org-url"
                      value={profile.websiteUrl}
                      onChange={(e) => setProfile((p) => ({ ...p, websiteUrl: e.target.value }))}
                      placeholder="https://example.com"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="timezone">Timezone</Label>
                  <Input
                    id="timezone"
                    value={profile.timezone}
                    onChange={(e) => setProfile((p) => ({ ...p, timezone: e.target.value }))}
                    placeholder="UTC"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="contact-email">Contact email</Label>
                  <Input
                    id="contact-email"
                    type="email"
                    value={profile.contactEmail}
                    onChange={(e) => setProfile((p) => ({ ...p, contactEmail: e.target.value }))}
                    placeholder="admin@example.com"
                  />
                </div>
                <Separator />
                <div className="flex justify-end">
                  <SaveButton
                    status={profileStatus}
                    error={profileError}
                    onClick={handleSaveProfile}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---------------------------------------------------------------- */}
          {/* Platform Defaults                                                 */}
          {/* ---------------------------------------------------------------- */}
          <TabsContent value="platforms" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle>Platform AI Defaults</CardTitle>
                    <CardDescription className="mt-1">
                      Configure default tone, style, hashtags, and CTA for AI-generated posts
                      per platform. These settings apply when generating content on the Content page.
                    </CardDescription>
                  </div>
                  <SaveButton
                    status={platformStatus}
                    error={platformError}
                    onClick={handleSavePlatformDefaults}
                    label="Save all"
                    size="sm"
                  />
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y">
                  {PLATFORM_REGISTRY.map((platform) => {
                    const settings   = platformSettings[platform.id] ?? DEFAULT_PLATFORM_SETTING
                    const isExpanded = expandedPlatform === platform.id
                    const limits     = (PLATFORM_LIMITS_MAP as Record<string, { charLimit: number; hashtagCount: number }>)[platform.id]

                    return (
                      <div key={platform.id} className="px-4 lg:px-6">
                        <button
                          type="button"
                          onClick={() => setExpandedPlatform(isExpanded ? null : platform.id)}
                          className="w-full flex items-center gap-3 py-3.5 text-left hover:bg-transparent"
                        >
                          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${platformClass(platform.id)}`}>
                            {PLATFORM_ABBREV[platform.id as AllPlatformId] ?? platform.id.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">
                              {PLATFORM_LABELS[platform.id as AllPlatformId] ?? platform.id}
                            </p>
                            <p className="text-xs text-muted-foreground capitalize">
                              {platform.category} · {settings.tone} · {settings.style}
                              {limits && ` · ${limits.charLimit.toLocaleString()} chars`}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {settings.autoApprove && (
                              <Badge variant="secondary" className="text-[10px] h-4 px-1.5">Auto-approve</Badge>
                            )}
                            <span className="text-xs text-muted-foreground">
                              {isExpanded ? "▲" : "▼"}
                            </span>
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="pb-4 space-y-4 border-t pt-4">
                            {limits && (
                              <div className="flex flex-wrap gap-3 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                                <span>Max chars: <strong className="text-foreground">{limits.charLimit.toLocaleString()}</strong></span>
                                <span>Max hashtags: <strong className="text-foreground">{limits.hashtagCount}</strong></span>
                                <span>Category: <strong className="text-foreground capitalize">{platform.category}</strong></span>
                              </div>
                            )}

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div className="space-y-1.5">
                                <Label className="text-xs">Default Tone</Label>
                                <select
                                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                                  value={settings.tone}
                                  onChange={(e) => updatePlatformSetting(platform.id, "tone", e.target.value)}
                                >
                                  {TONE_OPTIONS.map((t) => (
                                    <option key={t} value={t} className="capitalize">{t}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-xs">Content Style</Label>
                                <select
                                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                                  value={settings.style}
                                  onChange={(e) => updatePlatformSetting(platform.id, "style", e.target.value)}
                                >
                                  {STYLE_OPTIONS.map((s) => (
                                    <option key={s} value={s} className="capitalize">{s}</option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            <div className="space-y-1.5">
                              <Label className="text-xs">Default Hashtags / Tags</Label>
                              <Input
                                placeholder="#marketing #content (space-separated)"
                                value={settings.hashtags}
                                onChange={(e) => updatePlatformSetting(platform.id, "hashtags", e.target.value)}
                                className="text-sm"
                              />
                              <p className="text-[11px] text-muted-foreground">
                                Added to every generated post for this platform. Prefix with # for hashtag platforms.
                              </p>
                            </div>

                            <div className="space-y-1.5">
                              <Label className="text-xs">Max Hashtags</Label>
                              <Input
                                type="number"
                                min={0}
                                max={30}
                                placeholder={limits ? String(limits.hashtagCount) : "5"}
                                value={settings.maxHashtags === 0 ? "" : settings.maxHashtags}
                                onChange={(e) => {
                                  const n = parseInt(e.target.value, 10)
                                  updatePlatformSetting(platform.id, "maxHashtags", isNaN(n) ? 0 : n)
                                }}
                                className="text-sm"
                              />
                              <p className="text-[11px] text-muted-foreground">
                                Maximum hashtags to include. Leave blank to use the platform default
                                {limits ? ` (${limits.hashtagCount})` : ""}.
                              </p>
                            </div>

                            <div className="space-y-1.5">
                              <Label className="text-xs">Default Call-to-Action</Label>
                              <Input
                                placeholder="e.g. Read the full article at the link below"
                                value={settings.cta}
                                onChange={(e) => updatePlatformSetting(platform.id, "cta", e.target.value)}
                                className="text-sm"
                              />
                              <p className="text-[11px] text-muted-foreground">
                                Appended to the AI prompt to guide the generated call-to-action.
                              </p>
                            </div>

                            <div className="flex items-center justify-between gap-4">
                              <div>
                                <p className="text-xs font-medium">Include Emoji</p>
                                <p className="text-[11px] text-muted-foreground">Add emoji to generated content for this platform</p>
                              </div>
                              <Switch
                                checked={settings.includeEmoji}
                                onCheckedChange={(v) => updatePlatformSetting(platform.id, "includeEmoji", v)}
                              />
                            </div>

                            <div className="flex items-center justify-between gap-4">
                              <div>
                                <p className="text-xs font-medium">Auto-Approve Generated Content</p>
                                <p className="text-[11px] text-muted-foreground">Mark as approved automatically — skip manual review</p>
                              </div>
                              <Switch
                                checked={settings.autoApprove}
                                onCheckedChange={(v) => updatePlatformSetting(platform.id, "autoApprove", v)}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                <div className="px-4 lg:px-6 py-4 border-t bg-muted/20">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-xs text-muted-foreground">
                      Changes affect all future AI generations. Existing posts are not modified.
                    </p>
                    <SaveButton
                      status={platformStatus}
                      error={platformError}
                      onClick={handleSavePlatformDefaults}
                      label="Save all platform defaults"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---------------------------------------------------------------- */}
          {/* Notifications                                                     */}
          {/* ---------------------------------------------------------------- */}
          <TabsContent value="notifications" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Email Notifications</CardTitle>
                <CardDescription>Choose what you get notified about.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-0 divide-y">
                {[
                  { id: "post-fail",     label: "Post failures",         desc: "Get notified when a post fails to publish",           default: true  },
                  { id: "post-success",  label: "Post published",        desc: "Confirmation when posts go live",                     default: false },
                  { id: "campaign-end",  label: "Campaign completed",    desc: "Summary when a campaign finishes",                    default: true  },
                  { id: "rate-limit",    label: "Rate limit warnings",   desc: "Alert when approaching platform limits",              default: true  },
                  { id: "auth-expire",   label: "Auth token expiry",     desc: "Reminder before platform tokens expire",              default: true  },
                  { id: "weekly-report", label: "Weekly digest",         desc: "Weekly performance summary email",                    default: false },
                ].map((item) => (
                  <div key={item.id} className="flex items-center justify-between py-4 gap-4">
                    <div>
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                    </div>
                    <Switch defaultChecked={item.default} />
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---------------------------------------------------------------- */}
          {/* Team                                                              */}
          {/* ---------------------------------------------------------------- */}
          <TabsContent value="team" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div>
                  <CardTitle>Team Members</CardTitle>
                  <CardDescription className="mt-1">Manage who has access to this workspace.</CardDescription>
                </div>
                <Button size="sm">Invite</Button>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y">
                  {[
                    { name: "Alex Chen",    email: "alex@example.com",  role: "Admin",  initials: "AC" },
                    { name: "Jamie Rivera", email: "jamie@example.com", role: "Editor", initials: "JR" },
                    { name: "Sam Patel",    email: "sam@example.com",   role: "Viewer", initials: "SP" },
                  ].map((member) => (
                    <div key={member.email} className="flex items-center gap-3 px-6 py-3.5">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium shrink-0">
                        {member.initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{member.name}</p>
                        <p className="text-xs text-muted-foreground">{member.email}</p>
                      </div>
                      <Badge variant={member.role === "Admin" ? "default" : "secondary"} className="text-xs">
                        {member.role}
                      </Badge>
                      {member.role !== "Admin" && (
                        <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive text-xs">
                          Remove
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---------------------------------------------------------------- */}
          {/* Billing                                                           */}
          {/* ---------------------------------------------------------------- */}
          <TabsContent value="billing" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Current Plan</CardTitle>
                <CardDescription>You are on the Free plan.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-4">
                  <div>
                    <p className="font-semibold">Free Plan</p>
                    <p className="text-sm text-muted-foreground mt-0.5">5 platform connections · 10 active campaigns</p>
                  </div>
                  <Badge variant="secondary">Current</Badge>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { name: "Pro",      price: "$29/mo", features: ["25 connections", "Unlimited campaigns", "Priority support"] },
                    { name: "Business", price: "$99/mo", features: ["Unlimited connections", "Team access", "Custom branding"] },
                  ].map((plan) => (
                    <div key={plan.name} className="rounded-lg border p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold">{plan.name}</p>
                        <p className="text-sm font-medium">{plan.price}</p>
                      </div>
                      <ul className="space-y-1">
                        {plan.features.map((f) => (
                          <li key={f} className="text-xs text-muted-foreground flex items-center gap-1.5">
                            <span className="text-emerald-500">✓</span> {f}
                          </li>
                        ))}
                      </ul>
                      <Button size="sm" variant="outline" className="w-full">Upgrade to {plan.name}</Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---------------------------------------------------------------- */}
          {/* Danger Zone                                                       */}
          {/* ---------------------------------------------------------------- */}
          <TabsContent value="danger" className="space-y-4">
            <Card className="border-destructive/30">
              <CardHeader>
                <CardTitle className="text-destructive">Danger Zone</CardTitle>
                <CardDescription>These actions are permanent and cannot be undone.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between gap-4 rounded-lg border border-destructive/20 bg-destructive/5 p-4">
                  <div>
                    <p className="text-sm font-medium">Delete all campaign data</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Permanently removes all campaigns and logs</p>
                  </div>
                  <Button variant="destructive" size="sm">Delete data</Button>
                </div>
                <div className="flex items-center justify-between gap-4 rounded-lg border border-destructive/20 bg-destructive/5 p-4">
                  <div>
                    <p className="text-sm font-medium">Delete workspace</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Permanently deletes your workspace and all data</p>
                  </div>
                  <Button variant="destructive" size="sm">Delete workspace</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Platform char limits map (for display in settings)
// ---------------------------------------------------------------------------
const PLATFORM_LIMITS_MAP: Record<string, { charLimit: number; hashtagCount: number }> = {
  twitter:    { charLimit: 280,   hashtagCount: 2  },
  linkedin:   { charLimit: 3000,  hashtagCount: 5  },
  instagram:  { charLimit: 2200,  hashtagCount: 15 },
  facebook:   { charLimit: 63206, hashtagCount: 3  },
  tiktok:     { charLimit: 2200,  hashtagCount: 6  },
  bluesky:    { charLimit: 300,   hashtagCount: 2  },
  mastodon:   { charLimit: 500,   hashtagCount: 4  },
  misskey:    { charLimit: 3000,  hashtagCount: 5  },
  pixelfed:   { charLimit: 2200,  hashtagCount: 10 },
  tumblr:     { charLimit: 4096,  hashtagCount: 10 },
  devto:      { charLimit: 5000,  hashtagCount: 4  },
  hashnode:   { charLimit: 5000,  hashtagCount: 5  },
  reddit:     { charLimit: 40000, hashtagCount: 0  },
  diigo:      { charLimit: 500,   hashtagCount: 5  },
  raindrop:   { charLimit: 500,   hashtagCount: 5  },
  pocket:     { charLimit: 200,   hashtagCount: 5  },
  instapaper: { charLimit: 200,   hashtagCount: 0  },
}
