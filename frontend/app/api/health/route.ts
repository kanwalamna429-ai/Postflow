// =============================================================================
// System Health Check — Phase 8
// GET /api/health — returns system status, env presence, and DB reachability.
// Never exposes secret values — only boolean presence checks.
// =============================================================================

import { NextResponse } from 'next/server'
import { getEnvStatus } from '@/lib/env'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export interface HealthResponse {
  status: 'ok' | 'degraded' | 'down'
  timestamp: string
  version: string
  uptime: number
  environment: 'development' | 'production' | 'test'
  checks: HealthCheck[]
}

interface HealthCheck {
  name: string
  status: 'ok' | 'warn' | 'fail'
  message: string
  latencyMs?: number
}

const START_TIME = Date.now()

export async function GET(): Promise<NextResponse<HealthResponse>> {
  const checks: HealthCheck[] = []
  const env = getEnvStatus()

  // ── 1. Environment variables ────────────────────────────────────────────
  const envCheck: HealthCheck = {
    name: 'environment',
    status: 'ok',
    message: 'All required env vars present',
  }
  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    envCheck.status  = 'fail'
    envCheck.message = 'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY'
  } else if (!env.encryptionKey || !env.processPostsSecret) {
    envCheck.status  = 'warn'
    envCheck.message = 'Optional env vars missing (encryption key or process-posts secret)'
  }
  checks.push(envCheck)

  // ── 2. Supabase connectivity ─────────────────────────────────────────────
  const dbCheck: HealthCheck = {
    name: 'database',
    status: 'ok',
    message: 'Supabase reachable',
  }

  if (env.supabaseUrl && env.supabaseAnonKey) {
    const t0 = Date.now()
    try {
      const cookieStore = await cookies()
      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            getAll: () => cookieStore.getAll(),
            setAll: () => {},
          },
        }
      )
      // Lightweight connectivity probe — just check the API is reachable
      const { error } = await supabase
        .from('campaigns')
        .select('id')
        .limit(1)
        .maybeSingle()

      dbCheck.latencyMs = Date.now() - t0

      if (error && error.code !== 'PGRST116') {
        // PGRST116 = row not found — that is fine
        if (error.code === '42P01') {
          // Table doesn't exist — migrations not run yet
          dbCheck.status  = 'warn'
          dbCheck.message = 'Database connected but migrations may not be applied'
        } else {
          dbCheck.status  = 'warn'
          dbCheck.message = `Database query warning: ${error.message}`
        }
      }
    } catch (err) {
      dbCheck.latencyMs = Date.now() - t0
      dbCheck.status    = 'fail'
      dbCheck.message   = err instanceof Error ? err.message : 'Database unreachable'
    }
  } else {
    dbCheck.status  = 'fail'
    dbCheck.message = 'Supabase not configured'
  }
  checks.push(dbCheck)

  // ── 3. AI / Gemini ───────────────────────────────────────────────────────
  checks.push({
    name:    'ai',
    status:  env.geminiApiKey ? 'ok' : 'warn',
    message: env.geminiApiKey
      ? 'Gemini API key present'
      : 'GEMINI_API_KEY not set — AI content generation disabled',
  })

  // ── 4. Encryption ────────────────────────────────────────────────────────
  checks.push({
    name:    'encryption',
    status:  env.encryptionKey ? 'ok' : 'warn',
    message: env.encryptionKey
      ? 'Encryption key present'
      : 'POSTFLOW_ENCRYPTION_KEY not set — credential storage disabled',
  })

  // ── 5. Publishing engine ─────────────────────────────────────────────────
  checks.push({
    name:    'publishing_engine',
    status:  env.processPostsSecret ? 'ok' : 'warn',
    message: env.processPostsSecret
      ? 'PROCESS_POSTS_SECRET configured'
      : 'PROCESS_POSTS_SECRET not set — edge function triggers will be rejected',
  })

  // ── Aggregate status ─────────────────────────────────────────────────────
  const hasFail  = checks.some((c) => c.status === 'fail')
  const hasWarn  = checks.some((c) => c.status === 'warn')
  const status   = hasFail ? 'down' : hasWarn ? 'degraded' : 'ok'

  const response: HealthResponse = {
    status,
    timestamp:   new Date().toISOString(),
    version:     process.env.npm_package_version ?? '1.0.0',
    uptime:      Math.round((Date.now() - START_TIME) / 1000),
    environment: (process.env.NODE_ENV ?? 'development') as HealthResponse['environment'],
    checks,
  }

  const httpStatus = hasFail ? 503 : 200

  return NextResponse.json(response, {
    status: httpStatus,
    headers: {
      'Cache-Control': 'no-store, no-cache',
      'X-Health-Status': status,
    },
  })
}
