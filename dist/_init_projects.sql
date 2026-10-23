-- =====================================================================
--  CodeSovereign — cloud sync table for projects (Settings > Integrations)
--  Run this once in your Supabase project's SQL editor:
--    https://supabase.com/dashboard/project/<your-project-ref>/sql/new
--
--  backend.js saveProject() upserts one row per project
--    POST /rest/v1/projects?on_conflict=id   (Prefer: resolution=merge-duplicates)
--  and the Settings "Test" button reads  GET /rest/v1/projects?select=id&limit=1.
--  Without this table every sync request answers 404 PGRST205
--  ("Could not find the table 'public.projects'").
--
--  SECURITY: like the other _init_*.sql tables, this is readable and
--  writeable with the publishable (anon) key, because the app has no user
--  sign-in. The publishable key ships inside the app, so ANYONE who has it
--  can read and overwrite every synced project — including full source
--  files. Use a project dedicated to this, don't sync anything secret, and
--  tighten these policies (e.g. require Supabase Auth) before sharing the app.
-- =====================================================================

create table if not exists public.projects (
  id          text primary key,
  device_id   text not null,
  name        text not null default 'Untitled',
  template    text not null default 'saas-dashboard',
  file_count  int  not null default 0,
  files       jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists projects_device_idx on public.projects (device_id);

alter table public.projects enable row level security;
drop policy if exists "projects read all" on public.projects;
create policy "projects read all" on public.projects for select using (true);
drop policy if exists "projects write all" on public.projects;
create policy "projects write all" on public.projects for all using (true) with check (true);
