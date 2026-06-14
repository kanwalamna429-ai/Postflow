-- =============================================================================
-- Migration 001: Core Schema
-- Tables, constraints, and indexes
-- Idempotent: safe to run multiple times
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";   -- for full-text LIKE indexes


-- ===========================================================================
-- TABLE: users
-- Public profile that mirrors auth.users (created via trigger)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.users (
  id                UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email             TEXT        NOT NULL,
  full_name         TEXT,
  avatar_url        TEXT,
  timezone          TEXT        NOT NULL DEFAULT 'UTC',
  plan              TEXT        NOT NULL DEFAULT 'free'
                                CHECK (plan IN ('free', 'pro', 'business')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ
);

COMMENT ON TABLE  public.users IS 'Extended user profiles, synced from auth.users.';
COMMENT ON COLUMN public.users.plan IS 'Billing plan: free | pro | business.';
COMMENT ON COLUMN public.users.deleted_at IS 'Soft-delete timestamp; NULL means active.';


-- ===========================================================================
-- TABLE: platform_connections
-- OAuth tokens & metadata for connected social accounts
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.platform_connections (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  platform            TEXT        NOT NULL
                                  CHECK (platform IN ('twitter','linkedin','instagram','facebook','tiktok')),
  account_name        TEXT        NOT NULL,
  account_handle      TEXT        NOT NULL,
  -- Tokens should be encrypted at the application layer before storage
  access_token_enc    TEXT,
  refresh_token_enc   TEXT,
  token_expires_at    TIMESTAMPTZ,
  status              TEXT        NOT NULL DEFAULT 'connected'
                                  CHECK (status IN ('connected','error','disconnected')),
  posts_published     INT         NOT NULL DEFAULT 0 CHECK (posts_published >= 0),
  last_sync_at        TIMESTAMPTZ,
  metadata            JSONB       NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ,
  CONSTRAINT uq_platform_connections_user_platform_handle
    UNIQUE (user_id, platform, account_handle)
);

COMMENT ON TABLE  public.platform_connections IS 'Social platform OAuth connections per user.';
COMMENT ON COLUMN public.platform_connections.access_token_enc  IS 'AES-256 encrypted access token.';
COMMENT ON COLUMN public.platform_connections.refresh_token_enc IS 'AES-256 encrypted refresh token.';


-- ===========================================================================
-- TABLE: campaigns
-- Top-level campaign definition
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.campaigns (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name          TEXT        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 255),
  description   TEXT,
  status        TEXT        NOT NULL DEFAULT 'draft'
                            CHECK (status IN ('draft','active','scheduled','paused','completed','archived')),
  platforms     TEXT[]      NOT NULL DEFAULT '{}',
  start_date    DATE,
  end_date      DATE,
  metadata      JSONB       NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ,
  CONSTRAINT ck_campaigns_date_order
    CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date)
);

COMMENT ON TABLE public.campaigns IS 'Social media campaigns; soft-deleted via deleted_at.';


-- ===========================================================================
-- TABLE: campaign_urls
-- Tracked / shortened URLs associated with campaigns
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.campaign_urls (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  campaign_id   UUID        REFERENCES public.campaigns(id) ON DELETE SET NULL,
  title         TEXT        NOT NULL CHECK (char_length(title) BETWEEN 1 AND 255),
  original_url  TEXT        NOT NULL,
  short_url     TEXT        UNIQUE,
  slug          TEXT        UNIQUE,
  clicks        INT         NOT NULL DEFAULT 0 CHECK (clicks >= 0),
  tags          TEXT[]      NOT NULL DEFAULT '{}',
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  metadata      JSONB       NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);

COMMENT ON TABLE  public.campaign_urls IS 'Tracked URLs, optionally shortened, linked to campaigns.';
COMMENT ON COLUMN public.campaign_urls.slug IS 'Human-readable short identifier used in short_url path.';


