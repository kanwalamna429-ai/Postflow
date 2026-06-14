-- =============================================================================
-- Migration 004: Auth Hook
-- Auto-creates a public.users row when a new auth.users record is inserted.
-- Writes a welcome entry to system_logs.
-- Inserts default settings for the new user.
-- Idempotent: CREATE OR REPLACE FUNCTION; DROP TRIGGER IF EXISTS before CREATE.
-- =============================================================================


-- ===========================================================================
-- FUNCTION: handle_new_auth_user()
-- Called by the AFTER INSERT trigger on auth.users.
-- Creates matching rows in public.users, public.settings, and public.system_logs.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email     TEXT;
  v_full_name TEXT;
  v_avatar    TEXT;
BEGIN
  v_email     := NEW.email;
  v_full_name := COALESCE(
                   NEW.raw_user_meta_data ->> 'full_name',
                   NEW.raw_user_meta_data ->> 'name',
                   split_part(NEW.email, '@', 1)
                 );
  v_avatar    := NEW.raw_user_meta_data ->> 'avatar_url';

  -- 1. Create the public profile row
  INSERT INTO public.users (id, email, full_name, avatar_url)
  VALUES (NEW.id, v_email, v_full_name, v_avatar)
  ON CONFLICT (id) DO NOTHING;

  -- 2. Seed default notification settings
  INSERT INTO public.settings (user_id, key, value)
  VALUES
    (NEW.id, 'notifications', jsonb_build_object(
      'post_failures',    true,
      'post_success',     false,
      'campaign_end',     true,
      'rate_limit',       true,
      'auth_expiry',      true,
      'weekly_digest',    false
    )),
    (NEW.id, 'timezone', '"UTC"'::jsonb),
    (NEW.id, 'theme',    '"system"'::jsonb)
  ON CONFLICT (user_id, key) DO NOTHING;

  -- 3. Write a welcome audit entry
  INSERT INTO public.system_logs (
    user_id,
    level,
    event_type,
    message,
    details
  ) VALUES (
    NEW.id,
    'info',
    'user_signup',
    'New user account created',
    jsonb_build_object(
      'email',      v_email,
      'provider',   COALESCE(NEW.raw_app_meta_data ->> 'provider', 'email'),
      'created_at', NEW.created_at
    )
  );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_auth_user IS
  'Bootstraps a new user: creates public.users profile, default settings, and signup audit log.';


-- Attach to auth.users (lives in the auth schema — requires superuser)
DROP TRIGGER IF EXISTS trg_auth_users_on_new_user ON auth.users;
CREATE TRIGGER trg_auth_users_on_new_user
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();


-- ===========================================================================
-- FUNCTION: handle_delete_auth_user()
-- Soft-deletes the public.users row when an auth.users record is deleted.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.handle_delete_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.users
  SET deleted_at = NOW()
  WHERE id = OLD.id AND deleted_at IS NULL;

  INSERT INTO public.system_logs (
    user_id,
    level,
    event_type,
    message,
    details
  ) VALUES (
    OLD.id,
    'warning',
    'user_deleted',
    'Auth user deleted — public profile soft-deleted',
    jsonb_build_object('deleted_at', NOW())
  );

  RETURN OLD;
END;
$$;

COMMENT ON FUNCTION public.handle_delete_auth_user IS
  'Soft-deletes public.users profile and logs the event when an auth.users row is deleted.';

DROP TRIGGER IF EXISTS trg_auth_users_on_delete_user ON auth.users;
CREATE TRIGGER trg_auth_users_on_delete_user
  BEFORE DELETE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_delete_auth_user();
