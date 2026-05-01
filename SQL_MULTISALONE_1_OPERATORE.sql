-- =====================================================
-- SQL MULTISALONE - 1 OPERATORE - FINO A 5 PERSONE
-- Compatibile con progetto Next.js/Supabase
-- Non cancella dati esistenti.
-- Salone principale di default: salone_1
-- =====================================================

begin;

create extension if not exists pgcrypto;

-- =====================================================
-- 1) TABELLA SALONI
-- =====================================================
create table if not exists public.salons (
  id text primary key,
  name text not null default 'Salone',
  slug text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.salons
  add column if not exists name text not null default 'Salone',
  add column if not exists slug text,
  add column if not exists active boolean not null default true,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

insert into public.salons (id, name, slug, active)
values ('salone_1', 'Salone 1', 'salone-1', true)
on conflict (id) do update set
  name = excluded.name,
  slug = excluded.slug,
  active = true,
  updated_at = now();

create unique index if not exists salons_slug_unique
on public.salons (slug)
where slug is not null;

-- =====================================================
-- 2) BUSINESS SETTINGS MULTISALONE
-- =====================================================
create table if not exists public.business_settings (
  id text primary key,
  salon_id text,
  slot_minutes integer not null default 15,
  min_advance_min integer not null default 60,
  closed_weekdays integer[] not null default array[0,1],
  holidays text[] not null default array[]::text[],
  morning_enabled boolean not null default true,
  morning_start text not null default '09:00',
  morning_end text not null default '13:00',
  afternoon_enabled boolean not null default true,
  afternoon_start text not null default '15:30',
  afternoon_end text not null default '20:00',
  brand_title text not null default 'Salon Estetica',
  brand_subtitle text not null default 'Prenota il tuo appuntamento in pochi secondi',
  brand_description text not null default '',
  logo_url text,
  icon_192 text,
  icon_512 text,
  updated_at timestamptz not null default now()
);

alter table public.business_settings
  add column if not exists salon_id text,
  add column if not exists slot_minutes integer default 15,
  add column if not exists min_advance_min integer default 60,
  add column if not exists closed_weekdays integer[] default array[0,1],
  add column if not exists holidays text[] default array[]::text[],
  add column if not exists morning_enabled boolean default true,
  add column if not exists morning_start text default '09:00',
  add column if not exists morning_end text default '13:00',
  add column if not exists afternoon_enabled boolean default true,
  add column if not exists afternoon_start text default '15:30',
  add column if not exists afternoon_end text default '20:00',
  add column if not exists brand_title text default 'Salon Estetica',
  add column if not exists brand_subtitle text default 'Prenota il tuo appuntamento in pochi secondi',
  add column if not exists brand_description text default '',
  add column if not exists logo_url text,
  add column if not exists icon_192 text,
  add column if not exists icon_512 text,
  add column if not exists updated_at timestamptz default now();

update public.business_settings
set salon_id = 'salone_1'
where salon_id is null or salon_id = '';

insert into public.business_settings (
  id, salon_id, slot_minutes, min_advance_min, closed_weekdays, holidays,
  morning_enabled, morning_start, morning_end,
  afternoon_enabled, afternoon_start, afternoon_end,
  brand_title, brand_subtitle, brand_description, updated_at
)
values (
  'salone_1_settings', 'salone_1', 15, 60, array[0,1]::integer[], array[]::text[],
  true, '09:00', '13:00',
  true, '15:30', '20:00',
  'Salon Estetica', 'Prenota il tuo appuntamento in pochi secondi', '', now()
)
on conflict (id) do nothing;

create unique index if not exists business_settings_salon_id_unique
on public.business_settings (salon_id)
where salon_id is not null;

-- =====================================================
-- 3) SERVIZI MULTISALONE
-- =====================================================
create table if not exists public.services (
  id text primary key,
  salon_id text,
  name text not null,
  duration_min integer not null default 30,
  price numeric not null default 0,
  active boolean not null default true,
  sort_order integer,
  updated_at timestamptz not null default now()
);

alter table public.services
  add column if not exists salon_id text,
  add column if not exists name text,
  add column if not exists duration_min integer default 30,
  add column if not exists price numeric default 0,
  add column if not exists active boolean default true,
  add column if not exists sort_order integer,
  add column if not exists updated_at timestamptz default now();