-- ===========================================================================
-- TABLE: extracted_content
-- Raw content scraped / extracted from a source URL
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.extracted_content (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
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
  -- No soft delete: extraction records are immutable audit artifacts
);

COMMENT ON TABLE public.extracted_content IS 'Content scraped from source URLs for AI processing.';


-- ===========================================================================
-- TABLE: generated_content
-- AI-generated post copy for a specific platform
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.generated_content (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  campaign_id           UUID        REFERENCES public.campaigns(id) ON DELETE SET NULL,
  extracted_content_id  UUID        REFERENCES public.extracted_content(id) ON DELETE SET NULL,
  platform              TEXT        NOT NULL
                                    CHECK (platform IN ('twitter','linkedin','instagram','facebook','tiktok')),
  content               TEXT        NOT NULL CHECK (char_length(content) >= 1),
  content_type          TEXT        NOT NULL DEFAULT 'post'
                                    CHECK (content_type IN ('post','thread','story','reel','carousel')),
  tone                  TEXT,
  hashtags              TEXT[]      NOT NULL DEFAULT '{}',
  is_approved           BOOLEAN     NOT NULL DEFAULT FALSE,
  approved_at           TIMESTAMPTZ,
  metadata              JSONB       NOT NULL DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at            TIMESTAMPTZ,
  CONSTRAINT ck_generated_content_approval
    CHECK (is_approved = FALSE OR approved_at IS NOT NULL)
);

COMMENT ON TABLE  public.generated_content IS 'AI-generated post content awaiting approval or scheduling.';
COMMENT ON COLUMN public.generated_content.is_approved IS 'Must set approved_at when TRUE.';


-- ===========================================================================
-- TABLE: media_assets
-- Images / videos attached to posts, stored in Supabase Storage
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.media_assets (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  campaign_id       UUID        REFERENCES public.campaigns(id) ON DELETE SET NULL,
  file_name         TEXT        NOT NULL,
  file_type         TEXT        NOT NULL CHECK (file_type IN ('image','video','gif')),
  mime_type         TEXT        NOT NULL,
  file_size_bytes   BIGINT      CHECK (file_size_bytes > 0),
  storage_path      TEXT        NOT NULL,
  public_url        TEXT,
  width             INT         CHECK (width  > 0),
  height            INT         CHECK (height > 0),
  duration_seconds  NUMERIC     CHECK (duration_seconds > 0),
  alt_text          TEXT,
  tags              TEXT[]      NOT NULL DEFAULT '{}',
  metadata          JSONB       NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ
);

COMMENT ON TABLE public.media_assets IS 'Media files uploaded to Supabase Storage, linked to campaigns/posts.';


-- ===========================================================================
-- TABLE: scheduled_posts
-- Posts queued for future publishing
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.scheduled_posts (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  campaign_id           UUID        REFERENCES public.campaigns(id) ON DELETE SET NULL,
  connection_id         UUID        REFERENCES public.platform_connections(id) ON DELETE SET NULL,
  generated_content_id  UUID        REFERENCES public.generated_content(id) ON DELETE SET NULL,
  platform              TEXT        NOT NULL
                                    CHECK (platform IN ('twitter','linkedin','instagram','facebook','tiktok')),
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
  deleted_at            TIMESTAMPTZ,
  CONSTRAINT ck_scheduled_posts_retries
    CHECK (retry_count <= max_retries + 1)
);

COMMENT ON TABLE  public.scheduled_posts IS 'Posts queued for publishing; status lifecycle: pending → processing → published/failed.';
COMMENT ON COLUMN public.scheduled_posts.media_asset_ids IS 'Array of media_assets.id references.';


