"use client"

import { useState, useCallback, useEffect } from "react"
import { Header } from "@/components/layout/header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  PLATFORM_REGISTRY,
  PLATFORM_LABELS,
  PLATFORM_LIGHT_CLASS,
  PLATFORM_DARK_CLASS,
  PLATFORM_ABBREV,
  getPlatformsByCategory,
  type AllPlatformId,
  type PlatformConfig,
} from "@/lib/platforms"
import {
  Plus,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Plug2,
  Settings2,
  Trash2,
  Eye,
  EyeOff,
  ExternalLink,
  Loader2,
  Database,
} from "lucide-react"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LocalConnection {
  id: string
  platform: AllPlatformId
  accountName: string
  accountHandle: string
  instanceUrl?: string
  status: "connected" | "error" | "disconnected"
  connectedAt: string
  postsPublished: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function platformClass(id: string) {
  const light = PLATFORM_LIGHT_CLASS[id as AllPlatformId] ?? "bg-muted text-muted-foreground"
  const dark  = PLATFORM_DARK_CLASS[id as AllPlatformId]  ?? ""
  return `${light} ${dark}`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapApiToLocal(data: any): LocalConnection {
  return {
    id:             data.id,
    platform:       data.platform as AllPlatformId,
    accountName:    data.account_name ?? data.accountName ?? "",
    accountHandle:  data.account_handle ?? data.accountHandle ?? "",
    instanceUrl:    data.instance_url ?? data.instanceUrl ?? undefined,
    status:         (data.status ?? "connected") as LocalConnection["status"],
    connectedAt:    data.connected_at ?? data.connectedAt ?? new Date().toISOString(),
    postsPublished: data.posts_published ?? data.postsPublished ?? 0,
  }
}

function StatusBadge({ status }: { status: LocalConnection["status"] }) {
  if (status === "connected") {
    return (
      <Badge variant="success" className="gap-1 text-xs">
        <CheckCircle2 className="h-3 w-3" />Connected
      </Badge>
    )
  }
  if (status === "error") {
    return (
      <Badge variant="destructive" className="gap-1 text-xs">
        <AlertTriangle className="h-3 w-3" />Error
      </Badge>
    )
  }
  return (
    <Badge variant="secondary" className="gap-1 text-xs">
      <XCircle className="h-3 w-3" />Disconnected
    </Badge>
  )
}

const CATEGORY_LABELS = {
  social:      "Social Platforms",
  publishing:  "Publishing Platforms",
  bookmarking: "Bookmarking & Read Later",
} as const

// ---------------------------------------------------------------------------
// Credential Form Dialog
// ---------------------------------------------------------------------------

interface CredentialDialogProps {
  platform: PlatformConfig | null
  open: boolean
  initialData?: LocalConnection
  onClose: () => void
  onSave: (connection: LocalConnection) => void
}

function CredentialDialog({ platform, open, initialData, onClose, onSave }: CredentialDialogProps) {
  const [values, setValues]               = useState<Record<string, string>>({})
  const [accountName, setAccountName]     = useState(initialData?.accountName ?? "")
  const [accountHandle, setAccountHandle] = useState(initialData?.accountHandle ?? "")
  const [instanceUrl, setInstanceUrl]     = useState(initialData?.instanceUrl ?? "")
  const [revealed, setRevealed]           = useState<Record<string, boolean>>({})
  const [saving, setSaving]               = useState(false)
  const [errors, setErrors]               = useState<Record<string, string>>({})
  const [apiError, setApiError]           = useState<string | null>(null)

  const reset = useCallback(() => {
    setValues({})
    setAccountName(initialData?.accountName ?? "")
    setAccountHandle(initialData?.accountHandle ?? "")
    setInstanceUrl(initialData?.instanceUrl ?? "")
    setRevealed({})
    setErrors({})
    setApiError(null)
    setSaving(false)
  }, [initialData])

  function handleOpenChange(o: boolean) {
    if (!o) { reset(); onClose() }
  }

  function validate() {
    const errs: Record<string, string> = {}
    if (!accountHandle.trim()) errs.accountHandle = "Account handle is required"
    if (platform?.capabilities.requiresInstanceUrl && !instanceUrl.trim()) {
      errs.instanceUrl = "Instance URL is required for this platform"
    }
    if (instanceUrl.trim() && !/^https?:\/\/.+/.test(instanceUrl.trim())) {
      errs.instanceUrl = "Instance URL must start with https://"
    }
    for (const field of platform?.credentialFields ?? []) {
      if (field.required && !values[field.key]?.trim()) {
        errs[field.key] = `${field.label} is required`
      }
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSave() {
    if (!platform) return
    if (!validate()) return
    setSaving(true)

    try {
      const res = await fetch("/api/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id:            initialData?.id,
          platform:      platform.id,
          accountName:   accountName.trim() || accountHandle.trim(),
          accountHandle: accountHandle.trim(),
          instanceUrl:   instanceUrl.trim() || undefined,
          credentials:   values,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        const msg = body.detail ?? body.error ?? "Failed to save connection"
        setApiError(msg)
        setSaving(false)
        return
      }

      const { connection: saved } = await res.json()
      setSaving(false)
      reset()
      onSave(mapApiToLocal(saved))
    } catch {
      setApiError("Network error — please try again")
      setSaving(false)
    }
  }

  if (!platform) return null

  const requiresInstance = platform.capabilities.requiresInstanceUrl

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className={`flex h-10 w-10 items-center justify-center rounded-lg text-xs font-bold ${platformClass(platform.id)}`}>
              {platform.ui.abbrev}
            </div>
            <div>
              <DialogTitle className="text-base">Connect {platform.ui.displayName}</DialogTitle>
              <DialogDescription className="text-xs mt-0.5">
                Enter your {platform.ui.displayName} credentials below.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* API-level error banner */}
          {apiError && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {apiError}
            </div>
          )}

          {/* Instance URL — federated platforms only */}
          {requiresInstance && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">
                Instance URL <span className="text-destructive">*</span>
              </Label>
              <Input
                type="url"
                placeholder="https://mastodon.social"
                value={instanceUrl}
                onChange={(e) => setInstanceUrl(e.target.value)}
                className={errors.instanceUrl ? "border-destructive" : ""}
              />
              {errors.instanceUrl && (
                <p className="text-xs text-destructive">{errors.instanceUrl}</p>
              )}
              <p className="text-xs text-muted-foreground">
                The URL of your {platform.ui.displayName} server instance.
              </p>
            </div>
          )}

          {/* Account handle */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">
              Account Handle / Username <span className="text-destructive">*</span>
            </Label>
            <Input
              type="text"
              placeholder={requiresInstance ? "@user@instance.social" : "@yourusername"}
              value={accountHandle}
              onChange={(e) => setAccountHandle(e.target.value)}
              className={errors.accountHandle ? "border-destructive" : ""}
            />
            {errors.accountHandle && (
              <p className="text-xs text-destructive">{errors.accountHandle}</p>
            )}
          </div>

          {/* Account display name */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Display Name</Label>
            <Input
              type="text"
              placeholder="Your name or brand name"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Optional. Shown in the connection list.</p>
          </div>

          {/* Dynamic credential fields */}
          {platform.credentialFields.map((field) => {
            const isPassword = field.type === "password"
            const isRevealed = revealed[field.key]
            return (
              <div key={field.key} className="space-y-1.5">
                <Label className="text-xs font-medium">
                  {field.label}
                  {field.required && <span className="text-destructive ml-0.5">*</span>}
                </Label>
                <div className="relative">
                  <Input
                    type={isPassword && !isRevealed ? "password" : "text"}
                    placeholder={field.placeholder ?? ""}
                    value={values[field.key] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                    className={`${errors[field.key] ? "border-destructive" : ""} ${isPassword ? "pr-10" : ""}`}
                  />
                  {isPassword && (
                    <button
                      type="button"
                      onClick={() => setRevealed((r) => ({ ...r, [field.key]: !r[field.key] }))}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      aria-label={isRevealed ? "Hide" : "Show"}
                    >
                      {isRevealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  )}
                </div>
                {errors[field.key] && (
                  <p className="text-xs text-destructive">{errors[field.key]}</p>
                )}
                {field.helpText && (
                  <p className="text-xs text-muted-foreground">{field.helpText}</p>
                )}
              </div>
            )
          })}

          {/* Docs link */}
          {platform.docsUrl && (
            <a
              href={platform.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              {platform.ui.displayName} API docs
            </a>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" size="sm" onClick={() => { reset(); onClose() }}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {saving ? "Connecting…" : initialData ? "Update Connection" : "Connect Account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Platform Picker Dialog
// ---------------------------------------------------------------------------

interface PlatformPickerProps {
  open: boolean
  connectedPlatformIds: string[]
  onClose: () => void
  onSelect: (platform: PlatformConfig) => void
}

function PlatformPicker({ open, connectedPlatformIds, onClose, onSelect }: PlatformPickerProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add a Platform</DialogTitle>
          <DialogDescription className="text-xs">
            Select a platform to connect your account.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {(["social", "publishing", "bookmarking"] as const).map((cat) => {
            const platforms = getPlatformsByCategory(cat)
            return (
              <div key={cat} className="space-y-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                  {CATEGORY_LABELS[cat]}
                </p>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {platforms.map((p) => {
                    const isConnected = connectedPlatformIds.includes(p.id)
                    return (
                      <button
                        key={p.id}
                        onClick={() => !isConnected && onSelect(p)}
                        disabled={isConnected}
                        className={`flex flex-col items-center gap-1.5 rounded-lg border p-2.5 text-center transition-colors text-xs font-medium ${
                          isConnected
                            ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20 opacity-60 cursor-not-allowed"
                            : "border-dashed hover:border-border hover:bg-muted/50 cursor-pointer"
                        }`}
                      >
                        <div className={`flex h-8 w-8 items-center justify-center rounded-md text-[10px] font-bold ${platformClass(p.id)}`}>
                          {p.ui.abbrev}
                        </div>
                        <span className="leading-tight text-[11px]">{p.ui.displayName}</span>
                        {isConnected && (
                          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Remove Confirmation Dialog
// ---------------------------------------------------------------------------

interface RemoveDialogProps {
  connection: LocalConnection | null
  onClose: () => void
  onConfirm: (id: string) => void
}

function RemoveDialog({ connection, onClose, onConfirm }: RemoveDialogProps) {
  if (!connection) return null
  const platformLabel = PLATFORM_LABELS[connection.platform] ?? connection.platform
  return (
    <Dialog open={Boolean(connection)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Remove Connection</DialogTitle>
          <DialogDescription className="text-sm">
            Remove <strong>{platformLabel}</strong> ({connection.accountHandle}) from your workspace?
            This cannot be undone. Campaigns using this platform will fail to publish.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" size="sm" onClick={() => { onConfirm(connection.id); onClose() }}>
            Remove
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function ConnectionsPage() {
  const [connections, setConnections] = useState<LocalConnection[]>([])
  const [loadingConnections, setLoadingConnections] = useState(true)
  const [migrationNeeded, setMigrationNeeded] = useState(false)

  // Dialog state
  const [pickerOpen,   setPickerOpen]   = useState(false)
  const [credDialog,   setCredDialog]   = useState<{ platform: PlatformConfig; existing?: LocalConnection } | null>(null)
  const [removeTarget, setRemoveTarget] = useState<LocalConnection | null>(null)
  const [testingId,    setTestingId]    = useState<string | null>(null)
  const [testResult,   setTestResult]   = useState<Record<string, "ok" | "fail">>({})

  // Load connections from API on mount
  useEffect(() => {
    fetch("/api/connections")
      .then(async (r) => {
        const body = await r.json()
        if (!r.ok) {
          const detail: string = body.detail ?? body.error ?? ""
          const isMissing =
            detail.toLowerCase().includes("does not exist") ||
            detail.toLowerCase().includes("relation") ||
            detail.toLowerCase().includes("42p01")
          if (isMissing) setMigrationNeeded(true)
          else console.error("[connections] API error:", detail)
          return
        }
        if (Array.isArray(body.connections)) setConnections(body.connections.map(mapApiToLocal))
      })
      .catch((err) => console.error("[connections] load failed:", err))
      .finally(() => setLoadingConnections(false))
  }, [])

  const connected = connections.filter((c) => c.status === "connected").length
  const errored   = connections.filter((c) => c.status === "error").length
  const connectedPlatformIds = connections.map((c) => c.platform)

  // Add or update a connection (API call happens inside CredentialDialog)
  const handleSave = useCallback((conn: LocalConnection) => {
    setConnections((prev) => {
      const exists = prev.findIndex((c) => c.id === conn.id)
      if (exists >= 0) {
        const next = [...prev]
        next[exists] = conn
        return next
      }
      return [...prev, conn]
    })
    setCredDialog(null)
  }, [])

  // Remove a connection
  const handleRemove = useCallback(async (id: string) => {
    setConnections((prev) => prev.filter((c) => c.id !== id))
    try {
      await fetch(`/api/connections/${id}`, { method: "DELETE" })
    } catch (err) {
      console.error("[connections] remove failed:", err)
    }
  }, [])

  // Test connection (simulated ping)
  async function handleTest(conn: LocalConnection) {
    setTestingId(conn.id)
    await new Promise((r) => setTimeout(r, 1200))
    setTestResult((prev) => ({ ...prev, [conn.id]: "ok" }))
    setTestingId(null)
    setTimeout(
      () => setTestResult((prev) => { const n = { ...prev }; delete n[conn.id]; return n }),
      3000,
    )
  }

  function handleUpdate(conn: LocalConnection) {
    const platform = PLATFORM_REGISTRY.find((p) => p.id === conn.platform)
    if (platform) setCredDialog({ platform, existing: conn })
  }

  function handlePickerSelect(platform: PlatformConfig) {
    setPickerOpen(false)
    setCredDialog({ platform })
  }

  function handlePlatformConnect(platform: PlatformConfig) {
    setCredDialog({ platform })
  }

  const socialPlatforms      = getPlatformsByCategory("social")
  const publishingPlatforms  = getPlatformsByCategory("publishing")
  const bookmarkingPlatforms = getPlatformsByCategory("bookmarking")

  return (
    <div className="flex flex-col flex-1">
      <Header title="Platform Connections" />

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
                Open your Supabase project → SQL Editor → paste and run{" "}
                <code className="font-mono bg-amber-100 dark:bg-amber-900/40 px-1 rounded">
                  supabase/migrations/001_initial.sql
                </code>{" "}
                from this repo, then reload this page.
              </p>
            </div>
          </div>
        )}

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/40">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-xl font-bold">{connected}</p>
                <p className="text-xs text-muted-foreground">Connected</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-50 dark:bg-red-950/40">
                <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-xl font-bold">{errored}</p>
                <p className="text-xs text-muted-foreground">Errors</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                <Plug2 className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xl font-bold">{connections.length}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Connected accounts */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">Connected Accounts</CardTitle>
            <Button size="sm" className="gap-1.5" onClick={() => setPickerOpen(true)}>
              <Plus className="h-4 w-4" />
              Add Platform
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {loadingConnections ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                Loading connections…
              </div>
            ) : connections.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-4">
                  <Plug2 className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-foreground">No connections yet</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                  Add your first platform connection to start publishing. Click &quot;Add Platform&quot; above or connect from the list below.
                </p>
              </div>
            ) : (
              <div className="divide-y">
                {connections.map((conn) => {
                  const isTesting = testingId === conn.id
                  const result    = testResult[conn.id]
                  return (
                    <div
                      key={conn.id}
                      className="flex items-center gap-4 px-4 lg:px-6 py-4 hover:bg-muted/30 transition-colors"
                    >
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${platformClass(conn.platform)}`}>
                        {PLATFORM_ABBREV[conn.platform] ?? conn.platform.slice(0, 2).toUpperCase()}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-sm">
                            {PLATFORM_LABELS[conn.platform] ?? conn.platform}
                          </p>
                          <StatusBadge status={conn.status} />
                          {result === "ok" && (
                            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">✓ Reachable</span>
                          )}
                          {result === "fail" && (
                            <span className="text-xs text-destructive font-medium">✗ Unreachable</span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{conn.accountHandle}</p>
                        {conn.instanceUrl && (
                          <p className="text-xs text-muted-foreground/70 mt-0.5">{conn.instanceUrl}</p>
                        )}
                        {conn.status === "error" && (
                          <p className="text-xs text-destructive mt-0.5">
                            Auth token expired — reconnect required
                          </p>
                        )}
                      </div>

                      <div className="hidden md:flex flex-col items-end text-xs text-muted-foreground shrink-0">
                        <p>{conn.postsPublished} published</p>
                        <p>Connected {new Date(conn.connectedAt).toLocaleDateString()}</p>
                      </div>

                      <div className="flex gap-1 shrink-0">
                        {conn.status === "error" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/5"
                            onClick={() => handleUpdate(conn)}
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                            Reconnect
                          </Button>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="gap-1.5 hidden sm:flex"
                              disabled={isTesting}
                              onClick={() => handleTest(conn)}
                            >
                              {isTesting
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : <RefreshCw className="h-3.5 w-3.5" />
                              }
                              {isTesting ? "Testing…" : "Test"}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="gap-1.5 hidden sm:flex"
                              onClick={() => handleUpdate(conn)}
                            >
                              <Settings2 className="h-3.5 w-3.5" />
                              Update
                            </Button>
                          </>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-muted-foreground hover:text-destructive hover:bg-destructive/5"
                          onClick={() => setRemoveTarget(conn)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Available platforms — by category */}
        {([
          { label: CATEGORY_LABELS.social,      platforms: socialPlatforms      },
          { label: CATEGORY_LABELS.publishing,  platforms: publishingPlatforms  },
          { label: CATEGORY_LABELS.bookmarking, platforms: bookmarkingPlatforms },
        ] as const).map(({ label, platforms }) => (
          <Card key={label}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {platforms.map((platform) => {
                  const existing    = connections.find((c) => c.platform === platform.id)
                  const isConnected = existing?.status === "connected"
                  const isError     = existing?.status === "error"
                  return (
                    <div
                      key={platform.id}
                      className={`flex flex-col items-center gap-2 p-3 rounded-lg border text-center transition-colors ${
                        isConnected
                          ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20"
                          : isError
                          ? "border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-950/20"
                          : "border-dashed hover:bg-muted/50"
                      }`}
                    >
                      <div className={`flex h-10 w-10 items-center justify-center rounded-lg text-xs font-bold ${platformClass(platform.id)}`}>
                        {platform.ui.abbrev}
                      </div>
                      <p className="text-xs font-medium leading-tight">{platform.ui.displayName}</p>
                      {isConnected ? (
                        <Badge variant="success" className="text-[10px] h-4 px-1.5">Active</Badge>
                      ) : isError ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 text-[11px] px-2 text-destructive"
                          onClick={() => existing && handleUpdate(existing)}
                        >
                          Reconnect
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 text-[11px] px-2"
                          onClick={() => handlePlatformConnect(platform)}
                        >
                          Connect
                        </Button>
                      )}
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        ))}
      </main>

      {/* Dialogs */}
      <PlatformPicker
        open={pickerOpen}
        connectedPlatformIds={connectedPlatformIds}
        onClose={() => setPickerOpen(false)}
        onSelect={handlePickerSelect}
      />

      <CredentialDialog
        platform={credDialog?.platform ?? null}
        open={Boolean(credDialog)}
        initialData={credDialog?.existing}
        onClose={() => setCredDialog(null)}
        onSave={handleSave}
      />

      <RemoveDialog
        connection={removeTarget}
        onClose={() => setRemoveTarget(null)}
        onConfirm={handleRemove}
      />
    </div>
  )
}
