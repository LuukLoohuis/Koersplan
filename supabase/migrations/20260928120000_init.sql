-- VELORIQ: profielen, atleten en koersen.
--
-- De browser praat nooit rechtstreeks met deze tabellen. Alleen de Express-server
-- leest en schrijft, met de secret key, en controleert zelf de rol (server/access.ts).
-- RLS staat aan zonder policies: de publishable key krijgt daardoor niets.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  name text,
  role text not null check (role in ('admin', 'coach', 'athlete')),
  created_at timestamptz not null default now()
);

create table public.athletes (
  id text primary key,                        -- "icu-4290985" of "demo-sanne"
  intervals_id text unique,                   -- athlete id bij intervals.icu
  name text not null,
  source text not null check (source in ('oauth', 'apikey', 'demo')),
  coach_id uuid references public.profiles (id) on delete set null,
  user_id uuid unique references public.profiles (id) on delete set null, -- login van de atleet zelf
  token_enc text,                             -- OAuth-token, AES-256-GCM (server/crypto.ts)
  api_key_enc text,                           -- eigen API-key, AES-256-GCM
  connected_at timestamptz not null default now()
);

create table public.plans (
  id text primary key,
  athlete_id text not null references public.athletes (id) on delete cascade,
  status text not null check (status in ('concept', 'gepubliceerd', 'gewijzigd')),
  data jsonb not null,                        -- volledige PlanRecord (shared/types.ts)
  created_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create index plans_athlete_idx on public.plans (athlete_id, created_at desc);
create index athletes_coach_idx on public.athletes (coach_id);

alter table public.profiles enable row level security;
alter table public.athletes enable row level security;
alter table public.plans enable row level security;
