-- =============================================================================
-- Migration 005: New Platform Support
-- Expands platform CHECK constraints across all tables to include 12 new platforms.
-- Adds instance_url and platform_user_id columns to platform_connections.
-- Idempotent: uses DO $$ ... $$ and IF NOT EXISTS patterns.
-- =============================================================================

-- New platform values being added:
-- Social: bluesky, mastodon, misskey, pixelfed, tumblr
-- Publishing: devto, hashnode, reddit
-- Bookmarking: diigo, raindrop, pocket, instapaper

-- Full allowed set (existing 5 + new 12 = 17):
-- 'twitter','linkedin','instagram','facebook','tiktok',
-- 'bluesky','mastodon','misskey','pixelfed','tumblr',
-- 'devto','hashnode','reddit',
-- 'diigo','raindrop','pocket','instapaper'


-- ===========================================================================
-- TABLE: platform_connections
-- ===========================================================================

-- 1. Add instance_url column (nullable — only required for federated platforms)
ALTER TABLE public.platform_connections
  ADD COLUMN IF NOT EXISTS instance_url TEXT;

COMMENT ON COLUMN public.platform_connections.instance_url IS
  'Server/instance URL for federated platforms (Mastodon, Misskey, Pixelfed).';

-- 2. Add platform_user_id column (nullable — platform-assigned ID for reference)
ALTER TABLE public.platform_connections
  ADD COLUMN IF NOT EXISTS platform_user_id TEXT;

COMMENT ON COLUMN public.platform_connections.platform_user_id IS
  'Platform-assigned user/account ID (DID for Bluesky, numeric ID for Reddit, etc.).';

-- 3. Add publication_host column (for Hashnode)
ALTER TABLE public.platform_connections
  ADD COLUMN IF NOT EXISTS publication_host TEXT;

COMMENT ON COLUMN public.platform_connections.publication_host IS
  'Publication domain for Hashnode (e.g. yourblog.hashnode.dev).';

-- 4. Drop existing auto-named platform CHECK constraint and recreate with expanded list
-- NOTE: Postgres stores CHECK (platform IN (...)) as CHECK ((platform = ANY (ARRAY[...])))
--       internally, so we must match the normalised form.
DO $$
DECLARE
  v_name TEXT;
BEGIN
  FOR v_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.platform_connections'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%platform = ANY (ARRAY[%'
  LOOP
    EXECUTE format('ALTER TABLE public.platform_connections DROP CONSTRAINT %I', v_name);
  END LOOP;
END;
$$;

ALTER TABLE public.platform_connections
  DROP CONSTRAINT IF EXISTS ck_platform_connections_platform;

ALTER TABLE public.platform_connections
  ADD CONSTRAINT ck_platform_connections_platform
  CHECK (platform IN (
    'twitter','linkedin','instagram','facebook','tiktok',
    'bluesky','mastodon','misskey','pixelfed','tumblr',
    'devto','hashnode','reddit',
    'diigo','raindrop','pocket','instapaper'
  ));


-- ===========================================================================
-- TABLE: generated_content
-- ===========================================================================

DO $$
DECLARE v_name TEXT;
BEGIN
  FOR v_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.generated_content'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%platform = ANY (ARRAY[%'
  LOOP
    EXECUTE format('ALTER TABLE public.generated_content DROP CONSTRAINT %I', v_name);
  END LOOP;
END;
$$;

ALTER TABLE public.generated_content
  DROP CONSTRAINT IF EXISTS ck_generated_content_platform;

ALTER TABLE public.generated_content
  ADD CONSTRAINT ck_generated_content_platform
  CHECK (platform IN (
    'twitter','linkedin','instagram','facebook','tiktok',
    'bluesky','mastodon','misskey','pixelfed','tumblr',
    'devto','hashnode','reddit',
    'diigo','raindrop','pocket','instapaper'
  ));


-- ===========================================================================
-- TABLE: scheduled_posts
-- ===========================================================================

DO $$
DECLARE v_name TEXT;
BEGIN
  FOR v_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.scheduled_posts'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%platform = ANY (ARRAY[%'
  LOOP
    EXECUTE format('ALTER TABLE public.scheduled_posts DROP CONSTRAINT %I', v_name);
  END LOOP;
END;
$$;

ALTER TABLE public.scheduled_posts
  DROP CONSTRAINT IF EXISTS ck_scheduled_posts_platform;

ALTER TABLE public.scheduled_posts
  ADD CONSTRAINT ck_scheduled_posts_platform
  CHECK (platform IN (
    'twitter','linkedin','instagram','facebook','tiktok',
    'bluesky','mastodon','misskey','pixelfed','tumblr',
    'devto','hashnode','reddit',
    'diigo','raindrop','pocket','instapaper'
  ));


-- ===========================================================================
-- TABLE: published_posts
-- ===========================================================================

DO $$
DECLARE v_name TEXT;
BEGIN
  FOR v_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.published_posts'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%platform = ANY (ARRAY[%'
  LOOP
    EXECUTE format('ALTER TABLE public.published_posts DROP CONSTRAINT %I', v_name);
  END LOOP;
END;
$$;

ALTER TABLE public.published_posts
  DROP CONSTRAINT IF EXISTS ck_published_posts_platform;

ALTER TABLE public.published_posts
  ADD CONSTRAINT ck_published_posts_platform
  CHECK (platform IN (
    'twitter','linkedin','instagram','facebook','tiktok',
    'bluesky','mastodon','misskey','pixelfed','tumblr',
    'devto','hashnode','reddit',
    'diigo','raindrop','pocket','instapaper'
  ));


-- ===========================================================================
-- TABLE: system_logs
-- ===========================================================================

DO $$
DECLARE v_name TEXT;
BEGIN
  FOR v_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.system_logs'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%platform = ANY (ARRAY[%'
  LOOP
    EXECUTE format('ALTER TABLE public.system_logs DROP CONSTRAINT %I', v_name);
  END LOOP;
END;
$$;

ALTER TABLE public.system_logs
  DROP CONSTRAINT IF EXISTS ck_system_logs_platform;

ALTER TABLE public.system_logs
  ADD CONSTRAINT ck_system_logs_platform
  CHECK (platform IN (
    'twitter','linkedin','instagram','facebook','tiktok',
    'bluesky','mastodon','misskey','pixelfed','tumblr',
    'devto','hashnode','reddit',
    'diigo','raindrop','pocket','instapaper'
  ));


-- ===========================================================================
-- INDEXES for new columns
-- ===========================================================================

CREATE INDEX IF NOT EXISTS idx_platform_connections_instance_url
  ON public.platform_connections (instance_url)
  WHERE instance_url IS NOT NULL;
