create extension if not exists pgcrypto;

create table if not exists public.business_settings (
  id text primary key,
  slot_interval_min integer not null default 15 check (slot_interval_min in (15, 30)),
  min_advance_min integer not null default 60 check (min_advance_min >= 0),
  closed_weekdays jsonb not null default '[1,7]'::jsonb,
  holidays jsonb not null default '[]'::jsonb,
  morning_enabled boolean not null default true,
  morning_open text not null default '09:00',
  morning_close text not null default '13:00',
  afternoon_enabled boolean not null default true,
  afternoon_open text not null default '15:30',
  afternoon_close text not null default '20:00',
  logo_url text not null default '',
  icon_192 text not null default '',
  icon_512 text not null default '',
  brand_title text not null default 'Prenotazioni Online',
  brand_subtitle text not null default 'Prenota il tuo appuntamento in pochi secondi',
  updated_at timestamptz not null default now()
);

create table if not exists public.services (
  id text primary key,
  name text not null,
  duration_min integer not null check (duration_min > 0),
  price numeric(10,2) not null default 0,
  active boolean not null default true,
  sort_order integer,
  updated_at timestamptz not null default now()
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  phone text not null,
  booking_date date not null,
  booking_time text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  service_id text not null references public.services(id) on update cascade,
  service_name text not null,
  price numeric(10,2) not null default 0,
  notes text,
  status text not null default 'confirmed' check (status in ('confirmed', 'pending', 'cancelled')),
  summary text,
  google_event_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bookings_time_order_check check (end_at > start_at)
);

create index if not exists bookings_date_idx on public.bookings (booking_date);
create index if not exists bookings_start_idx on public.bookings (start_at);
create index if not exists bookings_status_idx on public.bookings (status);
create index if not exists services_active_idx on public.services (active);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_business_settings_updated_at on public.business_settings;
create trigger trg_business_settings_updated_at
before update on public.business_settings
for each row
execute function public.set_updated_at();

drop trigger if exists trg_services_updated_at on public.services;
create trigger trg_services_updated_at
before update on public.services
for each row
execute function public.set_updated_at();

drop trigger if exists trg_bookings_updated_at on public.bookings;
create trigger trg_bookings_updated_at
before update on public.bookings
for each row
execute function public.set_updated_at();

insert into public.business_settings (
  id,
  slot_interval_min,
  min_advance_min,
  closed_weekdays,
  holidays,
  morning_enabled,
  morning_open,
  morning_close,
  afternoon_enabled,
  afternoon_open,
  afternoon_close,
  logo_url,
  icon_192,
  icon_512,
  brand_title,
  brand_subtitle
)
values (
  'default',
  15,
  60,
  '[1,7]'::jsonb,
  '[]'::jsonb,
  true,
  '09:00',
  '13:00',
  true,
  '15:30',
  '20:00',
  '',
  '',
  '',
  'Prenotazioni Online',
  'Prenota il tuo appuntamento in pochi secondi'
)
on conflict (id) do update set
  slot_interval_min = excluded.slot_interval_min,
  min_advance_min = excluded.min_advance_min,
  closed_weekdays = excluded.closed_weekdays,
  holidays = excluded.holidays,
  morning_enabled = excluded.morning_enabled,
  morning_open = excluded.morning_open,
  morning_close = excluded.morning_close,
  afternoon_enabled = excluded.afternoon_enabled,
  afternoon_open = excluded.afternoon_open,
  afternoon_close = excluded.afternoon_close,
  logo_url = excluded.logo_url,
  icon_192 = excluded.icon_192,
  icon_512 = excluded.icon_512,
  brand_title = excluded.brand_title,
  brand_subtitle = excluded.brand_subtitle,
  updated_at = now();

insert into public.services (id, name, duration_min, price, active, sort_order)
values
  ('servizio_1', 'Servizio 1', 30, 20, true, 1),
  ('servizio_2', 'Servizio 2', 45, 30, true, 2),
  ('servizio_3', 'Servizio 3', 60, 40, true, 3)
on conflict (id) do update set
  name = excluded.name,
  duration_min = excluded.duration_min,
  price = excluded.price,
  active = excluded.active,
  sort_order = excluded.sort_order,
  updated_at = now();


alter table public.bookings
  add column if not exists recurring_series_id text,
  add column if not exists recurrence_label text;

create index if not exists idx_bookings_recurring_series_id
  on public.bookings (recurring_series_id);