update public.services
set salon_id = 'salone_1'
where salon_id is null or salon_id = '';

update public.services
set
  duration_min = coalesce(duration_min, 30),
  price = coalesce(price, 0),
  active = coalesce(active, true),
  updated_at = coalesce(updated_at, now());

-- Indice richiesto dagli upsert del codice
create unique index if not exists services_id_unique
on public.services (id);

create index if not exists services_salon_id_idx
on public.services (salon_id);

-- Servizi base per salone_1. Gli ID sono prefissati per evitare collisioni tra saloni.
insert into public.services (id, salon_id, name, duration_min, price, active, sort_order)
values
  ('salone_1_barba', 'salone_1', 'Barba', 15, 10, true, 10),
  ('salone_1_taglio', 'salone_1', 'Taglio', 30, 15, true, 20),
  ('salone_1_barba_taglio', 'salone_1', 'Barba + Taglio', 45, 20, true, 30)
on conflict (id) do update set
  salon_id = excluded.salon_id,
  name = excluded.name,
  duration_min = excluded.duration_min,
  price = excluded.price,
  active = excluded.active,
  sort_order = excluded.sort_order,
  updated_at = now();

create or replace function public.set_default_service_salon_id()
returns trigger
language plpgsql
as $$
begin
  if new.salon_id is null or new.salon_id = '' then
    new.salon_id := 'salone_1';
  end if;

  if new.updated_at is null then
    new.updated_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_set_default_service_salon_id on public.services;
create trigger trg_set_default_service_salon_id
before insert or update on public.services
for each row execute function public.set_default_service_salon_id();

-- =====================================================
-- 4) COLLABORATORE UNICO/OPERATORE UNICO
-- La voce collaboratori è rimossa dall'interfaccia, ma la tabella resta
-- per compatibilità interna con calendario/prenotazioni.
-- =====================================================
create table if not exists public.collaborators (
  id text primary key,
  salon_id text,
  name text not null default 'Operatore',
  color text not null default '#111827',
  active boolean not null default true,
  sort_order integer,
  google_calendar_id text,
  updated_at timestamptz not null default now()
);

alter table public.collaborators
  add column if not exists salon_id text,
  add column if not exists name text default 'Operatore',
  add column if not exists color text default '#111827',
  add column if not exists active boolean default true,
  add column if not exists sort_order integer,
  add column if not exists google_calendar_id text,
  add column if not exists updated_at timestamptz default now();

update public.collaborators
set salon_id = 'salone_1'
where salon_id is null or salon_id = '';

create unique index if not exists collaborators_id_unique
on public.collaborators (id);

create index if not exists collaborators_salon_id_idx
on public.collaborators (salon_id);

insert into public.collaborators (id, salon_id, name, color, active, sort_order)
values ('salone_1_collaboratore_1', 'salone_1', 'Operatore', '#111827', true, 1)
on conflict (id) do update set
  salon_id = excluded.salon_id,
  name = excluded.name,
  color = excluded.color,
  active = true,
  sort_order = 1,
  updated_at = now();

-- =====================================================
-- 5) APPUNTAMENTI / STORICO
-- =====================================================
create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  salon_id text,
  event_id text,
  google_event_id text,
  calendar_id text default 'primary',
  customer_name text not null,
  phone text,
  customer_phone text,
  customer_names text[],
  service_id text not null,
  service_name text,
  collaborator_id text,
  collaborator_name text,
  notes text,
  price numeric default 0,
  date text,
  time text,
  date_iso text,
  start_time text,
  end_time text,
  start_iso text,
  end_iso text,
  people_count integer not null default 1,
  group_label text,
  recurrence_label text,
  recurring_rule_id text,
  status text not null default 'confirmed',
  created_at timestamptz not null default now()
);

