-- =============================================================================
-- Migration 010: Ensure scheduled_posts Table & Auto-Generation Columns
--
-- Deployments that ran only 001_initial.sql (which creates campaign_urls,
-- campaigns, platform_connections, and system_logs only) are missing the
-- scheduled_posts table and several columns needed by the generate route.
--
-- This migration:
--   1. Creates scheduled_posts if it does not exist
--   2. Adds url_id if missing (from 006_campaign_engine)
--   3. Adds locking / publish columns if missing (from 007_phase7_publishing)
--   4. Ensures RLS is enabled and the correct policies exist
--   5. Ensures generated_content table exists (also absent from 001_initial.sql)
--   6. Ensures extracted_content table exists with all required columns
--   7. Adds campaign_urls.metadata / updated_at if missing
--   8. Adds frequency_type / frequency_value to campaigns if missing
--
-- Idempotent: every statement uses CREATE/ALTER … IF NOT EXISTS.
-- =============================================================================


-- ===========================================================================
-- TABLE: extracted_content
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.extracted_content (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  url_id          UUID        REFERENCES public.campaign_urls(id) ON DELETE SET NULL,
  source_url      TEXT        NOT NULL,
  title           TEXT,
  description     TEXT,
  body            TEXT,
  author          TEXT,
  published_at    TIMESTAMPTZ,
  og_image_url    TEXT,
  keywords        TEXT[]      NOT NULL DEFAULT '{}',
  raw_html        TEXT,
  metadata        JSONB       NOT NULL DEFAULT '{}',
  extracted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.extracted_content ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "extracted_content_all_own"  ON public.extracted_content;
DROP POLICY IF EXISTS "extracted_content_select_own" ON public.extracted_content;
DROP POLICY IF EXISTS "extracted_content_insert_own" ON public.extracted_content;
DROP POLICY IF EXISTS "extracted_content_update_own" ON public.extracted_content;

CREATE POLICY "extracted_content_select_own"
  ON public.extracted_content FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "extracted_content_insert_own"
  ON public.extracted_content FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "extracted_content_update_own"
  ON public.extracted_content FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- ===========================================================================
-- TABLE: generated_content
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.generated_content (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id           UUID        REFERENCES public.campaigns(id) ON DELETE SET NULL,
  extracted_content_id  UUID        REFERENCES public.extracted_content(id) ON DELETE SET NULL,
  platform              TEXT        NOT NULL,
  content               TEXT        NOT NULL CHECK (char_length(content) >= 1),
  content_type          TEXT        NOT NULL DEFAULT 'post',
  tone                  TEXT,
  hashtags              TEXT[]      NOT NULL DEFAULT '{}',
  is_approved           BOOLEAN     NOT NULL DEFAULT FALSE,
  approved_at           TIMESTAMPTZ,
  metadata              JSONB       NOT NULL DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at            TIMESTAMPTZ
);

ALTER TABLE public.generated_content ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "generated_content_all_own"    ON public.generated_content;
DROP POLICY IF EXISTS "generated_content_select_own" ON public.generated_content;
DROP POLICY IF EXISTS "generated_content_insert_own" ON public.generated_content;
DROP POLICY IF EXISTS "generated_content_update_own" ON public.generated_content;
DROP POLICY IF EXISTS "generated_content_delete_own" ON public.generated_content;

CREATE POLICY "generated_content_select_own"
  ON public.generated_content FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "generated_content_insert_own"
  ON public.generated_content FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "generated_content_update_own"
  ON public.generated_content FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "generated_content_delete_own"
  ON public.generated_content FOR DELETE
  USING (user_id = auth.uid());


-- ===========================================================================
-- TABLE: scheduled_posts (create if absent — 001_initial.sql omits it)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.scheduled_posts (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id           UUID        REFERENCES public.campaigns(id) ON DELETE SET NULL,
  connection_id         UUID,
  generated_content_id  UUID        REFERENCES public.generated_content(id) ON DELETE SET NULL,
  platform              TEXT        NOT NULL,
  content               TEXT        NOT NULL CHECK (char_length(content) >= 1),
  media_asset_ids       UUID[]      NOT NULL DEFAULT '{}',
  scheduled_at          TIMESTAMPTZ NOT NULL,
  status                TEXT        NOT NULL DEFAULT 'pending'
                                    CHECK (status IN ('pending','processing','published','failed','cancelled')),
  retry_count           INT         NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  max_retries           INT         NOT NULL DEFAULT 3  CHECK (max_retries >= 0),
  error_message         TEXT,
  metadata              JSONB       NOT NULL DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at            TIMESTAMPTZ
);

-- Add url_id (from migration 006)
ALTER TABLE public.scheduled_posts
  ADD COLUMN IF NOT EXISTS url_id UUID;

-- Add locking/publishing columns (from migration 007)
ALTER TABLE public.scheduled_posts
  ADD COLUMN IF NOT EXISTS locked_at   TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.scheduled_posts
  ADD COLUMN IF NOT EXISTS locked_by   TEXT        DEFAULT NULL;
ALTER TABLE public.scheduled_posts
  ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.scheduled_posts
  ADD COLUMN IF NOT EXISTS published_at  TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.scheduled_posts
  ADD COLUMN IF NOT EXISTS error_code    TEXT        DEFAULT NULL;

-- RLS
ALTER TABLE public.scheduled_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "scheduled_posts_all_own"    ON public.scheduled_posts;
DROP POLICY IF EXISTS "scheduled_posts_select_own" ON public.scheduled_posts;
DROP POLICY IF EXISTS "scheduled_posts_insert_own" ON public.scheduled_posts;
DROP POLICY IF EXISTS "scheduled_posts_update_own" ON public.scheduled_posts;
DROP POLICY IF EXISTS "scheduled_posts_delete_own" ON public.scheduled_posts;

CREATE POLICY "scheduled_posts_select_own"
  ON public.scheduled_posts FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "scheduled_posts_insert_own"
  ON public.scheduled_posts FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "scheduled_posts_update_own"
  ON public.scheduled_posts FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "scheduled_posts_delete_own"
  ON public.scheduled_posts FOR DELETE
  USING (user_id = auth.uid());


-- Indexes for the UPSERT lookups in generate/route.ts
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_campaign_url_platform
  ON public.scheduled_posts (campaign_id, url_id, platform)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_scheduled_posts_due
  ON public.scheduled_posts (status, scheduled_at)
  WHERE status = 'pending' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_scheduled_posts_url_id
  ON public.scheduled_posts (url_id)
  WHERE url_id IS NOT NULL;


-- ===========================================================================
-- TABLE: campaign_urls — add missing columns for 001_initial.sql deployments
-- ===========================================================================
ALTER TABLE public.campaign_urls
  ADD COLUMN IF NOT EXISTS metadata   JSONB       NOT NULL DEFAULT '{}';

ALTER TABLE public.campaign_urls
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.campaign_urls
  ADD COLUMN IF NOT EXISTS is_active  BOOLEAN     NOT NULL DEFAULT TRUE;


-- ===========================================================================
-- TABLE: campaigns — frequency columns (from migration 006)
-- ===========================================================================
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS frequency_type  TEXT DEFAULT 'daily';

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS frequency_value INT  NOT NULL DEFAULT 1;

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS url_ids text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS frequency text;

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS url_count       integer NOT NULL DEFAULT 0;

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS scheduled_posts integer NOT NULL DEFAULT 0;

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS published_posts integer NOT NULL DEFAULT 0;

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS failed_posts    integer NOT NULL DEFAULT 0;

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS success_rate    numeric NOT NULL DEFAULT 0;

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
