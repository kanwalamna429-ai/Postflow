-- =============================================================================
-- Migration 007: Phase 7 — Publishing Engine
-- Adds locking, retry, and publishing fields to scheduled_posts.
-- Ensures published_posts has all columns needed by the publishing engine.
-- Idempotent: uses ADD COLUMN IF NOT EXISTS.
-- =============================================================================


-- ===========================================================================
-- TABLE: scheduled_posts — add publishing engine fields
-- ===========================================================================

-- Lock timestamp: when this record was claimed for processing
ALTER TABLE public.scheduled_posts
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN public.scheduled_posts.locked_at IS
  'Timestamp when this post was locked for processing. NULL = not locked.';

-- Lock owner: identifies which Edge Function invocation holds the lock
ALTER TABLE public.scheduled_posts
  ADD COLUMN IF NOT EXISTS locked_by TEXT DEFAULT NULL;

COMMENT ON COLUMN public.scheduled_posts.locked_by IS
  'Identifier (e.g. invocation ID) of the process holding the lock.';

-- Next retry: when to retry after a transient failure
ALTER TABLE public.scheduled_posts
  ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN public.scheduled_posts.next_retry_at IS
  'Earliest time to attempt re-processing after a retryable failure.';

-- Published at: when the post was successfully published
ALTER TABLE public.scheduled_posts
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN public.scheduled_posts.published_at IS
  'Timestamp when the post was successfully published to the platform.';

-- Error code: structured error code from the adapter
ALTER TABLE public.scheduled_posts
  ADD COLUMN IF NOT EXISTS error_code TEXT DEFAULT NULL;

COMMENT ON COLUMN public.scheduled_posts.error_code IS
  'Structured AdapterErrorCode (e.g. AUTH_EXPIRED, RATE_LIMITED) from last failure.';


-- ===========================================================================
-- TABLE: scheduled_posts — stale lock cleanup
-- Locks older than 10 minutes are considered stale and can be reclaimed.
-- (Handled in application logic, but column comment documents the contract.)
-- ===========================================================================

COMMENT ON COLUMN public.scheduled_posts.locked_at IS
  'Lock timestamp. Locks older than 10 minutes are considered stale.';


-- ===========================================================================
-- TABLE: published_posts — ensure all required columns exist
-- This table was created in Phase 2. We add any missing columns here.
-- ===========================================================================

ALTER TABLE public.published_posts
  ADD COLUMN IF NOT EXISTS scheduled_post_id UUID
  REFERENCES public.scheduled_posts(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.published_posts.scheduled_post_id IS
  'Back-reference to the scheduled_posts row that produced this published post.';

ALTER TABLE public.published_posts
  ADD COLUMN IF NOT EXISTS platform_post_id TEXT DEFAULT NULL;

COMMENT ON COLUMN public.published_posts.platform_post_id IS
  'ID returned by the platform API (used to delete the post later).';

ALTER TABLE public.published_posts
  ADD COLUMN IF NOT EXISTS platform_post_url TEXT DEFAULT NULL;

COMMENT ON COLUMN public.published_posts.platform_post_url IS
  'Public permalink to the published post / bookmark on the platform.';

ALTER TABLE public.published_posts
  ADD COLUMN IF NOT EXISTS response_data JSONB DEFAULT '{}';

COMMENT ON COLUMN public.published_posts.response_data IS
  'Raw adapter response stored for audit / debugging.';

ALTER TABLE public.published_posts
  ADD COLUMN IF NOT EXISTS content TEXT DEFAULT NULL;

COMMENT ON COLUMN public.published_posts.content IS
  'The exact content body that was published.';

ALTER TABLE public.published_posts
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ NOT NULL DEFAULT now();

COMMENT ON COLUMN public.published_posts.published_at IS
  'When the content was published to the platform.';


-- ===========================================================================
-- INDEXES — optimise the publishing engine queries
-- ===========================================================================

-- Primary query: find due pending posts
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_due
  ON public.scheduled_posts (status, scheduled_at)
  WHERE status = 'pending' AND deleted_at IS NULL;

-- Retry query: find posts ready for retry
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_retry
  ON public.scheduled_posts (status, next_retry_at)
  WHERE status = 'pending' AND next_retry_at IS NOT NULL AND deleted_at IS NULL;

-- Stale lock cleanup query
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_locked
  ON public.scheduled_posts (locked_at)
  WHERE status = 'processing' AND deleted_at IS NULL;

-- Lookup by campaign for the publisher
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_campaign
  ON public.scheduled_posts (campaign_id, status)
  WHERE deleted_at IS NULL;

-- published_posts lookup by scheduled_post
CREATE INDEX IF NOT EXISTS idx_published_posts_scheduled
  ON public.published_posts (scheduled_post_id);

-- published_posts lookup by user
CREATE INDEX IF NOT EXISTS idx_published_posts_user
  ON public.published_posts (user_id, published_at DESC);


-- ===========================================================================
-- RLS — published_posts (ensure policy exists)
-- ===========================================================================

ALTER TABLE public.published_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own published posts" ON public.published_posts;
CREATE POLICY "Users can read own published posts"
  ON public.published_posts FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own published posts" ON public.published_posts;
CREATE POLICY "Users can insert own published posts"
  ON public.published_posts FOR INSERT
  WITH CHECK (auth.uid() = user_id);
