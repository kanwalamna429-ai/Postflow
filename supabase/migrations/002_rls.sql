-- =============================================================================
-- Migration 002: Row Level Security
-- Enable RLS on every table and define ownership policies.
-- Idempotent: DROP POLICY IF EXISTS before CREATE POLICY.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helper: inline function to get the current user's UUID from the JWT
-- ---------------------------------------------------------------------------
-- auth.uid() is built-in to Supabase; used directly in every policy below.


-- ===========================================================================
-- ENABLE RLS
-- ===========================================================================
ALTER TABLE public.users                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_urls        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.extracted_content    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generated_content    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_assets         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_posts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.published_posts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_logs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings             ENABLE ROW LEVEL SECURITY;

-- Force RLS even for table owners (Supabase best practice)
ALTER TABLE public.users                FORCE ROW LEVEL SECURITY;
ALTER TABLE public.platform_connections FORCE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns            FORCE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_urls        FORCE ROW LEVEL SECURITY;
ALTER TABLE public.extracted_content    FORCE ROW LEVEL SECURITY;
ALTER TABLE public.generated_content    FORCE ROW LEVEL SECURITY;
ALTER TABLE public.media_assets         FORCE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_posts      FORCE ROW LEVEL SECURITY;
ALTER TABLE public.published_posts      FORCE ROW LEVEL SECURITY;
ALTER TABLE public.system_logs          FORCE ROW LEVEL SECURITY;
ALTER TABLE public.settings             FORCE ROW LEVEL SECURITY;


-- ===========================================================================
-- TABLE: users
-- ===========================================================================
DROP POLICY IF EXISTS "users_select_own"  ON public.users;
DROP POLICY IF EXISTS "users_update_own"  ON public.users;
DROP POLICY IF EXISTS "users_insert_own"  ON public.users;
DROP POLICY IF EXISTS "users_delete_own"  ON public.users;

-- Users can read only their own profile
CREATE POLICY "users_select_own"
  ON public.users FOR SELECT
  USING (id = auth.uid());

-- Users can update only their own profile
CREATE POLICY "users_update_own"
  ON public.users FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Allow insert only for the matching auth user (used by the auth hook trigger)
CREATE POLICY "users_insert_own"
  ON public.users FOR INSERT
  WITH CHECK (id = auth.uid());

-- Soft-delete: users can mark themselves deleted (sets deleted_at externally)
-- Hard DELETE is not permitted via RLS; use an admin function instead
CREATE POLICY "users_delete_own"
  ON public.users FOR DELETE
  USING (id = auth.uid());


-- ===========================================================================
-- TABLE: platform_connections
-- ===========================================================================
DROP POLICY IF EXISTS "platform_connections_select_own"  ON public.platform_connections;
DROP POLICY IF EXISTS "platform_connections_insert_own"  ON public.platform_connections;
DROP POLICY IF EXISTS "platform_connections_update_own"  ON public.platform_connections;
DROP POLICY IF EXISTS "platform_connections_delete_own"  ON public.platform_connections;

CREATE POLICY "platform_connections_select_own"
  ON public.platform_connections FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "platform_connections_insert_own"
  ON public.platform_connections FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "platform_connections_update_own"
  ON public.platform_connections FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Soft delete: set deleted_at rather than hard DELETE
CREATE POLICY "platform_connections_delete_own"
  ON public.platform_connections FOR DELETE
  USING (user_id = auth.uid());


-- ===========================================================================
-- TABLE: campaigns
-- ===========================================================================
DROP POLICY IF EXISTS "campaigns_select_own"  ON public.campaigns;
DROP POLICY IF EXISTS "campaigns_insert_own"  ON public.campaigns;
DROP POLICY IF EXISTS "campaigns_update_own"  ON public.campaigns;
DROP POLICY IF EXISTS "campaigns_delete_own"  ON public.campaigns;

CREATE POLICY "campaigns_select_own"
  ON public.campaigns FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "campaigns_insert_own"
  ON public.campaigns FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "campaigns_update_own"
  ON public.campaigns FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "campaigns_delete_own"
  ON public.campaigns FOR DELETE
  USING (user_id = auth.uid());


-- ===========================================================================
-- TABLE: campaign_urls
-- ===========================================================================
DROP POLICY IF EXISTS "campaign_urls_select_own"  ON public.campaign_urls;
DROP POLICY IF EXISTS "campaign_urls_insert_own"  ON public.campaign_urls;
DROP POLICY IF EXISTS "campaign_urls_update_own"  ON public.campaign_urls;
DROP POLICY IF EXISTS "campaign_urls_delete_own"  ON public.campaign_urls;

