CREATE OR REPLACE FUNCTION public.schema_check()
RETURNS TABLE(
  tbl text,
  col text,
  dtype text,
  nullable text,
  dflt text
) LANGUAGE sql SECURITY DEFINER AS $$
  SELECT table_name::text, column_name::text, data_type::text, is_nullable::text, COALESCE(column_default, '')::text
  FROM information_schema.columns
  WHERE table_schema = 'public'
  ORDER BY table_name, ordinal_position;
$$;

CREATE OR REPLACE FUNCTION public.index_check()
RETURNS TABLE(
  idx_name text,
  tbl_name text,
  idx_def text
) LANGUAGE sql SECURITY DEFINER AS $$
  SELECT indexname::text, tablename::text, indexdef::text
  FROM pg_indexes
  WHERE schemaname = 'public'
  ORDER BY tablename, indexname;
$$;

CREATE OR REPLACE FUNCTION public.constraint_check()
RETURNS TABLE(
  tbl text,
  cname text,
  ctype text,
  cdef text
) LANGUAGE sql SECURITY DEFINER AS $$
  SELECT tc.table_name::text, tc.constraint_name::text, tc.constraint_type::text, 
         COALESCE(cc.check_clause, '')::text
  FROM information_schema.table_constraints tc
  LEFT JOIN information_schema.check_constraints cc ON tc.constraint_name = cc.constraint_name
  WHERE tc.table_schema = 'public'
  ORDER BY tc.table_name, tc.constraint_type, tc.constraint_name;
$$;

CREATE OR REPLACE FUNCTION public.policy_check()
RETURNS TABLE(
  tbl text,
  pol_name text,
  cmd text,
  pol_qual text,
  pol_check text
) LANGUAGE sql SECURITY DEFINER AS $$
  SELECT tablename::text, policyname::text, cmd::text, 
         COALESCE(qual, '')::text, COALESCE(with_check, '')::text
  FROM pg_policies
  WHERE schemaname = 'public'
  ORDER BY tablename, policyname;
$$;

CREATE OR REPLACE FUNCTION public.trigger_check()
RETURNS TABLE(
  tbl text,
  trg_name text,
  timing text,
  event text,
  fn_name text
) LANGUAGE sql SECURITY DEFINER AS $$
  SELECT event_object_table::text, trigger_name::text, 
         action_timing::text, event_manipulation::text,
         action_statement::text
  FROM information_schema.triggers
  WHERE trigger_schema = 'public'
  ORDER BY event_object_table, trigger_name;
$$;
