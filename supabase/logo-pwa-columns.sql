alter table public.business_settings
add column if not exists logo_url text,
add column if not exists icon_192 text,
add column if not exists icon_512 text;
