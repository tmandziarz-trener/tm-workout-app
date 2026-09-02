-- Migracja: zgłoszenia na bezpłatną konsultację z landinga (start.html).
-- Wklej w Supabase: Twój projekt -> SQL Editor -> New query -> Run

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  -- dane z formularza
  name text not null,
  email text,
  phone text,
  goal text,              -- główny cel: schudnac / forma / zdrowie / inne
  goal_kg numeric,        -- ile kg chce zrzucić (opcjonalne)
  training_days text,     -- ile razy w tygodniu realnie może trenować
  where_train text,       -- dom / silownia / dwor
  note text,              -- co dotąd próbował(a), na czym się wykłada

  -- skąd przyszedł(a) — żeby dało się policzyć, która rolka dowozi
  source text,            -- np. 'ig-bio', 'rolka-5-bledow'
  utm text,               -- pełny query string, gdyby trzeba było wrócić do szczegółów

  -- obsługa przez trenera
  status text not null default 'nowy',   -- nowy / kontakt / konsultacja / klient / odpadl
  handled_at timestamptz,
  trainer_note text
);

create index if not exists leads_created_at_idx on leads (created_at desc);
create index if not exists leads_status_idx on leads (status);

-- Zgłoszenia zapisuje wyłącznie serwer (api/lead.js) kluczem service_role,
-- więc RLS zostaje włączony bez żadnej policy dla anon — z przeglądarki
-- nikt tej tabeli nie odczyta ani nie zapisze.
alter table leads enable row level security;
