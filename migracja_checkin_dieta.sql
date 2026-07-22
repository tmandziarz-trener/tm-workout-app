-- Migracja: prosty dzienny checkin żywieniowy (białko) — nowa zakładka "Dieta" w panelu klienta.
-- Wklej w Supabase: Twój projekt -> SQL Editor -> New query -> Run

create table if not exists daily_checkins (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  checkin_date date not null,
  protein_ok boolean,
  note text,
  created_at timestamptz default now(),
  unique (client_id, checkin_date)
);

alter table daily_checkins enable row level security;

create policy "anon can read daily_checkins" on daily_checkins for select using (true);
create policy "anon can insert daily_checkins" on daily_checkins for insert with check (true);
create policy "anon can update daily_checkins" on daily_checkins for update using (true) with check (true);
