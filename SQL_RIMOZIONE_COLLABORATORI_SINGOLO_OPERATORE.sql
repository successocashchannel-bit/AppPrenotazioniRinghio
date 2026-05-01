-- =========================================================
-- SQL RIMOZIONE COLLABORATORI - GESTIONALE SINGOLO OPERATORE
-- Sicuro per database già esistenti: non cancella prenotazioni.
-- Eseguilo in Supabase SQL Editor.
-- =========================================================

begin;

-- 1) Rimuove eventuali vincoli/FK che obbligano bookings/appointments a usare collaboratori.
alter table if exists public.bookings
  drop constraint if exists bookings_collaborator_id_fkey;

alter table if exists public.appointments
  drop constraint if exists appointments_collaborator_id_fkey;

alter table if exists public.recurring_rules
  drop constraint if exists recurring_rules_collaborator_id_fkey;

-- 2) Rende facoltativi i campi collaboratore, se esistono.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='bookings' and column_name='collaborator_id') then
    alter table public.bookings alter column collaborator_id drop not null;
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='bookings' and column_name='collaborator_name') then
    alter table public.bookings alter column collaborator_name drop not null;
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='appointments' and column_name='collaborator_id') then
    alter table public.appointments alter column collaborator_id drop not null;
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='appointments' and column_name='collaborator_name') then
    alter table public.appointments alter column collaborator_name drop not null;
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='recurring_rules' and column_name='collaborator_id') then
    alter table public.recurring_rules alter column collaborator_id drop not null;
  end if;
end $$;

-- 3) Pulisce i dati vecchi: le prenotazioni restano, ma senza assegnazione collaboratore.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='bookings' and column_name='collaborator_id') then
    update public.bookings set collaborator_id = null;
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='bookings' and column_name='collaborator_name') then
    update public.bookings set collaborator_name = null;
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='appointments' and column_name='collaborator_id') then
    update public.appointments set collaborator_id = null;
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='appointments' and column_name='collaborator_name') then
    update public.appointments set collaborator_name = null;
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='recurring_rules' and column_name='collaborator_id') then
    update public.recurring_rules set collaborator_id = null;
  end if;
end $$;

-- 4) Mantengo la tabella collaborators solo come compatibilità storica.
-- NON fare drop table finché non hai verificato il deploy su Vercel.
-- Quando tutto funziona, se vuoi eliminarla davvero puoi eseguire:
-- drop table if exists public.collaborators cascade;

commit;

select 'OK - collaboratori disattivati per gestionale singolo operatore' as risultato;
