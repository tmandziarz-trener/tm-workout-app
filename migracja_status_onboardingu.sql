-- Migracja: status onboardingu klienta widoczny dla trenera (hasło / cel / plan).
-- Kolumna password_hash jest celowo niewidoczna dla anon key (patrz migracja_haslo.sql),
-- więc panel trenera nie mógłby sam sprawdzić, czy klient ustawił hasło. Dlatego dodajemy
-- osobną, jawną flagę boolean "password_set", ustawianą wyłącznie przez serwerowe funkcje
-- (api/client-register.js, api/client-set-password.js, api/client-reset-password.js).
-- Wklej w Supabase: Twój projekt -> SQL Editor -> New query -> Run

alter table clients add column if not exists password_set boolean not null default false;

-- Jednorazowy backfill dla istniejących kont — ten SQL leci jako właściciel bazy (nie przez
-- anon key), więc może odczytać password_hash mimo revoke select dla anon/authenticated.
update clients set password_set = (password_hash is not null) where password_set is distinct from (password_hash is not null);

grant select (password_set) on clients to anon, authenticated;
