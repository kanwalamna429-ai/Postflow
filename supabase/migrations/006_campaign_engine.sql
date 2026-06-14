-- =============================================================================
-- Migration 006: Campaign Engine
-- Adds frequency scheduling fields to campaigns.
-- Adds url_id and sequence tracking columns to scheduled_posts.
-- Idempotent: uses ADD COLUMN IF NOT EXISTS.
-- =============================================================================


-- ===========================================================================
-- TABLE: campaigns — add scheduling fields
-- ===========================================================================

-- Frequency type: how often to post
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS frequency_type TEXT
  CHECK (frequency_type IN (
    'hourly', 'every_n_hours', 'daily', 'every_n_days', 'weekly'
  ));

COMMENT ON COLUMN public.campaigns.frequency_type IS
  'Posting cadence type: hourly | every_n_hours | daily | every_n_days | weekly';

-- Frequency value: N in "every N hours" or "every N days"
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS frequency_value INT NOT NULL DEFAULT 1
  CHECK (frequency_value >= 1);

COMMENT ON COLUMN public.campaigns.frequency_value IS
  'Multiplier for frequency_type (e.g. 2 = every 2 hours when type=every_n_hours).';

-- Timezone: IANA timezone string (e.g. America/New_York)
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'UTC';

COMMENT ON COLUMN public.campaigns.timezone IS
  'IANA timezone for interpreting start_date and scheduled post times.';

-- Description: allow longer text for campaign descriptions
-- (already exists as TEXT, no change needed)


-- ===========================================================================
-- TABLE: campaigns — update status CHECK to include 'archived'
-- ===========================================================================

DO $$
DECLARE v_name TEXT;
BEGIN
  SELECT conname INTO v_name
  FROM pg_constraint
  WHERE conrelid = 'public.campaigns'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%status IN%';
  IF v_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.campaigns DROP CONSTRAINT %I', v_name);
  END IF;
END;
$$;

ALTER TABLE public.campaigns
  DROP CONSTRAINT IF EXISTS ck_campaigns_status;

ALTER TABLE public.campaigns
  ADD CONSTRAINT ck_campaigns_status
  CHECK (status IN ('draft', 'active', 'scheduled', 'paused', 'completed', 'archived'));


-- ===========================================================================
-- TABLE: scheduled_posts — add url tracking fields
-- ===========================================================================

-- Reference to the campaign_url that generated this scheduled post
ALTER TABLE public.scheduled_posts
  ADD COLUMN IF NOT EXISTS url_id UUID
  REFERENCES public.campaign_urls(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.scheduled_posts.url_id IS
  'The source campaign_url this post was generated from.';

-- Sequence index: ordering of posts within a campaign schedule
ALTER TABLE public.scheduled_posts
  ADD COLUMN IF NOT EXISTS sequence_index INT;

COMMENT ON COLUMN public.scheduled_posts.sequence_index IS
  'Zero-based ordering of this post within the campaign schedule.';


-- ===========================================================================
-- INDEXES for new columns
-- ===========================================================================

CREATE INDEX IF NOT EXISTS idx_campaigns_frequency_type
  ON public.campaigns (frequency_type)
  WHERE frequency_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_campaigns_timezone
  ON public.campaigns (timezone);

CREATE INDEX IF NOT EXISTS idx_scheduled_posts_url_id
  ON public.scheduled_posts (url_id)
  WHERE url_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_scheduled_posts_sequence
  ON public.scheduled_posts (campaign_id, sequence_index)
  WHERE deleted_at IS NULL;


-- ===========================================================================
-- COMPOSITE INDEX: campaign schedule queue
-- Fast lookup of all pending posts for a campaign ordered by schedule time
-- ===========================================================================

CREATE INDEX IF NOT EXISTS idx_scheduled_posts_campaign_pending
  ON public.scheduled_posts (campaign_id, scheduled_at ASC)
  WHERE status = 'pending' AND deleted_at IS NULL;
