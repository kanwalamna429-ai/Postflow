import { NextResponse, type NextRequest } from "next/server"
import crypto from "node:crypto"
import { createClient } from "@/lib/supabase/server"

function errMsg(err: unknown): string {
  if (!err) return "Unknown error"
  if (typeof err === "string") return err
  if (typeof err === "object") {
    const e = err as Record<string, unknown>
    if (typeof e.message === "string") return e.message
    if (typeof e.msg === "string") return e.msg
    if (typeof e.details === "string") return e.details
    if (typeof e.hint === "string") return e.hint
    try { return JSON.stringify(err) } catch { return "Unknown error" }
  }
  return String(err)
}

function initEncryptionKey(): Buffer | null {
  const raw = process.env.POSTFLOW_ENCRYPTION_KEY
  if (!raw) return null
  const buf = Buffer.from(raw, "hex")
  if (buf.length !== 32) {
    console.error(
      `[connections] POSTFLOW_ENCRYPTION_KEY decoded to ${buf.length} bytes — ` +
      "must be exactly 64 hex chars (32 bytes). Falling back to base64 storage."
    )
    return null
  }
  return buf
}

const ENCRYPTION_KEY = initEncryptionKey()

function encrypt(plain: string): string {
  if (!ENCRYPTION_KEY) return Buffer.from(plain).toString("base64")
  try {
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv("aes-256-gcm", ENCRYPTION_KEY, iv)
    const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
    const tag = cipher.getAuthTag()
    return Buffer.concat([iv, tag, encrypted]).toString("base64")
  } catch (err) {
    console.error("[connections] encrypt error, falling back to base64:", err)
    return Buffer.from(plain).toString("base64")
  }
}

function decrypt(data: string): string {
  if (!ENCRYPTION_KEY) return Buffer.from(data, "base64").toString("utf8")
  try {
    const buf = Buffer.from(data, "base64")
    const iv = buf.subarray(0, 12)
    const tag = buf.subarray(12, 28)
    const encrypted = buf.subarray(28)
    const decipher = crypto.createDecipheriv("aes-256-gcm", ENCRYPTION_KEY, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8")
  } catch {
    return ""
  }
}

// GET /api/connections — list all connections for the current user
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data, error } = await supabase
      .from("platform_connections")
      .select("id, platform, account_name, account_handle, instance_url, status, connected_at, posts_published")
      .eq("user_id", user.id)
      .order("connected_at", { ascending: false })

    if (error) throw error

    return NextResponse.json({ connections: data ?? [] })
  } catch (err) {
    console.error("[api/connections] GET failed:", err)
    return NextResponse.json({ error: "Internal server error", detail: errMsg(err) }, { status: 500 })
  }
}

// POST /api/connections — create or update a connection
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const {
      id,
      platform,
      accountName,
      accountHandle,
      instanceUrl,
      credentials,
    } = body as {
      id?: string
      platform: string
      accountName: string
      accountHandle: string
      instanceUrl?: string
      credentials?: Record<string, string>
    }

    if (!platform || !accountHandle) {
      return NextResponse.json({ error: "platform and accountHandle are required" }, { status: 400 })
    }

    const credentialsEncrypted = credentials && Object.keys(credentials).length > 0
      ? encrypt(JSON.stringify(credentials))
      : null

    const record = {
      user_id:               user.id,
      platform,
      account_name:          accountName || accountHandle,
      account_handle:        accountHandle,
      instance_url:          instanceUrl || null,
      status:                "connected",
      connected_at:          new Date().toISOString(),
      credentials_encrypted: credentialsEncrypted,
      updated_at:            new Date().toISOString(),
    }

    let saved
    if (id) {
      const { data, error } = await supabase
        .from("platform_connections")
        .update(record)
        .eq("id", id)
        .eq("user_id", user.id)
        .select("id, platform, account_name, account_handle, instance_url, status, connected_at, posts_published")
        .single()
      if (error) throw error
      saved = data
    } else {
      const { data, error } = await supabase
        .from("platform_connections")
        .insert({ ...record, posts_published: 0 })
        .select("id, platform, account_name, account_handle, instance_url, status, connected_at, posts_published")
        .single()
      if (error) throw error
      saved = data
    }

    return NextResponse.json({ connection: saved })
  } catch (err) {
    console.error("[api/connections] POST failed:", err)
    return NextResponse.json({ error: "Internal server error", detail: errMsg(err) }, { status: 500 })
  }
}
