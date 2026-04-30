alter table public.business_settings
  add column if not exists logo_url text not null default '',
  add column if not exists icon_192 text not null default '',
  add column if not exists icon_512 text not null default '',
  add column if not exists brand_title text not null default 'Ringhio BarberShop',
  add column if not exists brand_subtitle text not null default 'Prenota il tuo appuntamento in pochi secondi';
