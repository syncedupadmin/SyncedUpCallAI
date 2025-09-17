-- Phase B: Database Audit Queries

-- 1. List candidate functions
select n.nspname, p.proname,
       pg_get_function_identity_arguments(p.oid) args
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public' and p.proname in ('create_agent_user','is_admin','is_super_admin', 'get_user_level', 'get_users_by_level_v2', 'set_admin_level')
order by 1,2;

-- 2. Check table schemas for agents/user_profiles
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema='public' and table_name in ('agents','user_profiles', 'profiles', 'admin_users')
order by table_name, ordinal_position;

-- 3. Check indexes
select * from pg_indexes where schemaname='public' and tablename in ('agents','admin_users', 'profiles');

-- 4. Check constraints
select constraint_name, constraint_type from information_schema.table_constraints
where table_schema='public' and table_name in ('agents','admin_users', 'profiles');

-- 5. Verify admin check functions
select proname, pg_get_functiondef(p.oid)
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and proname in ('is_admin','is_super_admin');