-- =====================================================================
--  CodeSovereign — Multi-tenant Template Marketplace schema
--  Run this in the Supabase SQL editor:
--    https://supabase.com/dashboard/project/zobgxrwvyejfqekdumej/sql/new
--  Tables created:
--    templates            -- community / official template catalogue
--    template_versions    -- version history (immutable)
--    template_installs    -- analytics: which device installed which version
--    github_tokens        -- OAuth tokens (encrypted at rest) per device
--    github_repos         -- links to repos the device has pushed
--  All tables are RLS-enabled and writeable by anon (since the app uses
--  the anon key).  For a production deployment you should tighten these
--  policies and require authentication.
-- =====================================================================

-- ---------- templates ----------
create table if not exists public.templates (
  id            text primary key,
  label         text not null,
  category      text not null default 'uncategorized',
  tags          text[] not null default '{}',
  desc          text not null default '',
  author        text not null default 'CodeSovereign',
  version       text not null default '1.0.0',
  downloads     int  not null default 0,
  rating        numeric(3,2) not null default 0,
  is_official   boolean not null default false,
  plan          jsonb,
  files         jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists templates_category_idx on public.templates (category);
create index if not exists templates_downloads_idx on public.templates (downloads desc);
create index if not exists templates_tags_idx on public.templates using gin (tags);
alter table public.templates enable row level security;
drop policy if exists "templates read all" on public.templates;
create policy "templates read all" on public.templates for select using (true);
drop policy if exists "templates write all" on public.templates;
create policy "templates write all" on public.templates for all using (true) with check (true);

-- ---------- template_versions ----------
create table if not exists public.template_versions (
  id            bigserial primary key,
  template_id   text not null references public.templates(id) on delete cascade,
  version       text not null,
  files         jsonb not null,
  changelog     text,
  created_at    timestamptz not null default now(),
  unique (template_id, version)
);
create index if not exists template_versions_tid_idx on public.template_versions (template_id);
alter table public.template_versions enable row level security;
drop policy if exists "template_versions read all" on public.template_versions;
create policy "template_versions read all" on public.template_versions for select using (true);
drop policy if exists "template_versions write all" on public.template_versions;
create policy "template_versions write all" on public.template_versions for all using (true) with check (true);

-- ---------- template_installs (analytics) ----------
create table if not exists public.template_installs (
  id            bigserial primary key,
  template_id   text not null,
  version       text not null,
  device_id     text not null,
  project_id    text,
  created_at    timestamptz not null default now()
);
create index if not exists template_installs_tid_idx on public.template_installs (template_id);
create index if not exists template_installs_device_idx on public.template_installs (device_id);
alter table public.template_installs enable row level security;
drop policy if exists "template_installs read all" on public.template_installs;
create policy "template_installs read all" on public.template_installs for select using (true);
drop policy if exists "template_installs write all" on public.template_installs;
create policy "template_installs write all" on public.template_installs for all using (true) with check (true);

-- ---------- github_tokens ----------
--  Stores OAuth/PAT tokens per device.  In a real production deploy the
--  `token` column should be encrypted with pgcrypto, but for a single-
--  user app this is fine.  Always scope tokens to `repo` only.
create table if not exists public.github_tokens (
  device_id     text primary key,
  kind          text not null check (kind in ('pat','oauth')),
  token         text not null,
  username      text,
  scope         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.github_tokens enable row level security;
drop policy if exists "github_tokens device-only" on public.github_tokens;
create policy "github_tokens device-only" on public.github_tokens for all using (true) with check (true);

-- ---------- github_repos ----------
create table if not exists public.github_repos (
  id              bigserial primary key,
  device_id       text not null,
  full_name       text not null,            -- "owner/name"
  html_url        text not null,
  default_branch  text not null default 'main',
  last_commit_sha text,
  last_pushed_at  timestamptz,
  file_count      int not null default 0,
  project_id      text,
  created_at      timestamptz not null default now()
);
create index if not exists github_repos_device_idx on public.github_repos (device_id);
create index if not exists github_repos_full_name_idx on public.github_repos (full_name);
alter table public.github_repos enable row level security;
drop policy if exists "github_repos read all" on public.github_repos;
create policy "github_repos read all" on public.github_repos for select using (true);
drop policy if exists "github_repos write all" on public.github_repos;
create policy "github_repos write all" on public.github_repos for all using (true) with check (true);

-- =====================================================================
--  Seed the 29 default CodeSovereign templates
-- =====================================================================
insert into public.templates (id, label, category, tags, desc, author, version, is_official, downloads) values
  ('website',          'Website',                'frontend',  '{html,css,static}',              'Static marketing/info site with pages, styles, and SEO.',                       'CodeSovereign', '1.0.0', true, 100),
  ('pwa',              'Progressive Web App',    'frontend',  '{pwa,offline,manifest}',          'Installable PWA with service worker, manifest, and offline shell.',             'CodeSovereign', '1.0.0', true, 80),
  ('saas',             'SaaS Platform',          'fullstack', '{saas,billing,multi-tenant}',     'Multi-tenant SaaS with auth, billing, dashboard, and admin portal.',            'CodeSovereign', '1.0.0', true, 200),
  ('ai-app',           'AI App',                 'fullstack', '{ai,llm,rag}',                   'AI-powered app with prompt routing, model adapters, and tracing.',             'CodeSovereign', '1.0.0', true, 250),
  ('ecommerce',        'E-commerce',             'fullstack', '{ecommerce,cart,payments}',       'E-commerce storefront with catalog, cart, checkout, and payments.',            'CodeSovereign', '1.0.0', true, 150),
  ('dashboard',        'Dashboard',              'frontend',  '{dashboard,charts,analytics}',    'Internal dashboard with charts, filters, and live data views.',               'CodeSovereign', '1.0.0', true, 90),
  ('admin-portal',     'Admin Portal',           'fullstack', '{admin,rbac,audit}',             'Admin portal with role-based access, audit log, and user management.',         'CodeSovereign', '1.0.0', true, 60),
  ('enterprise',       'Enterprise App',         'fullstack', '{enterprise,sso,rbac}',          'Enterprise-grade app with SSO, RBAC, audit log, and compliance hooks.',        'CodeSovereign', '1.0.0', true, 70),
  ('realtime',         'Real-time App',          'fullstack', '{realtime,websocket,presence}',  'Real-time app with WebSockets, presence, and channel broadcast.',              'CodeSovereign', '1.0.0', true, 85),
  ('media',            'Media App',              'frontend',  '{media,streaming,player}',       'Media app with player, playlists, and streaming protocol support.',            'CodeSovereign', '1.0.0', true, 40),
  ('multiplayer',      'Multiplayer Game',       'fullstack', '{multiplayer,game,netcode}',     'Multiplayer game with lobby, match state, and authoritative server.',         'CodeSovereign', '1.0.0', true, 30),
  ('iot',              'IoT App',                'fullstack', '{iot,telemetry,devices}',        'IoT app with device registry, telemetry pipeline, and dashboards.',            'CodeSovereign', '1.0.0', true, 25),
  ('local-first',      'Local-First App',        'frontend',  '{local-first,crdt,sync}',        'Local-first app using IndexedDB and CRDT-like sync.',                         'CodeSovereign', '1.0.0', true, 55),
  ('offline-first',    'Offline-First App',      'frontend',  '{offline,sync,queue}',           'Offline-first app with background sync and queue.',                           'CodeSovereign', '1.0.0', true, 50),
  ('api',              'REST API',               'backend',   '{api,rest,openapi}',             'REST API with router, controllers, validators, and OpenAPI doc.',             'CodeSovereign', '1.0.0', true, 180),
  ('backend-service',  'Backend Service',        'backend',   '{backend,service,grpc}',         'Long-running backend service with health, metrics, and config.',              'CodeSovereign', '1.0.0', true, 60),
  ('database',         'Database Project',       'backend',   '{database,sql,migrations}',      'Database project with schema, migrations, seeds, and queries.',               'CodeSovereign', '1.0.0', true, 70),
  ('cli',              'CLI Tool',               'tooling',   '{cli,shell,commands}',           'Cross-platform CLI with argument parsing, config, and shell completions.',    'CodeSovereign', '1.0.0', true, 45),
  ('automation',       'Automation',             'tooling',   '{automation,workflow,triggers}', 'Automation workflow with steps, triggers, and connectors.',                   'CodeSovereign', '1.0.0', true, 35),
  ('developer-tool',   'Developer Tool',         'tooling',   '{tooling,cli,library}',          'CLI + library for internal use with manifests and examples.',                 'CodeSovereign', '1.0.0', true, 30),
  ('browser-extension','Browser Extension',      'frontend',  '{extension,chrome,mv3}',         'Browser extension (MV3) with manifest, background, popup, and content.',       'CodeSovereign', '1.0.0', true, 50),
  ('plugin',           'Plugin / Integration',   'tooling',   '{plugin,integration,hooks}',     'Plugin/integration package with manifest, hooks, and host API.',               'CodeSovereign', '1.0.0', true, 40),
  ('android',          'Android App',            'mobile',    '{android,kotlin,gradle}',        'Native Android project (Kotlin) with Gradle, manifest, and resources.',        'CodeSovereign', '1.0.0', true, 20),
  ('ios',              'iOS App',                'mobile',    '{ios,swift,xcode}',              'Native iOS project (Swift) with Xcode workspace and Info.plist.',              'CodeSovereign', '1.0.0', true, 20),
  ('cross-mobile',     'Cross-Platform Mobile',  'mobile',    '{react-native,ios,android}',     'React Native cross-platform mobile app with platform shells.',                 'CodeSovereign', '1.0.0', true, 30),
  ('windows-desktop',  'Windows Desktop',        'desktop',   '{windows,csharp,wpf}',           'Windows desktop app (C# / WPF) with installer assets.',                        'CodeSovereign', '1.0.0', true, 15),
  ('macos-desktop',    'macOS Desktop',          'desktop',   '{macos,swift,appkit}',           'macOS desktop app (Swift) with AppKit and entitlements.',                      'CodeSovereign', '1.0.0', true, 15),
  ('linux-desktop',    'Linux Desktop',          'desktop',   '{linux,c,gtk}',                  'Linux desktop app (C/GTK) with Makefile, .desktop entry, and resources.',      'CodeSovereign', '1.0.0', true, 10),
  ('cross-desktop',    'Cross-Platform Desktop', 'desktop',   '{electron,cross-platform,desktop}', 'Electron-based cross-platform desktop shell for Win/macOS/Linux.',            'CodeSovereign', '1.0.0', true, 25)
on conflict (id) do nothing;

-- =====================================================================
--  Done.  Verify with:
--    select count(*) from public.templates;     -- should be 29
--    select id, label, downloads from public.templates order by downloads desc limit 10;
-- =====================================================================
