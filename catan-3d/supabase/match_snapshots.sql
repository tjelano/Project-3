-- Run this once in your Supabase project: Dashboard -> SQL Editor -> New query.
--
-- This is a manual step because the app only ever holds the browser-safe
-- publishable key, which is deliberately scoped for client reads/writes —
-- creating tables and RLS policies requires the dashboard (or a service-role
-- key this app never has access to).
--
-- Open access (anyone with the publishable key can read/write any row) is a
-- deliberate match to this project's existing trust model: there's no auth
-- system, and every Realtime broadcast this app already sends is equally
-- unauthenticated. This is NOT hardened for a real production audience —
-- it's a hobby-scale prototype, consistent with everything built so far.

create table if not exists public.match_snapshots (
  room_code text primary key,
  snapshot jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.match_snapshots enable row level security;

create policy "match_snapshots_select" on public.match_snapshots
  for select using (true);

create policy "match_snapshots_upsert" on public.match_snapshots
  for insert with check (true);

create policy "match_snapshots_update" on public.match_snapshots
  for update using (true);
