-- =====================================================================
--  CodeSovereign — Phase 8 schema (shared workspaces, ratings, actions)
--  Run this AFTER _init_marketplace.sql in the Supabase SQL editor:
--    https://supabase.com/dashboard/project/zobgxrwvyejfqekdumej/sql/new
--  Tables created:
--    workspaces         -- shared team workspaces + members + invites
--    template_reviews   -- 5-star ratings + text reviews
--    action_webhooks    -- GitHub Actions deploy webhooks
--    action_deliveries  -- simulated delivery log
--    oauth_tokens       -- per-provider OAuth tokens (multi-tenant)
--  All tables are RLS-enabled. Policies are permissive (anon) because
--  the app uses the anon key. Tighten in production.
-- =====================================================================

-- ---------- workspaces ----------
create table if not exists public.workspaces (
  id          text primary key,
  name        text not null,
  desc        text not null default '',
  created     timestamptz not null default now(),
  updated     timestamptz not null default now(),
  members     jsonb not null default '[]'::jsonb,    -- [{id,name,role,joined}]
  invites     jsonb not null default '[]'::jsonb,    -- [{token,role,created,uses}]
  log         jsonb not null default '[]'::jsonb     -- activity log
);
create index if not exists workspaces_updated_idx on public.workspaces (updated desc);
alter table public.workspaces enable row level security;
drop policy if exists "workspaces read all" on public.workspaces;
create policy "workspaces read all" on public.workspaces for select using (true);
drop policy if exists "workspaces write all" on public.workspaces;
create policy "workspaces write all" on public.workspaces for all using (true) with check (true);

-- ---------- template_reviews ----------
create table if not exists public.template_reviews (
  id          text primary key,
  template_id text not null,
  stars       int  not null check (stars between 1 and 5),
  title       text not null default '',
  body        text not null default '',
  author_id   text not null,
  author_name text,
  ts          timestamptz not null default now(),
  helpful     int  not null default 0,
  flagged     boolean not null default false
);
create index if not exists template_reviews_template_idx on public.template_reviews (template_id);
create index if not exists template_reviews_stars_idx   on public.template_reviews (stars);
create index if not exists template_reviews_ts_idx      on public.template_reviews (ts desc);
alter table public.template_reviews enable row level security;
drop policy if exists "template_reviews read all" on public.template_reviews;
create policy "template_reviews read all" on public.template_reviews for select using (true);
drop policy if exists "template_reviews write all" on public.template_reviews;
create policy "template_reviews write all" on public.template_reviews for all using (true) with check (true);

-- ---------- action_webhooks ----------
create table if not exists public.action_webhooks (
  id              text primary key,
  device_id       text not null,
  url             text not null,
  events          text[] not null default '{push}',
  secret          text not null default '',
  active          boolean not null default true,
  created         timestamptz not null default now(),
  last_triggered  timestamptz
);
create index if not exists action_webhooks_device_idx on public.action_webhooks (device_id);
alter table public.action_webhooks enable row level security;
drop policy if exists "action_webhooks read all" on public.action_webhooks;
create policy "action_webhooks read all" on public.action_webhooks for select using (true);
drop policy if exists "action_webhooks write all" on public.action_webhooks;
create policy "action_webhooks write all" on public.action_webhooks for all using (true) with check (true);

-- ---------- action_deliveries ----------
create table if not exists public.action_deliveries (
  id          text primary key,
  webhook_id  text not null references public.action_webhooks(id) on delete cascade,
  event       text not null,
  ts          timestamptz not null default now(),
  payload     jsonb not null default '{}'::jsonb,
  status      text not null default 'simulated',
  ok          boolean not null default true
);
create index if not exists action_deliveries_webhook_idx on public.action_deliveries (webhook_id, ts desc);
alter table public.action_deliveries enable row level security;
drop policy if exists "action_deliveries read all" on public.action_deliveries;
create policy "action_deliveries read all" on public.action_deliveries for select using (true);
drop policy if exists "action_deliveries write all" on public.action_deliveries;
create policy "action_deliveries write all" on public.action_deliveries for all using (true) with check (true);

-- ---------- oauth_tokens (per provider) ----------
create table if not exists public.oauth_tokens (
  device_id    text not null,
  provider     text not null,
  access_token text not null,
  token_type   text,
  refresh_token text,
  scope        text,
  expires_at   timestamptz,
  profile      jsonb,
  updated_at   timestamptz not null default now(),
  primary key (device_id, provider)
);
create index if not exists oauth_tokens_provider_idx on public.oauth_tokens (provider);
alter table public.oauth_tokens enable row level security;
drop policy if exists "oauth_tokens read all" on public.oauth_tokens;
create policy "oauth_tokens read all" on public.oauth_tokens for select using (true);
drop policy if exists "oauth_tokens write all" on public.oauth_tokens;
create policy "oauth_tokens write all" on public.oauth_tokens for all using (true) with check (true);

-- =====================================================================
--  Helper view: top-rated templates (Phase 8)
-- =====================================================================
create or replace view public.template_ratings_summary as
  select
    template_id,
    count(*) as review_count,
    round(avg(stars)::numeric, 2) as avg_stars,
    sum(helpful) as total_helpful
  from public.template_reviews
  group by template_id
  order by avg_stars desc, review_count desc;

-- =====================================================================
--  Done. Verify with:
--    select count(*) from public.workspaces;          -- starts at 0
--    select count(*) from public.template_reviews;    -- starts at 0
--    select count(*) from public.action_webhooks;     -- starts at 0
--    select * from public.template_ratings_summary limit 5;
-- =====================================================================
