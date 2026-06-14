-- =============================================================================
-- Migration 008: Fix Platform CHECK Constraints
--
-- ROOT CAUSE:
--   Migrations 001_schema.sql and 005_new_platforms.sql both used
--   ILIKE '%platform IN%' to detect and drop the existing platform
--   CHECK constraints before expanding the allowed list. However,
--   PostgreSQL normalises  CHECK (platform IN ('a','b'))  into
--   CHECK ((platform = ANY (ARRAY['a'::text, 'b'::text])))  when
--   storing the constraint definition, so the ILIKE pattern never
--   matched. The old auto-named constraint (e.g.
--   platform_connections_platform_check) was therefore never dropped,
--   and the new named constraint (ck_platform_connections_platform)
--   was added on top. With both active, every INSERT must satisfy
--   BOTH constraints — meaning only the original five platforms
--   (twitter, linkedin, instagram, facebook, tiktok) are accepted.
--
-- FIX:
--   Drop all platform CHECK constraints by their actual names — both
--   the Postgres auto-generated names and the explicitly named ones —
--   then re-add a single, clean constraint per table covering all 17
--   supported platforms.
--
-- Idempotent: every DROP uses IF EXISTS; ADD uses a named constraint
--             that can be dropped/re-added safely on re-run.
-- =============================================================================

-- Full allowed platform list (5 original + 12 added in migration 005):
-- twitter, linkedin, instagram, facebook, tiktok,
-- bluesky, mastodon, misskey, pixelfed, tumblr,
-- devto, hashnode, reddit,
-- diigo, raindrop, pocket, instapaper


-- ===========================================================================
-- TABLE: platform_connections
-- ===========================================================================

-- Drop auto-named constraint from 001_schema.sql inline CHECK
ALTER TABLE public.platform_connections
  DROP CONSTRAINT IF EXISTS platform_connections_platform_check;

-- Drop explicitly named constraint from 005_new_platforms.sql (may or may not exist)
ALTER TABLE public.platform_connections
  DROP CONSTRAINT IF EXISTS ck_platform_connections_platform;

-- Re-add a single clean constraint
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

ALTER TABLE public.generated_content
  DROP CONSTRAINT IF EXISTS generated_content_platform_check;

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

ALTER TABLE public.scheduled_posts
  DROP CONSTRAINT IF EXISTS scheduled_posts_platform_check;

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

ALTER TABLE public.published_posts
  DROP CONSTRAINT IF EXISTS published_posts_platform_check;

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

ALTER TABLE public.system_logs
  DROP CONSTRAINT IF EXISTS system_logs_platform_check;

ALTER TABLE public.system_logs
  DROP CONSTRAINT IF EXISTS ck_system_logs_platform;

-- system_logs.platform is nullable (no NOT NULL on that column),
-- so the constraint must allow NULL values to pass through.
ALTER TABLE public.system_logs
  ADD CONSTRAINT ck_system_logs_platform
  CHECK (platform IS NULL OR platform IN (
    'twitter','linkedin','instagram','facebook','tiktok',
    'bluesky','mastodon','misskey','pixelfed','tumblr',
    'devto','hashnode','reddit',
    'diigo','raindrop','pocket','instapaper'
  ));


-- ===========================================================================
-- Also fix 005_new_platforms.sql's buggy DO blocks retroactively
-- by ensuring no lingering auto-named constraints remain.
-- The pattern below catches any constraint whose definition contains
-- the actual Postgres-normalised form "= ANY (ARRAY[" on these tables.
-- ===========================================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname, c.conrelid::regclass AS tbl
    FROM pg_constraint c
    WHERE c.contype = 'c'
      AND c.conrelid IN (
        'public.platform_connections'::regclass,
        'public.generated_content'::regclass,
        'public.scheduled_posts'::regclass,
        'public.published_posts'::regclass,
        'public.system_logs'::regclass
      )
      AND pg_get_constraintdef(c.oid) ILIKE '%= ANY (ARRAY[%platform%'
      AND c.conname NOT IN (
        'ck_platform_connections_platform',
        'ck_generated_content_platform',
        'ck_scheduled_posts_platform',
        'ck_published_posts_platform',
        'ck_system_logs_platform'
      )
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
    RAISE NOTICE 'Dropped stale platform constraint % on %', r.conname, r.tbl;
  END LOOP;
END;
$$;


-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
