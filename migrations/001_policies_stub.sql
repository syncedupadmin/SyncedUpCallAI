create table if not exists policies_stub (
  id bigserial primary key,
  contact_id text,
  monthly_premium integer not null,
  status text default 'active',
  created_at timestamptz default now()
);

create or replace view call_value_flags as
select
  c.id as call_id,
  exists (
    select 1
    from policies_stub p
    where p.contact_id = c.contact_id
      and p.monthly_premium >= 300
      and p.status = 'active'
  ) as has_policy_300_plus
from calls c;