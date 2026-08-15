-- Migracja: dane potrzebne do rzetelnego szacowania zapotrzebowania kalorycznego.
-- Wklej w Supabase: Twój projekt -> SQL Editor -> New query -> Run
--
-- Wiek i wzrost już mamy w tabeli clients (zbierane przy rejestracji) — brakowało tylko
-- płci i poziomu aktywności, bez których nie da się policzyć zapotrzebowania wzorem
-- Mifflin-St Jeor (to standard używany przez dietetyków).

-- K = kobieta, M = mężczyzna. Zostawiamy puste dla klientów, u których trener jeszcze nie uzupełnił.
alter table clients add column if not exists sex text;

-- Mnożnik aktywności (PAL) nakładany na BMR:
--   1.2   — praca siedząca, brak treningów
--   1.375 — lekka aktywność, 1-3 treningi w tygodniu
--   1.55  — umiarkowana, 3-5 treningów
--   1.725 — wysoka, 6-7 treningów albo praca fizyczna
alter table clients add column if not exists activity_level numeric default 1.375;
