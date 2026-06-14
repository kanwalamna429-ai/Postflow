-- =============================================================================
-- Migration 003: Functions and Triggers
-- - updated_at auto-stamp on all mutable tables
-- - Approval timestamp guard on generated_content
-- - Soft-delete guard (prevent updates after soft-delete)
-- - posts_published counter on platform_connections
-- - Cascade soft-delete: campaigns → scheduled_posts
-- - Automatic system_log entry on scheduled_post status change
-- Idempotent: CREATE OR REPLACE FUNCTION; DROP TRIGGER IF EXISTS before CREATE
-- =============================================================================


-- ===========================================================================
-- FUNCTION: set_updated_at()
-- Universal trigger function — sets updated_at = NOW() before any UPDATE
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.set_updated_at IS
  'Automatically stamps updated_at with the current timestamp on every UPDATE.';


-- Attach set_updated_at to every mutable table
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'users',
    'platform_connections',
    'campaigns',
    'campaign_urls',
    'extracted_content',
    'generated_content',
    'media_assets',
    'scheduled_posts',
    'published_posts',
    'settings'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_set_updated_at ON public.%I', tbl, tbl);
    EXECUTE format($trig$
      CREATE TRIGGER trg_%s_set_updated_at
        BEFORE UPDATE ON public.%I
        FOR EACH ROW
        EXECUTE FUNCTION public.set_updated_at();
    $trig$, tbl, tbl);
  END LOOP;
END;
$$;


-- ===========================================================================
-- FUNCTION: guard_approved_at()
-- Ensures approved_at is set when is_approved flips to TRUE on generated_content
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.guard_approved_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_approved = TRUE AND NEW.approved_at IS NULL THEN
    NEW.approved_at = NOW();
  END IF;
  -- Prevent un-approving without clearing approved_at
  IF NEW.is_approved = FALSE AND NEW.approved_at IS NOT NULL
     AND OLD.is_approved = TRUE THEN
    NEW.approved_at = NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_generated_content_guard_approved_at ON public.generated_content;
CREATE TRIGGER trg_generated_content_guard_approved_at
  BEFORE INSERT OR UPDATE ON public.generated_content
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_approved_at();

COMMENT ON FUNCTION public.guard_approved_at IS
  'Auto-sets approved_at when is_approved becomes TRUE; clears it when revoked.';


-- ===========================================================================
-- FUNCTION: prevent_update_after_soft_delete()
-- Blocks field updates on soft-deleted rows (deleted_at IS NOT NULL)
-- Applies to: campaigns, campaign_urls, platform_connections,
--             generated_content, media_assets, scheduled_posts
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.prevent_update_after_soft_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow updating deleted_at itself (to restore or hard-delete)
  IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NOT DISTINCT FROM OLD.deleted_at THEN
    RAISE EXCEPTION 'Cannot update a soft-deleted record (%).', TG_TABLE_NAME
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'campaigns',
    'campaign_urls',
    'platform_connections',
    'generated_content',
    'media_assets',
    'scheduled_posts'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_no_update_after_delete ON public.%I', tbl, tbl);
    EXECUTE format($trig$
      CREATE TRIGGER trg_%s_no_update_after_delete
        BEFORE UPDATE ON public.%I
        FOR EACH ROW
        WHEN (OLD.deleted_at IS NOT NULL)
        EXECUTE FUNCTION public.prevent_update_after_soft_delete();
    $trig$, tbl, tbl);
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.prevent_update_after_soft_delete IS
  'Raises an exception if a non-deleted_at field is changed on a soft-deleted row.';


-- ===========================================================================
-- FUNCTION: increment_connection_posts_published()
-- Increments platform_connections.posts_published each time a
-- published_post is inserted for that connection
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.increment_connection_posts_published()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.connection_id IS NOT NULL THEN
    UPDATE public.platform_connections
    SET posts_published = posts_published + 1
    WHERE id = NEW.connection_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_published_posts_incr_connection_count ON public.published_posts;
CREATE TRIGGER trg_published_posts_incr_connection_count
  AFTER INSERT ON public.published_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.increment_connection_posts_published();

COMMENT ON FUNCTION public.increment_connection_posts_published IS
  'Keeps platform_connections.posts_published in sync on each published_posts insert.';