alter table public.appointments
  add column if not exists salon_id text,
  add column if not exists event_id text,
  add column if not exists google_event_id text,
  add column if not exists calendar_id text default 'primary',
  add column if not exists customer_name text,
  add column if not exists phone text,
  add column if not exists customer_phone text,
  add column if not exists customer_names text[],
  add column if not exists service_id text,
  add column if not exists service_name text,
  add column if not exists collaborator_id text,
  add column if not exists collaborator_name text,
  add column if not exists notes text,
  add column if not exists price numeric default 0,
  add column if not exists date text,
  add column if not exists time text,
  add column if not exists date_iso text,
  add column if not exists start_time text,
  add column if not exists end_time text,
  add column if not exists start_iso text,
  add column if not exists end_iso text,
  add column if not exists people_count integer default 1,
  add column if not exists group_label text,
  add column if not exists recurrence_label text,
  add column if not exists recurring_rule_id text,
  add column if not exists status text default 'confirmed',
  add column if not exists created_at timestamptz default now();

update public.appointments
set salon_id = 'salone_1'
where salon_id is null or salon_id = '';

create unique index if not exists appointments_event_id_unique
on public.appointments (event_id)
where event_id is not null;

create index if not exists appointments_salon_date_idx
on public.appointments (salon_id, date);

create index if not exists appointments_salon_start_iso_idx
on public.appointments (salon_id, start_iso);

-- =====================================================
-- 6) BOOKINGS - COMPATIBILITÀ COLONNE VECCHIE E NUOVE
-- =====================================================
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  salon_id text,
  customer_name text,
  phone text,
  date text,
  time text,
  booking_date text,
  booking_time text,
  start_at timestamptz,
  end_at timestamptz,
  start_iso text,
  end_iso text,
  service_id text,
  service_name text,
  collaborator_id text,
  collaborator_name text,
  notes text,
  price numeric default 0,
  people_count integer not null default 1,
  group_label text,
  summary text,
  google_event_id text,
  status text not null default 'confirmed',
  created_at timestamptz not null default now()
);

alter table public.bookings
  add column if not exists salon_id text,
  add column if not exists customer_name text,
  add column if not exists phone text,
  add column if not exists date text,
  add column if not exists time text,
  add column if not exists booking_date text,
  add column if not exists booking_time text,
  add column if not exists start_at timestamptz,
  add column if not exists end_at timestamptz,
  add column if not exists start_iso text,
  add column if not exists end_iso text,
  add column if not exists service_id text,
  add column if not exists service_name text,
  add column if not exists collaborator_id text,
  add column if not exists collaborator_name text,
  add column if not exists notes text,
  add column if not exists price numeric default 0,
  add column if not exists people_count integer default 1,
  add column if not exists group_label text,
  add column if not exists summary text,
  add column if not exists google_event_id text,
  add column if not exists status text default 'confirmed',
  add column if not exists created_at timestamptz default now();

update public.bookings
set salon_id = 'salone_1'
where salon_id is null or salon_id = '';

create index if not exists bookings_salon_booking_date_idx
on public.bookings (salon_id, booking_date);

create index if not exists bookings_salon_start_at_idx
on public.bookings (salon_id, start_at);

create or replace function public.sync_booking_legacy_fields()
returns trigger
language plpgsql
as $$
declare
  dur integer;
  base_start timestamptz;
  base_end timestamptz;
begin
  if new.salon_id is null or new.salon_id = '' then
    new.salon_id := 'salone_1';
  end if;

  -- La durata reale viene già calcolata dal codice; questo trigger serve solo come fallback.
  dur := 30;

  if new.booking_date is null and new.date is not null then
    new.booking_date := new.date;
  end if;

  if new.date is null and new.booking_date is not null then
    new.date := new.booking_date;
  end if;

  if new.booking_time is null and new.time is not null then
    new.booking_time := new.time;
  end if;

  if new.time is null and new.booking_time is not null then
    new.time := new.booking_time;
  end if;

  if new.start_at is null and new.booking_date is not null and new.booking_time is not null then
    new.start_at := ((new.booking_date || ' ' || new.booking_time)::timestamp at time zone 'Europe/Rome');
  end if;

  if new.start_iso is null and new.start_at is not null then
    new.start_iso := to_char(new.start_at at time zone 'Europe/Rome', 'YYYY-MM-DD"T"HH24:MI:SS');
  end if;

  base_start := new.start_at;

  if new.end_at is null and base_start is not null then
    new.end_at := base_start + interval '30 minutes';
  end if;

  if new.end_iso is null and new.end_at is not null then
    new.end_iso := to_char(new.end_at at time zone 'Europe/Rome', 'YYYY-MM-DD"T"HH24:MI:SS');
  end if;

  if new.status is null or new.status = '' then
    new.status := 'confirmed';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_booking_legacy_fields on public.bookings;