-- ===========================================================================
-- TABLE: published_posts
-- Immutable record of every successfully published post + engagement stats
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.published_posts (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  campaign_id         UUID        REFERENCES public.campaigns(id) ON DELETE SET NULL,
  scheduled_post_id   UUID        REFERENCES public.scheduled_posts(id) ON DELETE SET NULL,
  connection_id       UUID        REFERENCES public.platform_connections(id) ON DELETE SET NULL,
  platform            TEXT        NOT NULL
                                  CHECK (platform IN ('twitter','linkedin','instagram','facebook','tiktok')),
  platform_post_id    TEXT,
  platform_post_url   TEXT,
  content             TEXT        NOT NULL,
  published_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Engagement metrics (updated by background sync)
  likes               INT         NOT NULL DEFAULT 0 CHECK (likes        >= 0),
  comments            INT         NOT NULL DEFAULT 0 CHECK (comments     >= 0),
  shares              INT         NOT NULL DEFAULT 0 CHECK (shares       >= 0),
  impressions         INT         NOT NULL DEFAULT 0 CHECK (impressions  >= 0),
  clicks              INT         NOT NULL DEFAULT 0 CHECK (clicks       >= 0),
  reach               INT         NOT NULL DEFAULT 0 CHECK (reach        >= 0),
  metadata            JSONB       NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- No soft delete: published records are the canonical audit trail
);

COMMENT ON TABLE public.published_posts IS 'Immutable record of published posts with engagement stats.';


-- ===========================================================================
-- TABLE: system_logs
-- Event / audit log for every publishing action
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.system_logs (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  campaign_id         UUID        REFERENCES public.campaigns(id) ON DELETE SET NULL,
  scheduled_post_id   UUID        REFERENCES public.scheduled_posts(id) ON DELETE SET NULL,
  connection_id       UUID        REFERENCES public.platform_connections(id) ON DELETE SET NULL,
  level               TEXT        NOT NULL
                                  CHECK (level IN ('info','warning','error','success')),
  platform            TEXT        CHECK (platform IN ('twitter','linkedin','instagram','facebook','tiktok')),
  event_type          TEXT        NOT NULL,
  message             TEXT        NOT NULL,
  details             JSONB       NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- Append-only: no updated_at, no soft delete
);

COMMENT ON TABLE public.system_logs IS 'Append-only audit log for publishing events. Never updated or deleted.';


-- ===========================================================================
-- TABLE: settings
-- Key/value user preferences and workspace configuration
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.settings (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  key         TEXT        NOT NULL CHECK (char_length(key) BETWEEN 1 AND 128),
  value       JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_settings_user_key UNIQUE (user_id, key)
);

COMMENT ON TABLE public.settings IS 'Per-user key/value configuration store.';


-- ===========================================================================
-- INDEXES
-- ===========================================================================

-- users
CREATE INDEX IF NOT EXISTS idx_users_email       ON public.users (email);
CREATE INDEX IF NOT EXISTS idx_users_deleted_at  ON public.users (deleted_at) WHERE deleted_at IS NOT NULL;

-- platform_connections
CREATE INDEX IF NOT EXISTS idx_platform_connections_user_id    ON public.platform_connections (user_id);
CREATE INDEX IF NOT EXISTS idx_platform_connections_platform   ON public.platform_connections (platform);
CREATE INDEX IF NOT EXISTS idx_platform_connections_status     ON public.platform_connections (status);
CREATE INDEX IF NOT EXISTS idx_platform_connections_deleted_at ON public.platform_connections (deleted_at) WHERE deleted_at IS NOT NULL;