-- ===========================================================================
-- FUNCTION: cascade_soft_delete_campaign_posts()
-- When a campaign is soft-deleted, soft-delete its pending scheduled_posts too
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.cascade_soft_delete_campaign_posts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only react when deleted_at goes from NULL → non-NULL
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    UPDATE public.scheduled_posts
    SET
      deleted_at = NEW.deleted_at,
      status     = 'cancelled'
    WHERE campaign_id = NEW.id
      AND deleted_at  IS NULL
      AND status      IN ('pending', 'processing');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_campaigns_cascade_soft_delete ON public.campaigns;
CREATE TRIGGER trg_campaigns_cascade_soft_delete
  AFTER UPDATE ON public.campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.cascade_soft_delete_campaign_posts();

COMMENT ON FUNCTION public.cascade_soft_delete_campaign_posts IS
  'Cancels pending/processing scheduled_posts when their campaign is soft-deleted.';


-- ===========================================================================
-- FUNCTION: log_scheduled_post_status_change()
-- Writes a system_log entry whenever a scheduled_post changes status
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.log_scheduled_post_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_level   TEXT;
  v_message TEXT;
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  v_level := CASE NEW.status
    WHEN 'published'  THEN 'success'
    WHEN 'failed'     THEN 'error'
    WHEN 'cancelled'  THEN 'warning'
    WHEN 'processing' THEN 'info'
    ELSE                   'info'
  END;

  v_message := format(
    'Scheduled post status changed from %s to %s',
    OLD.status, NEW.status
  );

  INSERT INTO public.system_logs (
    user_id,
    campaign_id,
    scheduled_post_id,
    connection_id,
    level,
    platform,
    event_type,
    message,
    details
  ) VALUES (
    NEW.user_id,
    NEW.campaign_id,
    NEW.id,
    NEW.connection_id,
    v_level,
    NEW.platform,
    'scheduled_post_status_change',
    v_message,
    jsonb_build_object(
      'old_status',   OLD.status,
      'new_status',   NEW.status,
      'retry_count',  NEW.retry_count,
      'error_message',NEW.error_message
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_scheduled_posts_log_status_change ON public.scheduled_posts;
CREATE TRIGGER trg_scheduled_posts_log_status_change
  AFTER UPDATE ON public.scheduled_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.log_scheduled_post_status_change();

COMMENT ON FUNCTION public.log_scheduled_post_status_change IS
  'Appends an audit entry to system_logs whenever a scheduled_post changes status.';


-- ===========================================================================
-- FUNCTION: log_published_post_insert()
-- Writes a success system_log entry whenever a published_post is inserted
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.log_published_post_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.system_logs (
    user_id,
    campaign_id,
    scheduled_post_id,
    connection_id,
    level,
    platform,
    event_type,
    message,
    details
  ) VALUES (
    NEW.user_id,
    NEW.campaign_id,
    NEW.scheduled_post_id,
    NEW.connection_id,
    'success',
    NEW.platform,
    'post_published',
    'Post published successfully',
    jsonb_build_object(
      'platform_post_id',  NEW.platform_post_id,
      'platform_post_url', NEW.platform_post_url,
      'published_at',      NEW.published_at
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_published_posts_log_insert ON public.published_posts;
CREATE TRIGGER trg_published_posts_log_insert
  AFTER INSERT ON public.published_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.log_published_post_insert();

COMMENT ON FUNCTION public.log_published_post_insert IS
  'Appends a success audit entry to system_logs for every published post.';


-- ===========================================================================
-- FUNCTION: log_platform_connection_status_change()
-- Logs connection errors / reconnections
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.log_platform_connection_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_level   TEXT;
  v_message TEXT;
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  v_level := CASE NEW.status
    WHEN 'connected'    THEN 'success'
    WHEN 'error'        THEN 'error'
    WHEN 'disconnected' THEN 'warning'
    ELSE                     'info'
  END;

  v_message := format(
    'Platform connection %s for %s changed from %s to %s',
    NEW.id, NEW.platform, OLD.status, NEW.status
  );

  INSERT INTO public.system_logs (
    user_id,
    connection_id,
    level,
    platform,
    event_type,
    message,
    details
  ) VALUES (
    NEW.user_id,
    NEW.id,
    v_level,
    NEW.platform,
    'connection_status_change',
    v_message,
    jsonb_build_object(
      'old_status',     OLD.status,
      'new_status',     NEW.status,
      'account_handle', NEW.account_handle
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_platform_connections_log_status ON public.platform_connections;
CREATE TRIGGER trg_platform_connections_log_status
  AFTER UPDATE ON public.platform_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.log_platform_connection_status_change();

COMMENT ON FUNCTION public.log_platform_connection_status_change IS
  'Logs platform connection status transitions (error, reconnect, disconnect) to system_logs.';