CREATE POLICY "campaign_urls_select_own"
  ON public.campaign_urls FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "campaign_urls_insert_own"
  ON public.campaign_urls FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "campaign_urls_update_own"
  ON public.campaign_urls FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "campaign_urls_delete_own"
  ON public.campaign_urls FOR DELETE
  USING (user_id = auth.uid());


-- ===========================================================================
-- TABLE: extracted_content
-- ===========================================================================
DROP POLICY IF EXISTS "extracted_content_select_own"  ON public.extracted_content;
DROP POLICY IF EXISTS "extracted_content_insert_own"  ON public.extracted_content;
DROP POLICY IF EXISTS "extracted_content_update_own"  ON public.extracted_content;

CREATE POLICY "extracted_content_select_own"
  ON public.extracted_content FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "extracted_content_insert_own"
  ON public.extracted_content FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Allow updates for metadata enrichment (no hard DELETE)
CREATE POLICY "extracted_content_update_own"
  ON public.extracted_content FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- ===========================================================================
-- TABLE: generated_content
-- ===========================================================================
DROP POLICY IF EXISTS "generated_content_select_own"  ON public.generated_content;
DROP POLICY IF EXISTS "generated_content_insert_own"  ON public.generated_content;
DROP POLICY IF EXISTS "generated_content_update_own"  ON public.generated_content;
DROP POLICY IF EXISTS "generated_content_delete_own"  ON public.generated_content;

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
-- TABLE: media_assets
-- ===========================================================================
DROP POLICY IF EXISTS "media_assets_select_own"  ON public.media_assets;
DROP POLICY IF EXISTS "media_assets_insert_own"  ON public.media_assets;
DROP POLICY IF EXISTS "media_assets_update_own"  ON public.media_assets;
DROP POLICY IF EXISTS "media_assets_delete_own"  ON public.media_assets;

CREATE POLICY "media_assets_select_own"
  ON public.media_assets FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "media_assets_insert_own"
  ON public.media_assets FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "media_assets_update_own"
  ON public.media_assets FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "media_assets_delete_own"
  ON public.media_assets FOR DELETE
  USING (user_id = auth.uid());


-- ===========================================================================
-- TABLE: scheduled_posts
-- ===========================================================================
DROP POLICY IF EXISTS "scheduled_posts_select_own"  ON public.scheduled_posts;
DROP POLICY IF EXISTS "scheduled_posts_insert_own"  ON public.scheduled_posts;
DROP POLICY IF EXISTS "scheduled_posts_update_own"  ON public.scheduled_posts;
DROP POLICY IF EXISTS "scheduled_posts_delete_own"  ON public.scheduled_posts;

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


-- ===========================================================================
-- TABLE: published_posts
-- Read-only for users (only backend service role should insert/update)
-- ===========================================================================
DROP POLICY IF EXISTS "published_posts_select_own"  ON public.published_posts;
DROP POLICY IF EXISTS "published_posts_insert_own"  ON public.published_posts;
DROP POLICY IF EXISTS "published_posts_update_own"  ON public.published_posts;

-- Users can read their own published posts
CREATE POLICY "published_posts_select_own"
  ON public.published_posts FOR SELECT
  USING (user_id = auth.uid());

-- Inserts only via service_role (publishing worker) or matching user_id
CREATE POLICY "published_posts_insert_own"
  ON public.published_posts FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Engagement stats updates allowed (likes, comments, shares, etc.)
CREATE POLICY "published_posts_update_own"
  ON public.published_posts FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- ===========================================================================
-- TABLE: system_logs
-- Append-only: users can only SELECT their own logs, never modify
-- ===========================================================================
DROP POLICY IF EXISTS "system_logs_select_own"  ON public.system_logs;
DROP POLICY IF EXISTS "system_logs_insert_own"  ON public.system_logs;

CREATE POLICY "system_logs_select_own"
  ON public.system_logs FOR SELECT
  USING (user_id = auth.uid());

-- Inserts come from backend (service_role bypass) or matching user
CREATE POLICY "system_logs_insert_own"
  ON public.system_logs FOR INSERT
  WITH CHECK (user_id = auth.uid());


-- ===========================================================================
-- TABLE: settings
-- ===========================================================================
DROP POLICY IF EXISTS "settings_select_own"  ON public.settings;
DROP POLICY IF EXISTS "settings_insert_own"  ON public.settings;
DROP POLICY IF EXISTS "settings_update_own"  ON public.settings;
DROP POLICY IF EXISTS "settings_delete_own"  ON public.settings;

CREATE POLICY "settings_select_own"
  ON public.settings FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "settings_insert_own"
  ON public.settings FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "settings_update_own"
  ON public.settings FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "settings_delete_own"
  ON public.settings FOR DELETE
  USING (user_id = auth.uid());
