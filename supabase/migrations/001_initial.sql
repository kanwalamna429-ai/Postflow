-- ============================================================
-- PostFlow — Initial Schema
-- Safe to re-run: uses IF NOT EXISTS / DROP IF EXISTS.
-- ============================================================

-- ----------------------------------------------------------------
-- campaign_urls
-- ----------------------------------------------------------------
create table if not exists public.campaign_urls (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  campaign_id   uuid,
  title         text not null,
  original_url  text not null,
  short_url     text,
  slug          text unique,
  clicks        integer not null default 0,
  tags          text[] not null default '{}',
  is_active     boolean not null default true,
  deleted_at    timestamptz,
  created_at    timestamptz not null default now()
);

alter table public.campaign_urls enable row level security;

drop policy if exists "Users manage own urls" on public.campaign_urls;
create policy "Users manage own urls"
  on public.campaign_urls
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ----------------------------------------------------------------
-- campaigns
-- ----------------------------------------------------------------
create table if not exists public.campaigns (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  name            text not null,
  description     text,
  status          text not null default 'draft',
  platforms       text[] not null default '{}',
  url_ids         text[] not null default '{}',
  frequency       text,
  start_date      date,
  end_date        date,
  timezone        text not null default 'UTC',
  url_count       integer not null default 0,
  scheduled_posts integer not null default 0,
  published_posts integer not null default 0,
  failed_posts    integer not null default 0,
  success_rate    numeric not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.campaigns enable row level security;

drop policy if exists "Users manage own campaigns" on public.campaigns;
create policy "Users manage own campaigns"
  on public.campaigns
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ----------------------------------------------------------------
-- platform_connections
-- ----------------------------------------------------------------
create table if not exists public.platform_connections (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  platform              text not null,
  account_name          text not null default '',
  account_handle        text not null,
  instance_url          text,
  status                text not null default 'connected',
  connected_at          timestamptz not null default now(),
  posts_published       integer not null default 0,
  credentials_encrypted text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (user_id, platform, account_handle)
);

-- Drop the old 5-platform CHECK constraint (added by 001_schema.sql) so all 17 platforms are accepted.
-- The app validates platform IDs in code, so no DB-level constraint is needed.
-- Drop any platform CHECK constraint (auto-named or explicitly named).
-- NOTE: Postgres normalises CHECK (platform IN (...)) into
--       CHECK ((platform = ANY (ARRAY[...]))) internally, so we must
--       match against the normalised form, not 'platform IN'.
DO $$
DECLARE v_name TEXT;
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
ALTER TABLE public.platform_connections DROP CONSTRAINT IF EXISTS ck_platform_connections_platform;

-- Patch any missing columns on pre-existing tables
alter table public.platform_connections add column if not exists account_name          text not null default '';
alter table public.platform_connections add column if not exists account_handle        text not null default '';
alter table public.platform_connections add column if not exists instance_url          text;
alter table public.platform_connections add column if not exists status                text not null default 'connected';
alter table public.platform_connections add column if not exists connected_at          timestamptz not null default now();
alter table public.platform_connections add column if not exists posts_published       integer not null default 0;
alter table public.platform_connections add column if not exists credentials_encrypted text;
alter table public.platform_connections add column if not exists created_at            timestamptz not null default now();
alter table public.platform_connections add column if not exists updated_at            timestamptz not null default now();

alter table public.campaign_urls add column if not exists title        text not null default '';
alter table public.campaign_urls add column if not exists original_url text not null default '';
alter table public.campaign_urls add column if not exists short_url    text;
alter table public.campaign_urls add column if not exists slug         text;
alter table public.campaign_urls add column if not exists clicks       integer not null default 0;
alter table public.campaign_urls add column if not exists tags         text[] not null default '{}';
alter table public.campaign_urls add column if not exists is_active    boolean not null default true;
alter table public.campaign_urls add column if not exists deleted_at   timestamptz;
alter table public.campaign_urls add column if not exists campaign_id  uuid;

alter table public.campaigns add column if not exists description     text;
alter table public.campaigns add column if not exists platforms       text[] not null default '{}';
alter table public.campaigns add column if not exists url_ids         text[] not null default '{}';
alter table public.campaigns add column if not exists frequency       text;
alter table public.campaigns add column if not exists start_date      date;
alter table public.campaigns add column if not exists end_date        date;
alter table public.campaigns add column if not exists timezone        text not null default 'UTC';
alter table public.campaigns add column if not exists url_count       integer not null default 0;
alter table public.campaigns add column if not exists scheduled_posts integer not null default 0;
alter table public.campaigns add column if not exists published_posts integer not null default 0;
alter table public.campaigns add column if not exists failed_posts    integer not null default 0;
alter table public.campaigns add column if not exists success_rate    numeric not null default 0;
alter table public.campaigns add column if not exists updated_at      timestamptz not null default now();

alter table public.system_logs add column if not exists level    text not null default 'info';
alter table public.system_logs add column if not exists campaign text not null default '';
alter table public.system_logs add column if not exists platform text not null default '';
alter table public.system_logs add column if not exists post_id  text;

alter table public.platform_connections enable row level security;

drop policy if exists "Users manage own connections" on public.platform_connections;
create policy "Users manage own connections"
  on public.platform_connections
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ----------------------------------------------------------------
-- system_logs
-- ----------------------------------------------------------------
create table if not exists public.system_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  level       text not null default 'info',
  campaign    text not null default '',
  platform    text not null default '',
  message     text not null,
  post_id     text,
  created_at  timestamptz not null default now()
);

alter table public.system_logs enable row level security;

drop policy if exists "Users view own logs" on public.system_logs;
create policy "Users view own logs"
  on public.system_logs
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Force PostgREST to reload the schema cache so new columns are visible immediately
notify pgrst, 'reload schema';
