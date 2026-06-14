// =============================================================================
// POST /api/publish-now — Immediate Publishing
//
// Publishes one or more already-created scheduled_posts immediately
// by calling the publishing engine directly.
//
// Body: { scheduledPostIds: string[] }
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { publishOne } from '@/lib/services/publishing/publisher'
import type { PublishJobResult } from '@/lib/services/publishing/types'

function generateInvocationId(): string {
  return `inv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { scheduledPostIds?: string[] } = {}
  try { body = await request.json() } catch { /* empty body */ }

  const { scheduledPostIds = [] } = body
  if (scheduledPostIds.length === 0) {
    return NextResponse.json({ error: 'scheduledPostIds is required' }, { status: 400 })
  }

  const invocationId = generateInvocationId()
  const results: PublishJobResult[] = []

  for (const postId of scheduledPostIds) {
    try {
      const result = await publishOne(supabase, {
        scheduledPostId: postId,
        userId:          user.id,
        invocationId,
      })
      results.push(result)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[publish-now] Error publishing ${postId}:`, message)
      results.push({
        scheduledPostId: postId,
        success:         false,
        error:           message,
        errorCode:       'INTERNAL',
      })
    }
  }

  const succeeded = results.filter((r) => r.success).length
  const failed    = results.filter((r) => !r.success).length

  return NextResponse.json({
    success:     failed === 0,
    processed:   results.length,
    succeeded,
    failed,
    results,
  })
}
