-- Fix delete failure:
-- forms DELETE trigger writes audit row with event_type = 'form_deleted',
-- but form_audit_logs.form_id had a FK to forms(id), causing 23503.
-- Drop that FK so deletion audit rows can be persisted.

alter table public.form_audit_logs
  drop constraint if exists form_audit_logs_form_id_fkey;
