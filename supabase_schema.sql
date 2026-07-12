-- TM Workout — schemat bazy danych
-- Wklej całość do Supabase: Twój projekt -> SQL Editor -> New query -> Run

create extension if not exists "pgcrypto";

create table clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  age int,
  height_cm numeric,
  phone text,
  email text,
  created_at timestamptz default now()
);

create table measurements (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  measured_at date not null,
  weight_kg numeric,
  arm_cm numeric,
  chest_cm numeric,
  waist_cm numeric,
  hip_cm numeric,
  thigh_cm numeric,
  created_at timestamptz default now()
);

create table exercise_logs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  logged_at date not null,
  exercise_name text not null,
  sets int,
  reps int,
  weight_kg numeric,
  video_url text,
  note text,
  created_at timestamptz default now()
);

-- Włączamy RLS (Row Level Security) i dodajemy proste, otwarte polityki.
-- UWAGA: to jest model "każdy z linkiem może zapisywać/czytać" — tak samo jak
-- w wersji z Google Forms/Sheets. Wystarczające do śledzenia pomiarów i treningów,
-- ale to NIE jest prawdziwe uwierzytelnianie klienta. Nie trzymaj tu nic bardziej wrażliwego.

alter table clients enable row level security;
alter table measurements enable row level security;
alter table exercise_logs enable row level security;

create policy "anon can read clients" on clients for select using (true);
create policy "anon can insert clients" on clients for insert with check (true);

create policy "anon can read measurements" on measurements for select using (true);
create policy "anon can insert measurements" on measurements for insert with check (true);

create policy "anon can read exercise_logs" on exercise_logs for select using (true);
create policy "anon can insert exercise_logs" on exercise_logs for insert with check (true);

-- Bucket na wideo — utwórz też ręcznie w zakładce Storage (patrz instrukcja), ta linia
-- działa tylko jeśli Twój projekt Supabase wspiera tworzenie bucketów z SQL (zwykle tak):
insert into storage.buckets (id, name, public) values ('videos', 'videos', true)
on conflict (id) do nothing;

create policy "anon can upload videos" on storage.objects for insert
  with check (bucket_id = 'videos');
create policy "anon can read videos" on storage.objects for select
  using (bucket_id = 'videos');
