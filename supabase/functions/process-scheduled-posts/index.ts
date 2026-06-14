// =============================================================================
// Supabase Edge Function: process-scheduled-posts
// Deno-compatible. Runs on a Supabase scheduled job (cron trigger).
//
// Responsibilities:
//   1. Query due scheduled_posts (status=pending, scheduled_at <= now)
//   2. POST the IDs to the Next.js /api/process-posts Route Handler
//   3. Log a summary to system_logs
//
// Architecture note:
//   All adapter/AI logic lives in the Next.js Route Handler (Node.js) because
//   the platform adapters and @google/generative-ai SDK are Node.js-only.
//   This Edge Function is a lightweight orchestrator / cron trigger.
//
// Required environment variables (set in Supabase Edge Function secrets):
//   SUPABASE_URL             — your Supabase project URL
//   SUPABASE_SERVICE_ROLE_KEY — service role key (bypasses RLS for cron work)
//   NEXTJS_SITE_URL          — your Vercel deployment URL (e.g. https://app.example.com)
//   PROCESS_POSTS_SECRET     — shared secret matching the Next.js env var
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ---------------------------------------------------------------------------
// Types (inlined — Deno cannot import from Node.js project)
// ---------------------------------------------------------------------------

interface ScheduledPostDue {
  id: string
  user_id: string
  platform: string
  scheduled_at: string
  retry_count: number
  next_retry_at: string | null
}

interface PublishBatchResult {
  invocationId: string
  processed: number
  succeeded: number
  failed: number
  retrying: number
  skipped: number
  results: Array<{
    scheduledPostId: string
    success: boolean
    error?: string
    skipped?: boolean
    retryScheduled?: boolean
  }>
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getRequiredEnv(key: string): string {
  const value = Deno.env.get(key)
  if (!value) throw new Error(`Missing required environment variable: ${key}`)
  return value
}

function generateInvocationId(): string {
  const timestamp = Date.now().toString(36)
  const random = crypto.randomUUID().split('-')[0]
  return `edge_${timestamp}_${random}`
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  const invocationId = generateInvocationId()
  const startedAt = new Date().toISOString()

  console.log(`[process-scheduled-posts] ${invocationId} started at ${startedAt}`)

  // -------------------------------------------------------------------------
  // Validate trigger (accept GET/POST from Supabase cron or HTTP trigger)
  // -------------------------------------------------------------------------
  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const supabaseUrl       = getRequiredEnv('SUPABASE_URL')
    const serviceRoleKey    = getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY')
    const nextjsSiteUrl     = getRequiredEnv('NEXTJS_SITE_URL')
    const processPostSecret = getRequiredEnv('PROCESS_POSTS_SECRET')

    // -----------------------------------------------------------------------
    // 1. Query due posts directly from Supabase (service role bypasses RLS)
    // -----------------------------------------------------------------------
    const supabase = createClient(supabaseUrl, serviceRoleKey)
    const now = new Date().toISOString()

    const { data: duePosts, error: queryError } = await supabase
      .from('scheduled_posts')
      .select('id, user_id, platform, scheduled_at, retry_count, next_retry_at')
      .eq('status', 'pending')
      .lte('scheduled_at', now)
      .is('deleted_at', null)
      .order('scheduled_at', { ascending: true })
      .limit(50)

    if (queryError) {
      console.error(`[process-scheduled-posts] Query error: ${queryError.message}`)
      return new Response(
        JSON.stringify({ error: queryError.message, invocationId }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Filter out posts whose next_retry_at is in the future
    const eligiblePosts = (duePosts as ScheduledPostDue[]).filter(
      (p) => p.next_retry_at == null || new Date(p.next_retry_at) <= new Date()
    )

    console.log(`[process-scheduled-posts] ${invocationId}: found ${eligiblePosts.length} due posts`)

    if (eligiblePosts.length === 0) {
      const result = {
        invocationId,
        processed: 0,
        succeeded: 0,
        failed: 0,
        retrying: 0,
        skipped: 0,
        results: [],
        message: 'No posts due for processing',
      }
      await writeSystemLog(supabase, invocationId, 'info', result)
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const postIds = eligiblePosts.map((p) => p.id)

    // -----------------------------------------------------------------------
    // 2. Call Next.js Route Handler to do the actual publishing
    //    (Node.js environment — all adapters and AI SDK live here)
    // -----------------------------------------------------------------------
    const processUrl = `${nextjsSiteUrl.replace(/\/$/, '')}/api/process-posts`

    console.log(`[process-scheduled-posts] ${invocationId}: calling ${processUrl} with ${postIds.length} IDs`)

    let batchResult: PublishBatchResult

    try {
      const response = await fetch(processUrl, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${processPostSecret}`,
        },
        body: JSON.stringify({ postIds }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Route handler returned ${response.status}: ${errorText}`)
      }

      batchResult = await response.json() as PublishBatchResult
    } catch (fetchErr) {
      const message = fetchErr instanceof Error ? fetchErr.message : String(fetchErr)
      console.error(`[process-scheduled-posts] ${invocationId}: fetch error: ${message}`)

      // Release any locks that may have been acquired before the crash
      // (they will be reclaimed by the stale lock mechanism on next run)

      await writeSystemLog(supabase, invocationId, 'error', {
        error: message,
        postIds,
      })

      return new Response(
        JSON.stringify({ error: message, invocationId }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // -----------------------------------------------------------------------
    // 3. Write summary log
    // -----------------------------------------------------------------------
    console.log(
      `[process-scheduled-posts] ${invocationId}: ` +
      `processed=${batchResult.processed} ` +
      `succeeded=${batchResult.succeeded} ` +
      `failed=${batchResult.failed} ` +
      `retrying=${batchResult.retrying} ` +
      `skipped=${batchResult.skipped}`
    )

    await writeSystemLog(supabase, invocationId, batchResult.failed > 0 ? 'warn' : 'info', batchResult)

    return new Response(JSON.stringify(batchResult), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[process-scheduled-posts] ${invocationId}: unhandled error: ${message}`)

    return new Response(
      JSON.stringify({ error: message, invocationId }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})

// ---------------------------------------------------------------------------
// Helper: write a summary event to system_logs
// ---------------------------------------------------------------------------

async function writeSystemLog(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  invocationId: string,
  level: 'info' | 'warn' | 'error',
  details: Record<string, unknown>
): Promise<void> {
  try {
    await supabase.from('system_logs').insert({
      user_id:    null,  // system-level event
      level,
      event_type: 'publishing_engine_run',
      message:    `Publishing engine run ${invocationId}: ${JSON.stringify(details).slice(0, 200)}`,
      details: {
        invocation_id: invocationId,
        ...details,
      },
    })
  } catch (err) {
    console.error('[process-scheduled-posts] Failed to write system log:', err)
  }
}
