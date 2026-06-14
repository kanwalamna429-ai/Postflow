"use client"

import { useState, useMemo } from "react"
import { Header } from "@/components/layout/header"
import { SearchFilter } from "@/components/layout/search-filter"
import { Pagination } from "@/components/layout/pagination"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { BulkUrlUpload } from "@/components/url/bulk-url-upload"
import { useUrlStore } from "@/lib/url-store"
import { type UrlEntry } from "@/lib/mock-data"
import {
  Plus,
  Upload,
  Copy,
  ExternalLink,
  MoreHorizontal,
  MousePointerClick,
  Link2,
  Trash2,
  Database,
} from "lucide-react"

const PAGE_SIZE = 10

const EMPTY_FORM = { title: "", originalUrl: "", tags: "" }

export default function UrlLibraryPage() {
  const { urls, loading, addUrls, removeUrl, clearAll, dbError } = useUrlStore()

  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [copied, setCopied] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [addOpen, setAddOpen] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false)

  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState<Partial<typeof EMPTY_FORM>>({})

  const filtered = useMemo(() => {
    if (!search.trim()) return urls
    const q = search.toLowerCase()
    return urls.filter(
      (u) =>
        u.title.toLowerCase().includes(q) ||
        u.originalUrl.toLowerCase().includes(q) ||
        u.shortUrl.toLowerCase().includes(q) ||
        u.tags.some((t) => t.toLowerCase().includes(q))
    )
  }, [urls, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function copyToClipboard(url: string, id: string) {
    navigator.clipboard.writeText(url)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  function openAdd() {
    setForm(EMPTY_FORM)
    setErrors({})
    setAddOpen(true)
  }

  function validate() {
    const next: Partial<typeof EMPTY_FORM> = {}
    if (!form.title.trim()) next.title = "Title is required"
    if (!form.originalUrl.trim()) {
      next.originalUrl = "URL is required"
    } else {
      try { new URL(form.originalUrl.trim()) } catch {
        next.originalUrl = "Enter a valid URL (include https://)"
      }
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function handleSingleAdd() {
    if (!validate()) return
    setSaving(true)
    const id = crypto.randomUUID()
    const entry: UrlEntry = {
      id,
      title: form.title.trim(),
      originalUrl: form.originalUrl.trim(),
      shortUrl: form.originalUrl.trim(),
      clicks: 0,
      campaigns: [],
      createdAt: new Date().toLocaleDateString("en-US", {
        month: "short", day: "numeric", year: "numeric",
      }),
      tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
    }
    await addUrls([entry])
    setSaving(false)
    setAddOpen(false)
  }

  return (
    <div className="flex flex-col flex-1">
      <Header title="URL Library" />

      <main className="flex-1 p-4 lg:p-6 space-y-4">

        {/* ---- Migration needed banner ---- */}
        {dbError && (
          dbError.toLowerCase().includes("does not exist") ||
          dbError.toLowerCase().includes("relation") ||
          dbError.toLowerCase().includes("42p01")
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

        {/* ---- Top bar ---- */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-muted-foreground">
            {urls.length === 0
              ? "No URLs yet"
              : `${urls.length} URL${urls.length !== 1 ? "s" : ""} in library`}
          </p>
          <div className="flex items-center gap-2">
            {urls.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => setClearConfirmOpen(true)}
              >
                <Trash2 className="h-4 w-4" />
                Clear All
              </Button>
            )}
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setBulkOpen(true)}>
              <Upload className="h-4 w-4" />
              Bulk Upload
            </Button>
            <Button size="sm" className="gap-1.5" onClick={openAdd}>
              <Plus className="h-4 w-4" />
              Add URL
            </Button>
          </div>
        </div>

        {/* ---- Search ---- */}
        {urls.length > 0 && (
          <SearchFilter
            search={search}
            onSearchChange={(v) => { setSearch(v); setPage(1) }}
            onClear={() => { setSearch(""); setPage(1) }}
          />
        )}

        {/* ---- List ---- */}
        <div className="space-y-3">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4 lg:p-5">
                  <div className="flex items-start justify-between gap-4 animate-pulse">
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-48 rounded bg-muted" />
                      <div className="h-3 w-64 rounded bg-muted" />
                      <div className="h-3 w-32 rounded bg-muted" />
                    </div>
                    <div className="h-8 w-16 rounded bg-muted shrink-0" />
                  </div>
                </CardContent>
              </Card>
            ))
          ) : urls.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                  <Link2 className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium">No URLs in your library</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                    Add URLs individually or bulk-upload up to 100 at once. Assign them to campaigns to include in scheduled posts.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setBulkOpen(true)}>
                    <Upload className="h-4 w-4" />
                    Bulk Upload
                  </Button>
                  <Button size="sm" className="gap-1.5" onClick={openAdd}>
                    <Plus className="h-4 w-4" />
                    Add URL
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : paginated.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground text-sm">
                No URLs match your search.
              </CardContent>
            </Card>
          ) : (
            paginated.map((url) => (
              <Card key={url.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="p-4 lg:p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-sm leading-none truncate max-w-xs">
                          {url.title}
                        </h3>
                        {url.tags.map((tag) => (
                          <Badge key={tag} variant="secondary" className="text-[10px] h-4 px-1.5">
                            {tag}
                          </Badge>
                        ))}
                      </div>

                      <div className="flex items-center gap-2">
                        <a
                          href={url.shortUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-mono text-primary hover:underline truncate max-w-[200px]"
                        >
                          {url.shortUrl}
                        </a>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 shrink-0"
                          onClick={() => copyToClipboard(url.shortUrl, url.id)}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                        {copied === url.id && (
                          <span className="text-xs text-emerald-600 dark:text-emerald-400">Copied!</span>
                        )}
                      </div>

                      <p className="text-xs text-muted-foreground truncate max-w-sm">
                        {url.originalUrl}
                      </p>

                      <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <MousePointerClick className="h-3 w-3" />
                          {url.clicks.toLocaleString()} clicks
                        </span>
                        <span>Added {url.createdAt}</span>
                        {url.campaigns.length > 0 && (
                          <span>Campaign: {url.campaigns.join(", ")}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                        <a href={url.originalUrl} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem>Edit</DropdownMenuItem>
                          <DropdownMenuItem>View analytics</DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => removeUrl(url.id)}
                          >
                            Remove
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CardContent>
              </Card>
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

      {/* ---- Add single URL dialog ---- */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add URL</DialogTitle>
            <DialogDescription>Add a single URL to your library.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="url-title">Title</Label>
              <Input
                id="url-title"
                placeholder="My awesome article"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
              {errors.title && <p className="text-xs text-destructive">{errors.title}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="url-original">URL</Label>
              <Input
                id="url-original"
                placeholder="https://example.com/article"
                value={form.originalUrl}
                onChange={(e) => setForm((f) => ({ ...f, originalUrl: e.target.value }))}
              />
              {errors.originalUrl && <p className="text-xs text-destructive">{errors.originalUrl}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="url-tags">
                Tags{" "}
                <span className="text-muted-foreground font-normal text-xs">(optional, comma-separated)</span>
              </Label>
              <Input
                id="url-tags"
                placeholder="blog, marketing, launch"
                value={form.tags}
                onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleSingleAdd}>Add URL</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- Bulk upload dialog ---- */}
      <BulkUrlUpload
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        onAdd={async (entries) => { await addUrls(entries); setPage(1) }}
        mode="library"
      />

      {/* ---- Clear all confirm dialog ---- */}
      <Dialog open={clearConfirmOpen} onOpenChange={setClearConfirmOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Clear all URLs?</DialogTitle>
            <DialogDescription>This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-1">
            This will remove all {urls.length} URL{urls.length !== 1 ? "s" : ""} from your library. This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClearConfirmOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={async () => { await clearAll(); setClearConfirmOpen(false); setSearch(""); setPage(1) }}
            >
              Clear All
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
