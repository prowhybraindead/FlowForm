-- Hotfix for production:
-- Remove recursive self-reference in forms UPDATE RLS policy (42P17),
-- and enforce immutable creator_id via trigger.

drop policy if exists "owners can update forms" on public.forms;
create policy "owners can update forms"
  on public.forms for update
  to authenticated
  using (
    creator_id = auth.uid()
    or exists (
      select 1
      from public.form_collaborators
      where form_collaborators.form_id = forms.id
        and form_collaborators.user_id = auth.uid()
        and form_collaborators.role = 'editor'
    )
  )
  with check (true);

create or replace function public.prevent_form_creator_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.creator_id is distinct from old.creator_id then
    raise exception 'Changing form creator is not allowed';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_form_creator_change_trigger on public.forms;
create trigger prevent_form_creator_change_trigger
  before update on public.forms
  for each row
  execute function public.prevent_form_creator_change();

-- Remove remaining recursion path:
-- forms(select) -> form_collaborators(select policy) -> forms(...)
create or replace function public.is_form_owner(target_form_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.forms
    where id = target_form_id
      and creator_id = auth.uid()
  );
$$;

grant execute on function public.is_form_owner(uuid) to authenticated;

drop policy if exists "owners can manage collaborators" on public.form_collaborators;
drop policy if exists "collaborators can read own role" on public.form_collaborators;
drop policy if exists "owners can read collaborators" on public.form_collaborators;
drop policy if exists "owners can insert collaborators" on public.form_collaborators;
drop policy if exists "owners can update collaborators" on public.form_collaborators;
drop policy if exists "owners can delete collaborators" on public.form_collaborators;

create policy "owners can read collaborators"
  on public.form_collaborators for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_form_owner(form_id)
  );

create policy "owners can insert collaborators"
  on public.form_collaborators for insert
  to authenticated
  with check (public.is_form_owner(form_id));

create policy "owners can update collaborators"
  on public.form_collaborators for update
  to authenticated
  using (public.is_form_owner(form_id))
  with check (public.is_form_owner(form_id));

create policy "owners can delete collaborators"
  on public.form_collaborators for delete
  to authenticated
  using (public.is_form_owner(form_id));
