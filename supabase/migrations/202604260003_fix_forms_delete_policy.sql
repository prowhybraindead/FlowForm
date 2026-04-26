-- Ensure owners can delete their forms in all upgraded environments.
-- Some databases created before current schema may miss this policy.

drop policy if exists "owners can delete forms" on public.forms;
create policy "owners can delete forms"
  on public.forms for delete
  to authenticated
  using (creator_id = auth.uid());
