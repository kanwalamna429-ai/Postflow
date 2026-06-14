-- =============================================================================
-- Migration 009: Campaigns — Store-Compatible Columns
--
-- The campaigns-store (client-side Supabase client) uses a set of denormalised
-- counter and reference columns that were introduced in 001_initial.sql but
-- are absent from 001_schema.sql. This migration ensures they exist regardless
-- of which initial migration was run first.
--
-- Idempotent: every statement uses ADD COLUMN IF NOT EXISTS.
-- =============================================================================


-- Array of URL IDs linked to this campaign (reference to campaign_urls.id)
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS url_ids text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.campaigns.url_ids IS
  'Array of campaign_urls.id values associated with this campaign.';

-- Human-readable frequency label stored by the UI (e.g. "Every 2 hours")
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS frequency text;

COMMENT ON COLUMN public.campaigns.frequency IS
  'Display label for the posting frequency (set by the UI layer).';

-- Denormalised counters kept in sync by the campaign engine
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS url_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS scheduled_posts integer NOT NULL DEFAULT 0;

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS published_posts integer NOT NULL DEFAULT 0;

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS failed_posts integer NOT NULL DEFAULT 0;

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS success_rate numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.campaigns.url_count       IS 'Total number of URLs attached to this campaign.';
COMMENT ON COLUMN public.campaigns.scheduled_posts IS 'Denormalised count of pending scheduled posts.';
COMMENT ON COLUMN public.campaigns.published_posts IS 'Denormalised count of successfully published posts.';
COMMENT ON COLUMN public.campaigns.failed_posts    IS 'Denormalised count of failed post attempts.';
COMMENT ON COLUMN public.campaigns.success_rate    IS 'Publish success rate 0–100, updated by the campaign engine.';

-- Notify PostgREST to reload the schema cache
NOTIFY pgrst, 'reload schema';
