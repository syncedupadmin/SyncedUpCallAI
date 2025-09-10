-- Table already exists from 000_init.sql, just create the view
create or replace view call_value_flags as
select
  c.id as call_id,
  exists (
    select 1
    from policies_stub p
    where p.contact_id::text = c.contact_id::text
      and p.premium >= 300
      and p.status = 'active'
  ) as has_policy_300_plus
from calls c;