create trigger trg_sync_booking_legacy_fields
before insert or update on public.bookings
for each row execute function public.sync_booking_legacy_fields();

-- =====================================================
-- 7) RICORRENZE
-- =====================================================
create table if not exists public.recurring_rules (
  id text primary key,
  salon_id text,
  customer_name text,
  phone text,
  service_id text,
  service_name text,
  collaborator_id text,
  collaborator_name text,
  frequency_type text,
  frequency_interval integer default 1,
  start_date text,
  start_time text,
  occurrences integer,
  recurrence_label text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.recurring_rules
  add column if not exists salon_id text,
  add column if not exists customer_name text,
  add column if not exists phone text,
  add column if not exists service_id text,
  add column if not exists service_name text,
  add column if not exists collaborator_id text,
  add column if not exists collaborator_name text,
  add column if not exists frequency_type text,
  add column if not exists frequency_interval integer default 1,
  add column if not exists start_date text,
  add column if not exists start_time text,
  add column if not exists occurrences integer,
  add column if not exists recurrence_label text,
  add column if not exists notes text,
  add column if not exists active boolean default true,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

update public.recurring_rules
set salon_id = 'salone_1'
where salon_id is null or salon_id = '';

create index if not exists recurring_rules_salon_id_idx
on public.recurring_rules (salon_id);

-- =====================================================
-- 8) CACHE SLOT MULTISALONE
-- =====================================================
create table if not exists public.daily_slot_cache (
  salon_id text not null,
  date text not null,
  service_id text not null,
  people_count integer not null default 1,
  preferred_collaborator_id text not null default '',
  ignore_min_advance boolean not null default false,
  slots jsonb not null default '[]'::jsonb,
  expires_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (salon_id, date, service_id, people_count, preferred_collaborator_id, ignore_min_advance)
);

alter table public.daily_slot_cache
  add column if not exists salon_id text,
  add column if not exists date text,
  add column if not exists service_id text,
  add column if not exists people_count integer default 1,
  add column if not exists preferred_collaborator_id text default '',
  add column if not exists ignore_min_advance boolean default false,
  add column if not exists slots jsonb default '[]'::jsonb,
  add column if not exists expires_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

commit;

-- =====================================================
-- COME CREARE ALTRI SALONI
-- 1) duplica il progetto Vercel oppure crea un nuovo ambiente
-- 2) imposta NEXT_PUBLIC_SALON_ID e SALON_ID, esempio: salone_2
-- 3) esegui solo gli INSERT di esempio sotto cambiando salone_2/nome
-- =====================================================
/*
insert into public.salons (id, name, slug, active)
values ('salone_2', 'Salone 2', 'salone-2', true)
on conflict (id) do nothing;

insert into public.business_settings (id, salon_id, slot_minutes, min_advance_min, closed_weekdays, holidays, morning_enabled, morning_start, morning_end, afternoon_enabled, afternoon_start, afternoon_end, brand_title, brand_subtitle, brand_description)
values ('salone_2_settings', 'salone_2', 15, 60, array[0,1]::integer[], array[]::text[], true, '09:00', '13:00', true, '15:30', '20:00', 'Salone 2', 'Prenota il tuo appuntamento in pochi secondi', '')
on conflict (id) do nothing;

insert into public.collaborators (id, salon_id, name, color, active, sort_order)
values ('salone_2_collaboratore_1', 'salone_2', 'Operatore', '#111827', true, 1)
on conflict (id) do nothing;

insert into public.services (id, salon_id, name, duration_min, price, active, sort_order)
values
  ('salone_2_taglio', 'salone_2', 'Taglio', 30, 15, true, 10),
  ('salone_2_barba', 'salone_2', 'Barba', 15, 10, true, 20)
on conflict (id) do nothing;
*/
