-- Migracja: pełna sekcja DIETA — licznik kalorii, baza produktów, gotowe posiłki.
-- Wklej w Supabase: Twój projekt -> SQL Editor -> New query -> Run
--
-- Zastępuje prosty checkin białkowy (daily_checkins) realnym dziennikiem żywieniowym.
-- Starej tabeli NIE usuwamy — zostaje z historycznymi danymi, ale apka jej już nie używa.

-- ---------- CELE ŻYWIENIOWE KLIENTA (ustawiane przez trenera) ----------
alter table clients add column if not exists kcal_target numeric;
alter table clients add column if not exists protein_target_g numeric;
alter table clients add column if not exists fat_target_g numeric;
alter table clients add column if not exists carbs_target_g numeric;

-- ---------- DZIENNIK ŻYWIENIOWY ----------
-- Jeden wiersz = jeden produkt zjedzony w danym posiłku danego dnia.
-- Wartości odżywcze zapisujemy PRZELICZONE NA ZJEDZONĄ PORCJĘ (nie na 100 g), bo:
--   1. produkt w bazie zewnętrznej może się zmienić albo zniknąć — wpis w dzienniku ma zostać taki, jaki był,
--   2. liczenie sum dziennych to wtedy zwykłe sumowanie kolumn, bez przeliczania w locie.
-- Kolumny *_per_100g trzymamy dodatkowo, żeby dało się edytować gramaturę bez ponownego szukania produktu.
create table if not exists diet_log_items (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  logged_at date not null,
  meal_type text not null default 'sniadanie',  -- sniadanie | obiad | kolacja | przekaski
  product_name text not null,
  brand text,
  barcode text,
  grams numeric not null default 100,
  kcal numeric not null default 0,
  protein_g numeric default 0,
  fat_g numeric default 0,
  carbs_g numeric default 0,
  kcal_per_100g numeric,
  protein_per_100g numeric,
  fat_per_100g numeric,
  carbs_per_100g numeric,
  source text default 'off',                     -- off (Open Food Facts) | wlasny | posilek
  created_at timestamptz default now()
);

create index if not exists diet_log_items_client_date_idx on diet_log_items (client_id, logged_at);

-- ---------- WŁASNE PRODUKTY KLIENTA ----------
-- Produkty, których nie ma w bazie zewnętrznej (np. domowa zupa babci, suplement, lokalna piekarnia).
-- Raz dodane, dostępne potem w wyszukiwarce klienta na stałe.
create table if not exists diet_products (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  name text not null,
  brand text,
  barcode text,
  kcal_per_100g numeric not null default 0,
  protein_per_100g numeric default 0,
  fat_per_100g numeric default 0,
  carbs_per_100g numeric default 0,
  created_at timestamptz default now()
);

create index if not exists diet_products_client_idx on diet_products (client_id);

-- ---------- GOTOWE POSIŁKI ----------
-- Zestaw produktów zapisany pod jedną nazwą ("Moje śniadanie", "Shake po treningu"),
-- dodawany do dziennika jednym kliknięciem zamiast wybierania 5 produktów po kolei.
-- items to JSONB: [{name, brand, grams, kcal, protein_g, fat_g, carbs_g, kcal_per_100g, ...}]
-- Posiłek może być przypisany do klienta (jego własny) ALBO mieć client_id = null —
-- wtedy jest to gotowiec od trenera, widoczny dla wszystkich klientów.
create table if not exists diet_meals (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  name text not null,
  items jsonb not null default '[]'::jsonb,
  total_kcal numeric default 0,
  total_protein_g numeric default 0,
  total_fat_g numeric default 0,
  total_carbs_g numeric default 0,
  created_at timestamptz default now()
);

create index if not exists diet_meals_client_idx on diet_meals (client_id);

-- ---------- RLS (ten sam model otwartego dostępu, co w reszcie aplikacji) ----------
alter table diet_log_items enable row level security;
alter table diet_products enable row level security;
alter table diet_meals enable row level security;

create policy "anon can read diet_log_items" on diet_log_items for select using (true);
create policy "anon can insert diet_log_items" on diet_log_items for insert with check (true);
create policy "anon can update diet_log_items" on diet_log_items for update using (true) with check (true);
create policy "anon can delete diet_log_items" on diet_log_items for delete using (true);

create policy "anon can read diet_products" on diet_products for select using (true);
create policy "anon can insert diet_products" on diet_products for insert with check (true);
create policy "anon can update diet_products" on diet_products for update using (true) with check (true);
create policy "anon can delete diet_products" on diet_products for delete using (true);

create policy "anon can read diet_meals" on diet_meals for select using (true);
create policy "anon can insert diet_meals" on diet_meals for insert with check (true);
create policy "anon can update diet_meals" on diet_meals for update using (true) with check (true);
create policy "anon can delete diet_meals" on diet_meals for delete using (true);
