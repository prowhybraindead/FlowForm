-- Phase 4 migration: collaboration roles, audit timeline, and strict route validation.
-- Safe to re-run.

create extension if not exists pgcrypto;

create table if not exists public.form_collaborators (
  form_id uuid not null references public.forms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (form_id, user_id)
);

create table if not exists public.form_audit_logs (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.forms(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists form_collaborators_user_idx on public.form_collaborators (user_id, created_at desc);
create index if not exists form_audit_logs_form_idx on public.form_audit_logs (form_id, created_at desc);

alter table public.form_collaborators enable row level security;
alter table public.form_audit_logs enable row level security;

drop policy if exists "collaborators can read assigned forms" on public.forms;
create policy "collaborators can read assigned forms"
  on public.forms for select
  to authenticated
  using (
    exists (
      select 1
      from public.form_collaborators
      where form_collaborators.form_id = forms.id
        and form_collaborators.user_id = auth.uid()
    )
  );

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
  with check (
    creator_id = (
      select existing.creator_id
      from public.forms as existing
      where existing.id = forms.id
    )
  );

drop policy if exists "collaborators can read form responses" on public.responses;
create policy "collaborators can read form responses"
  on public.responses for select
  to authenticated
  using (
    exists (
      select 1
      from public.form_collaborators
      where form_collaborators.form_id = responses.form_id
        and form_collaborators.user_id = auth.uid()
    )
  );

drop policy if exists "owners can manage collaborators" on public.form_collaborators;
create policy "owners can manage collaborators"
  on public.form_collaborators for all
  to authenticated
  using (
    exists (
      select 1
      from public.forms
      where forms.id = form_collaborators.form_id
        and forms.creator_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.forms
      where forms.id = form_collaborators.form_id
        and forms.creator_id = auth.uid()
    )
  );

drop policy if exists "collaborators can read own role" on public.form_collaborators;
create policy "collaborators can read own role"
  on public.form_collaborators for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "authorized users can read form audit logs" on public.form_audit_logs;
create policy "authorized users can read form audit logs"
  on public.form_audit_logs for select
  to authenticated
  using (
    exists (
      select 1
      from public.forms
      where forms.id = form_audit_logs.form_id
        and forms.creator_id = auth.uid()
    )
    or exists (
      select 1
      from public.form_collaborators
      where form_collaborators.form_id = form_audit_logs.form_id
        and form_collaborators.user_id = auth.uid()
    )
  );

create or replace function public.resolve_user_id_by_email_for_form_owner(target_form_id uuid, target_email text)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  resolved_user_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.forms
    where id = target_form_id
      and creator_id = auth.uid()
  ) then
    raise exception 'Only the form owner can resolve collaborator emails';
  end if;

  select users.id
  into resolved_user_id
  from auth.users as users
  where lower(users.email) = lower(target_email)
  limit 1;

  return resolved_user_id;
end;
$$;

grant execute on function public.resolve_user_id_by_email_for_form_owner(uuid, text) to authenticated;

create or replace function public.validate_form_routes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  target jsonb;
  target_text text;
  target_index integer;
  source_index integer := 0;
  next_section_index integer := 1;
  section_positions jsonb := '{}'::jsonb;
  enforce_forward_routes boolean := coalesce((new.settings->>'enforceForwardRoutes')::boolean, false);
begin
  if jsonb_typeof(new.questions) <> 'array' then
    raise exception 'questions must be a JSON array';
  end if;

  for item in
    select value
    from jsonb_array_elements(new.questions)
  loop
    if coalesce(item->>'type', '') = 'section' then
      if coalesce(item->>'id', '') = '' then
        raise exception 'Section id is required';
      end if;

      section_positions := section_positions || jsonb_build_object(item->>'id', next_section_index);
      source_index := next_section_index;
      next_section_index := next_section_index + 1;
    end if;
  end loop;

  source_index := 0;
  for item in
    select value
    from jsonb_array_elements(new.questions)
  loop
    if coalesce(item->>'type', '') = 'section' then
      source_index := coalesce((section_positions->>(item->>'id'))::integer, source_index);
      continue;
    end if;

    target_text := nullif(item->>'branchToSectionId', '');
    if target_text is not null and target_text <> '__submit__' then
      if not (section_positions ? target_text) then
        raise exception 'Invalid branch route target % on question %', target_text, coalesce(item->>'id', 'unknown');
      end if;

      if enforce_forward_routes then
        target_index := (section_positions->>target_text)::integer;
        if target_index <= source_index then
          raise exception 'Backward branch route % is not allowed on question %', target_text, coalesce(item->>'id', 'unknown');
        end if;
      end if;
    end if;

    if jsonb_typeof(item->'optionBranchToSectionIds') = 'array' then
      for target in
        select value
        from jsonb_array_elements(item->'optionBranchToSectionIds')
      loop
        target_text := nullif(target #>> '{}', '');
        if target_text is null or target_text = '__submit__' then
          continue;
        end if;

        if not (section_positions ? target_text) then
          raise exception 'Invalid option branch route target % on question %', target_text, coalesce(item->>'id', 'unknown');
        end if;

        if enforce_forward_routes then
          target_index := (section_positions->>target_text)::integer;
          if target_index <= source_index then
            raise exception 'Backward option route % is not allowed on question %', target_text, coalesce(item->>'id', 'unknown');
          end if;
        end if;
      end loop;
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists validate_form_routes_trigger on public.forms;
create trigger validate_form_routes_trigger
  before insert or update on public.forms
  for each row
  execute function public.validate_form_routes();

create or replace function public.write_form_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'forms' then
    if tg_op = 'INSERT' then
      insert into public.form_audit_logs(form_id, actor_user_id, event_type, payload)
      values (
        new.id,
        auth.uid(),
        'form_created',
        jsonb_build_object('title', new.title)
      );
      return new;
    elsif tg_op = 'UPDATE' then
      insert into public.form_audit_logs(form_id, actor_user_id, event_type, payload)
      values (
        new.id,
        auth.uid(),
        'form_updated',
        jsonb_build_object(
          'previous_updated_at', old.updated_at,
          'next_updated_at', new.updated_at
        )
      );
      return new;
    elsif tg_op = 'DELETE' then
      insert into public.form_audit_logs(form_id, actor_user_id, event_type, payload)
      values (
        old.id,
        auth.uid(),
        'form_deleted',
        jsonb_build_object('title', old.title)
      );
      return old;
    end if;
  end if;

  if tg_table_name = 'form_collaborators' then
    if tg_op = 'INSERT' then
      insert into public.form_audit_logs(form_id, actor_user_id, event_type, payload)
      values (
        new.form_id,
        auth.uid(),
        'collaborator_added',
        jsonb_build_object('user_id', new.user_id, 'role', new.role)
      );
      return new;
    elsif tg_op = 'UPDATE' then
      insert into public.form_audit_logs(form_id, actor_user_id, event_type, payload)
      values (
        new.form_id,
        auth.uid(),
        'collaborator_role_changed',
        jsonb_build_object('user_id', new.user_id, 'from_role', old.role, 'to_role', new.role)
      );
      return new;
    elsif tg_op = 'DELETE' then
      insert into public.form_audit_logs(form_id, actor_user_id, event_type, payload)
      values (
        old.form_id,
        auth.uid(),
        'collaborator_removed',
        jsonb_build_object('user_id', old.user_id, 'role', old.role)
      );
      return old;
    end if;
  end if;

  return null;
end;
$$;

drop trigger if exists forms_audit_log_trigger on public.forms;
create trigger forms_audit_log_trigger
  after insert or update or delete on public.forms
  for each row
  execute function public.write_form_audit_log();

drop trigger if exists form_collaborators_audit_log_trigger on public.form_collaborators;
create trigger form_collaborators_audit_log_trigger
  after insert or update or delete on public.form_collaborators
  for each row
  execute function public.write_form_audit_log();
