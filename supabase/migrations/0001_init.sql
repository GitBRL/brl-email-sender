-- BRL Email Platform — full schema
-- Run via Supabase SQL Editor or `supabase db push`

create extension if not exists "pgcrypto";

-- ── Profiles & roles ─────────────────────────────────────────────────────────
do $$ begin
  create type user_role as enum ('admin', 'editor', 'viewer');
exception when duplicate_object then null; end $$;

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  name text,
  role user_role not null default 'viewer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auto-create a profile when an auth user is created
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', null))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Contacts ─────────────────────────────────────────────────────────────────
do $$ begin
  create type contact_tag as enum ('hot','warm','cold');
exception when duplicate_object then null; end $$;

do $$ begin
  create type contact_status as enum ('subscribed','unsubscribed','bounced');
exception when duplicate_object then null; end $$;

create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text,
  phone text,
  company text,
  tag contact_tag not null default 'cold',
  status contact_status not null default 'subscribed',
  lists uuid[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists contacts_tag_idx        on contacts(tag);
create index if not exists contacts_status_idx     on contacts(status);
create index if not exists contacts_lists_gin_idx  on contacts using gin(lists);
create index if not exists contacts_created_at_idx on contacts(created_at desc);

-- ── Lists ────────────────────────────────────────────────────────────────────
create table if not exists lists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create or replace view list_counts as
select l.id, l.name, l.description, l.created_at,
       coalesce((select count(*) from contacts c where l.id = any(c.lists) and c.status = 'subscribed'), 0) as contact_count
from lists l;

-- ── Templates ────────────────────────────────────────────────────────────────
create table if not exists templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  json_content jsonb not null default '{}'::jsonb, -- block editor state
  html_content text not null default '',           -- compiled HTML
  thumbnail_url text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Campaigns ────────────────────────────────────────────────────────────────
do $$ begin
  create type campaign_status as enum ('draft','scheduled','sending','sent','paused','failed');
exception when duplicate_object then null; end $$;

create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subject text not null,
  from_name text not null,
  from_email text not null,
  reply_to text,
  template_id uuid references templates(id) on delete set null,
  list_ids uuid[] not null default '{}',
  filter_tag contact_tag,
  status campaign_status not null default 'draft',
  scheduled_at timestamptz,
  sent_at timestamptz,
  total_recipients int not null default 0,
  resend_broadcast_id text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists campaigns_status_idx on campaigns(status);

-- ── Tracked links (one row per unique link in a campaign template) ──────────
create table if not exists tracked_links (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  link_id text not null,                  -- short token used in URLs
  original_url text not null,
  position jsonb,                          -- { top: number, left: number, width, height } as %
  click_count int not null default 0,
  created_at timestamptz not null default now(),
  unique (campaign_id, link_id)
);
create index if not exists tracked_links_campaign_idx on tracked_links(campaign_id);

-- ── Email events ─────────────────────────────────────────────────────────────
do $$ begin
  create type email_event_type as enum (
    'sent','delivered','opened','clicked','bounced','unsubscribed','complained','failed','delivery_delayed'
  );
exception when duplicate_object then null; end $$;

create table if not exists email_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,
  event_type email_event_type not null,
  link_url text,
  link_id text,
  ip_address text,
  user_agent text,
  country text,
  created_at timestamptz not null default now()
);
create index if not exists email_events_campaign_idx on email_events(campaign_id);
create index if not exists email_events_contact_idx  on email_events(contact_id);
create index if not exists email_events_type_idx     on email_events(event_type);
create index if not exists email_events_created_idx  on email_events(created_at desc);

-- ── Recipients (per-send aggregate state) ───────────────────────────────────
create table if not exists campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,
  email text not null,
  resend_id text unique,
  status text not null default 'queued',
  open_count int not null default 0,
  click_count int not null default 0,
  sent_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  bounced_at timestamptz
);
create index if not exists campaign_recipients_campaign_idx on campaign_recipients(campaign_id);
create index if not exists campaign_recipients_resend_idx   on campaign_recipients(resend_id);

-- ── updated_at triggers ─────────────────────────────────────────────────────
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists profiles_updated_at  on profiles;
drop trigger if exists contacts_updated_at  on contacts;
drop trigger if exists templates_updated_at on templates;
create trigger profiles_updated_at  before update on profiles  for each row execute function set_updated_at();
create trigger contacts_updated_at  before update on contacts  for each row execute function set_updated_at();
create trigger templates_updated_at before update on templates for each row execute function set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Single-tenant: any authenticated user with a profile can do everything.
-- App-level role checks gate destructive actions (admin/editor/viewer).
alter table profiles            enable row level security;
alter table contacts            enable row level security;
alter table lists               enable row level security;
alter table templates           enable row level security;
alter table campaigns           enable row level security;
alter table tracked_links       enable row level security;
alter table email_events        enable row level security;
alter table campaign_recipients enable row level security;

-- Profiles: anyone signed in can read; user can update own; admin can do all
do $$ begin create policy profiles_select on profiles for select to authenticated using (true); exception when duplicate_object then null; end $$;
do $$ begin create policy profiles_update_self on profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid()); exception when duplicate_object then null; end $$;
do $$ begin
  create policy profiles_admin_all on profiles for all to authenticated
    using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
    with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));
exception when duplicate_object then null; end $$;

-- Other tables: any authenticated user can read & write (gate by role in app code)
do $$ begin create policy auth_all on contacts            for all to authenticated using (true) with check (true); exception when duplicate_object then null; end $$;
do $$ begin create policy auth_all on lists               for all to authenticated using (true) with check (true); exception when duplicate_object then null; end $$;
do $$ begin create policy auth_all on templates           for all to authenticated using (true) with check (true); exception when duplicate_object then null; end $$;
do $$ begin create policy auth_all on campaigns           for all to authenticated using (true) with check (true); exception when duplicate_object then null; end $$;
do $$ begin create policy auth_all on tracked_links       for all to authenticated using (true) with check (true); exception when duplicate_object then null; end $$;
do $$ begin create policy auth_all on email_events        for all to authenticated using (true) with check (true); exception when duplicate_object then null; end $$;
do $$ begin create policy auth_all on campaign_recipients for all to authenticated using (true) with check (true); exception when duplicate_object then null; end $$;

-- After running this migration:
--   1) Create yourself an account in Supabase Auth (or sign up at /login)
--   2) Run: update profiles set role = 'admin' where email = 'you@brleducacao.com.br';
