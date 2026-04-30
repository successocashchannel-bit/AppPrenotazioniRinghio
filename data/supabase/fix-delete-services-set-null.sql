begin;

alter table public.bookings
alter column service_id drop not null;

alter table public.bookings
drop constraint if exists bookings_service_id_fkey;

alter table public.bookings
add constraint bookings_service_id_fkey
foreign key (service_id)
references public.services(id)
on update cascade
on delete set null;

commit;
