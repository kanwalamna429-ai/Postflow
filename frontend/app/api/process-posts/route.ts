// =============================================================================
// POST /api/process-posts — Publishing Engine Route Handler
//
// Called by the Supabase Edge Function (process-scheduled-posts) to process
// a batch of due scheduled posts. All adapter/AI code runs here (Node.js),
// so there are no Deno compatibility issues.
//
// Security: requires Authorization: Bearer <PROCESS_POSTS_SECRET> header.
// Set PROCESS_POSTS_SECRET in both Vercel and Supabase Edge Function env vars.
//
// Request body:
//   { postIds?: string[] }          — process specific IDs
//   {}                              — process all currently due posts (max 50)
//
// Response body:
//   PublishBatchResult
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchDueScheduledPosts } from '@/lib/services/campaigns/schedule-service'
import { publishOne } from '@/lib/services/publishing/publisher'
import type { PublishBatchResult, PublishJobResult } from '@/lib/services/publishing/types'

// ---------------------------------------------------------------------------
// Auth guard
// ---------------------------------------------------------------------------

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.PROCESS_POSTS_SECRET
  if (!secret) {
    // In development without a secret set, allow calls from localhost only
    const host = request.headers.get('host') ?? ''
    if (process.env.NODE_ENV !== 'production' && (host.includes('localhost') || host.includes('127.0.0.1'))) {
      return true
    }
    console.warn('[process-posts] PROCESS_POSTS_SECRET is not set — rejecting request')
    return false
  }

  const authHeader = request.headers.get('authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  return token === secret
}

// ---------------------------------------------------------------------------
// Generate a short invocation ID for lock ownership
// ---------------------------------------------------------------------------

function generateInvocationId(): string {
  const timestamp = Date.now().toString(36)
  const random    = Math.random().toString(36).slice(2, 8)
  return `inv_${timestamp}_${random}`
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Auth
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const invocationId = generateInvocationId()

  let body: { postIds?: string[] } = {}
  try {
    body = await request.json()
  } catch {
    // Empty body is valid — means "process all due posts"
  }

  const supabase = await createClient()

  // Verify the caller is authenticated as a service-role or the current user
  const { data: { user } } = await supabase.auth.getUser()

  let postIds: string[] = body.postIds ?? []

  // If no specific IDs provided, fetch all currently due posts
  if (postIds.length === 0) {
    try {
      const duePosts = await fetchDueScheduledPosts(supabase, { limit: 50 })
      postIds = duePosts.map((p) => p.id)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[process-posts] Failed to fetch due posts:', message)
      return NextResponse.json({ error: `Failed to fetch due posts: ${message}` }, { status: 500 })
    }
  }

  if (postIds.length === 0) {
    const result: PublishBatchResult = {
      invocationId,
      processed: 0,
      succeeded: 0,
      failed: 0,
      retrying: 0,
      skipped: 0,
      results: [],
    }
    return NextResponse.json(result)
  }

  // Process each post — we need the userId from the post itself
  // Load minimal post data to get userIds
  const { data: postRows } = await supabase
    .from('scheduled_posts')
    .select('id, user_id')
    .in('id', postIds)
    .is('deleted_at', null)

  const userIdMap = new Map<string, string>(
    (postRows ?? []).map((r) => [r.id, r.user_id])
  )

  // Process posts sequentially to avoid overwhelming platform APIs
  // For high-volume production, this can be parallelised with concurrency limiting
  const results: PublishJobResult[] = []

  for (const postId of postIds) {
    const userId = userIdMap.get(postId) ?? (user?.id ?? '')

    if (!userId) {
      results.push({
        scheduledPostId: postId,
        success: false,
        error: 'Could not determine user ID for post',
        errorCode: 'INTERNAL',
      })
      continue
    }

    try {
      const result = await publishOne(supabase, {
        scheduledPostId: postId,
        userId,
        invocationId,
      })
      results.push(result)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[process-posts] Unexpected error for post ${postId}:`, message)
      results.push({
        scheduledPostId: postId,
        success: false,
        error: message,
        errorCode: 'INTERNAL',
      })
    }
  }

  // Build summary
  const succeeded = results.filter((r) => r.success).length
  const skipped   = results.filter((r) => r.skipped).length
  const retrying  = results.filter((r) => r.retryScheduled).length
  const failed    = results.filter((r) => !r.success && !r.skipped && !r.retryScheduled).length

  const batchResult: PublishBatchResult = {
    invocationId,
    processed: results.length,
    succeeded,
    failed,
    retrying,
    skipped,
    results,
  }

  console.log(
    `[process-posts] ${invocationId}: processed=${results.length} succeeded=${succeeded} failed=${failed} retrying=${retrying} skipped=${skipped}`
  )

  return NextResponse.json(batchResult)
}

// GET — health check / due post count (for monitoring)
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = await createClient()
    const duePosts = await fetchDueScheduledPosts(supabase, { limit: 100 })

    return NextResponse.json({
      status: 'ok',
      duePostCount: duePosts.length,
      duePosts: duePosts.map((p) => ({
        id:          p.id,
        platform:    p.platform,
        scheduledAt: p.scheduledAt,
        retryCount:  p.retryCount,
      })),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ status: 'error', error: message }, { status: 500 })
  }
}