-- campaigns
CREATE INDEX IF NOT EXISTS idx_campaigns_user_id    ON public.campaigns (user_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status     ON public.campaigns (status);
CREATE INDEX IF NOT EXISTS idx_campaigns_deleted_at ON public.campaigns (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_campaigns_dates      ON public.campaigns (start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_campaigns_name_trgm  ON public.campaigns USING gin (name gin_trgm_ops);

-- campaign_urls
CREATE INDEX IF NOT EXISTS idx_campaign_urls_user_id     ON public.campaign_urls (user_id);
CREATE INDEX IF NOT EXISTS idx_campaign_urls_campaign_id ON public.campaign_urls (campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_urls_deleted_at  ON public.campaign_urls (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_campaign_urls_is_active   ON public.campaign_urls (is_active);
CREATE INDEX IF NOT EXISTS idx_campaign_urls_tags        ON public.campaign_urls USING gin (tags);

-- extracted_content
CREATE INDEX IF NOT EXISTS idx_extracted_content_user_id   ON public.extracted_content (user_id);
CREATE INDEX IF NOT EXISTS idx_extracted_content_url_id    ON public.extracted_content (url_id);
CREATE INDEX IF NOT EXISTS idx_extracted_content_extracted ON public.extracted_content (extracted_at DESC);

-- generated_content
CREATE INDEX IF NOT EXISTS idx_generated_content_user_id     ON public.generated_content (user_id);
CREATE INDEX IF NOT EXISTS idx_generated_content_campaign_id ON public.generated_content (campaign_id);
CREATE INDEX IF NOT EXISTS idx_generated_content_platform    ON public.generated_content (platform);
CREATE INDEX IF NOT EXISTS idx_generated_content_approved    ON public.generated_content (is_approved);
CREATE INDEX IF NOT EXISTS idx_generated_content_deleted_at  ON public.generated_content (deleted_at) WHERE deleted_at IS NOT NULL;

-- media_assets
CREATE INDEX IF NOT EXISTS idx_media_assets_user_id     ON public.media_assets (user_id);
CREATE INDEX IF NOT EXISTS idx_media_assets_campaign_id ON public.media_assets (campaign_id);
CREATE INDEX IF NOT EXISTS idx_media_assets_file_type   ON public.media_assets (file_type);
CREATE INDEX IF NOT EXISTS idx_media_assets_deleted_at  ON public.media_assets (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_media_assets_tags        ON public.media_assets USING gin (tags);

-- scheduled_posts
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_user_id       ON public.scheduled_posts (user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_campaign_id   ON public.scheduled_posts (campaign_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_connection_id ON public.scheduled_posts (connection_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_platform      ON public.scheduled_posts (platform);
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_status        ON public.scheduled_posts (status);
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_scheduled_at  ON public.scheduled_posts (scheduled_at);
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_deleted_at    ON public.scheduled_posts (deleted_at) WHERE deleted_at IS NOT NULL;
-- Composite: upcoming pending posts (most frequent query)
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_pending_queue
  ON public.scheduled_posts (scheduled_at ASC)
  WHERE status = 'pending' AND deleted_at IS NULL;

-- published_posts
CREATE INDEX IF NOT EXISTS idx_published_posts_user_id          ON public.published_posts (user_id);
CREATE INDEX IF NOT EXISTS idx_published_posts_campaign_id      ON public.published_posts (campaign_id);
CREATE INDEX IF NOT EXISTS idx_published_posts_connection_id    ON public.published_posts (connection_id);
CREATE INDEX IF NOT EXISTS idx_published_posts_platform         ON public.published_posts (platform);
CREATE INDEX IF NOT EXISTS idx_published_posts_published_at     ON public.published_posts (published_at DESC);
CREATE INDEX IF NOT EXISTS idx_published_posts_scheduled_post   ON public.published_posts (scheduled_post_id);

-- system_logs
CREATE INDEX IF NOT EXISTS idx_system_logs_user_id          ON public.system_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_system_logs_campaign_id      ON public.system_logs (campaign_id);
CREATE INDEX IF NOT EXISTS idx_system_logs_level            ON public.system_logs (level);
CREATE INDEX IF NOT EXISTS idx_system_logs_platform         ON public.system_logs (platform);
CREATE INDEX IF NOT EXISTS idx_system_logs_created_at       ON public.system_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_logs_event_type       ON public.system_logs (event_type);
-- Composite: dashboard log feed (user + recency)
CREATE INDEX IF NOT EXISTS idx_system_logs_user_recent
  ON public.system_logs (user_id, created_at DESC);

-- settings
CREATE INDEX IF NOT EXISTS idx_settings_user_id ON public.settings (user_id);
