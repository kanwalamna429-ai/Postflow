"use client"

import { useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import { type UrlEntry } from "@/lib/mock-data"
import { Upload, X, CheckCircle, AlertCircle } from "lucide-react"

const MAX_URLS = 100

function titleFromUrl(urlStr: string): string {
  try {
    const u = new URL(urlStr)
    const parts = u.pathname.replace(/\/$/, "").split("/").filter(Boolean)
    const last = parts[parts.length - 1] ?? ""
    if (last) {
      return last
        .replace(/[-_+]/g, " ")
        .replace(/\.(html?|php|aspx|htm)$/i, "")
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .trim()
    }
    return u.hostname.replace(/^www\./, "")
  } catch {
    return urlStr.slice(0, 60)
  }
}

function makeShortUrl(urlStr: string): string {
  try {
    const host = new URL(urlStr).hostname.replace(/^www\./, "")
    const slug = Math.random().toString(36).slice(2, 8)
    return `https://${host}/s/${slug}`
  } catch {
    return urlStr
  }
}

function parseLines(text: string): { valid: string[]; invalid: string[]; skipped: number } {
  const raw = text.split("\n").map((l) => l.trim()).filter(Boolean)
  const skipped = Math.max(0, raw.length - MAX_URLS)
  const capped = raw.slice(0, MAX_URLS)
  const valid: string[] = []
  const invalid: string[] = []
  for (const line of capped) {
    try {
      new URL(line)
      valid.push(line)
    } catch {
      invalid.push(line)
    }
  }
  return { valid, invalid, skipped }
}

interface BulkUrlUploadProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdd: (entries: UrlEntry[]) => void
  mode?: "library" | "campaign"
}

export function BulkUrlUpload({ open, onOpenChange, onAdd, mode = "library" }: BulkUrlUploadProps) {
  const [text, setText] = useState("")

  const parsed = useMemo(() => parseLines(text), [text])

  function handleAdd() {
    if (parsed.valid.length === 0) return
    const now = new Date().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
    const entries: UrlEntry[] = parsed.valid.map((url) => ({
      id: crypto.randomUUID(),
      title: titleFromUrl(url),
      originalUrl: url,
      shortUrl: makeShortUrl(url),
      clicks: 0,
      campaigns: [],
      createdAt: now,
      tags: [],
    }))
    onAdd(entries)
    setText("")
    onOpenChange(false)
  }

  function handleClose() {
    setText("")
    onOpenChange(false)
  }

  const hasText = text.trim().length > 0

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Bulk Upload URLs
          </DialogTitle>
          <DialogDescription>
            {mode === "campaign"
              ? "These URLs will be added to this campaign only — not to your library."
              : "Paste up to 100 URLs, one per line. They will be added to your library."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <textarea
            className="w-full h-44 rounded-md border border-[var(--input)] bg-transparent px-3 py-2 text-sm font-mono placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-[var(--ring)]"
            placeholder={"https://example.com/article-one\nhttps://example.com/article-two\nhttps://example.com/article-three"}
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
          />

          {hasText && (
            <div className="space-y-1.5 text-xs">
              {parsed.valid.length > 0 && (
                <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle className="h-3.5 w-3.5 shrink-0" />
                  <span>{parsed.valid.length} valid URL{parsed.valid.length !== 1 ? "s" : ""} ready to add</span>
                </div>
              )}
              {parsed.invalid.length > 0 && (
                <div className="flex items-start gap-1.5 text-amber-600 dark:text-amber-400">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>
                    {parsed.invalid.length} line{parsed.invalid.length !== 1 ? "s" : ""} skipped — not valid URLs
                    {parsed.invalid.length <= 3 && (
                      <span className="block text-muted-foreground font-mono mt-0.5">
                        {parsed.invalid.map((l) => `  • ${l.slice(0, 50)}`).join("\n")}
                      </span>
                    )}
                  </span>
                </div>
              )}
              {parsed.skipped > 0 && (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <X className="h-3.5 w-3.5 shrink-0" />
                  <span>{parsed.skipped} line{parsed.skipped !== 1 ? "s" : ""} beyond the 100-URL limit were ignored</span>
                </div>
              )}
            </div>
          )}

          {!hasText && (
            <p className="text-xs text-muted-foreground">
              Max {MAX_URLS} URLs per upload. Each URL must start with <code className="font-mono">http://</code> or <code className="font-mono">https://</code>.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button
            onClick={handleAdd}
            disabled={parsed.valid.length === 0}
          >
            Add {parsed.valid.length > 0 ? `${parsed.valid.length} ` : ""}URL{parsed.valid.length !== 1 ? "s" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
