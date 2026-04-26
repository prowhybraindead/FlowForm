create extension if not exists pgcrypto;

create table if not exists public.forms (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) <= 200),
  description text,
  creator_id uuid not null references auth.users(id) on delete cascade,
  created_at bigint not null,
  updated_at bigint not null,
  questions jsonb not null default '[]'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  theme jsonb,
  versions jsonb,
  views integer not null default 0
);

create table if not exists public.responses (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.forms(id) on delete cascade,
  respondent_email text,
  submitted_at bigint not null,
  answers jsonb not null default '{}'::jsonb,
  time_to_complete integer,
  timezone text
);

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 120),
  avatar_url text check (
    avatar_url is null
    or (
      char_length(avatar_url) <= 1000
      and avatar_url ~* '^https?://'
      and avatar_url !~* '^data:'
    )
  ),
  updated_at timestamptz not null default now()
);

create table if not exists public.form_collaborators (
  form_id uuid not null references public.forms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (form_id, user_id)
);

create table if not exists public.form_audit_logs (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists forms_creator_updated_idx on public.forms (creator_id, updated_at desc);
create index if not exists responses_form_submitted_idx on public.responses (form_id, submitted_at desc);
create index if not exists responses_form_email_idx on public.responses (form_id, lower(respondent_email))
where respondent_email is not null;
create index if not exists form_collaborators_user_idx on public.form_collaborators (user_id, created_at desc);
create index if not exists form_audit_logs_form_idx on public.form_audit_logs (form_id, created_at desc);

alter table public.forms enable row level security;
alter table public.responses enable row level security;
alter table public.profiles enable row level security;
alter table public.form_collaborators enable row level security;
alter table public.form_audit_logs enable row level security;

drop policy if exists "owners can list own forms" on public.forms;
drop policy if exists "owners can create forms" on public.forms;
drop policy if exists "owners can update forms" on public.forms;
drop policy if exists "owners can delete forms" on public.forms;
drop policy if exists "public can read live public forms" on public.forms;
drop policy if exists "collaborators can read assigned forms" on public.forms;

create policy "owners can list own forms"
  on public.forms for select
  to authenticated
  using (creator_id = auth.uid());

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

create policy "public can read live public forms"
  on public.forms for select
  to anon, authenticated
  using (
    coalesce((settings->>'isPublic')::boolean, true) = true
    and coalesce((settings->>'publishImmediately')::boolean, true) = true
  );

create policy "owners can create forms"
  on public.forms for insert
  to authenticated
  with check (creator_id = auth.uid());

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

create policy "owners can delete forms"
  on public.forms for delete
  to authenticated
  using (creator_id = auth.uid());

drop policy if exists "owners can read form responses" on public.responses;
drop policy if exists "public can submit responses to live public forms" on public.responses;
drop policy if exists "collaborators can read form responses" on public.responses;
drop policy if exists "public can read profiles" on public.profiles;
drop policy if exists "users can create own profile" on public.profiles;
drop policy if exists "users can update own profile" on public.profiles;
drop policy if exists "owners can manage collaborators" on public.form_collaborators;
drop policy if exists "collaborators can read own role" on public.form_collaborators;
drop policy if exists "owners can read collaborators" on public.form_collaborators;
drop policy if exists "owners can insert collaborators" on public.form_collaborators;
drop policy if exists "owners can update collaborators" on public.form_collaborators;
drop policy if exists "owners can delete collaborators" on public.form_collaborators;
drop policy if exists "authorized users can read form audit logs" on public.form_audit_logs;

create policy "public can read profiles"
  on public.profiles for select
  to anon, authenticated
  using (true);

create policy "users can create own profile"
  on public.profiles for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "users can update own profile"
  on public.profiles for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "owners can read form responses"
  on public.responses for select
  to authenticated
  using (
    exists (
      select 1 from public.forms
      where forms.id = responses.form_id
      and forms.creator_id = auth.uid()
    )
  );

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

create policy "public can submit responses to live public forms"
  on public.responses for insert
  to anon, authenticated
  with check (
    jsonb_typeof(answers) = 'object'
    and exists (
      select 1 from public.forms
      where forms.id = responses.form_id
      and coalesce((forms.settings->>'isPublic')::boolean, true) = true
      and coalesce((forms.settings->>'publishImmediately')::boolean, true) = true
      and (
        forms.settings->>'expirationDate' is null
        or now() <= (forms.settings->>'expirationDate')::timestamptz
      )
    )
  );

create or replace function public.enforce_response_email_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_form_settings jsonb;
  should_collect_email boolean;
  should_limit_one_response boolean;
begin
  select settings
  into target_form_settings
  from public.forms
  where id = new.form_id;

  should_collect_email := coalesce((target_form_settings->>'collectEmails')::boolean, false);
  should_limit_one_response := coalesce((target_form_settings->>'limitOneResponse')::boolean, false);

  if should_collect_email or should_limit_one_response then
    if new.respondent_email is null or btrim(new.respondent_email) = '' then
      raise exception 'Respondent email is required for this form';
    end if;

    new.respondent_email := lower(btrim(new.respondent_email));

    if new.respondent_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then
      raise exception 'Respondent email is invalid';
    end if;
  end if;

  if should_limit_one_response then
    perform pg_advisory_xact_lock(
      hashtextextended(new.form_id::text || ':' || new.respondent_email, 0)
    );

    if exists (
      select 1
      from public.responses
      where form_id = new.form_id
        and lower(respondent_email) = new.respondent_email
    ) then
      raise exception 'This email has already submitted a response for this form';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_response_email_rules_trigger on public.responses;
create trigger enforce_response_email_rules_trigger
  before insert on public.responses
  for each row
  execute function public.enforce_response_email_rules();

create or replace function public.increment_form_views(target_form_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.forms
  set views = views + 1
  where id = target_form_id
    and coalesce((settings->>'isPublic')::boolean, true) = true;
$$;

grant execute on function public.increment_form_views(uuid) to anon, authenticated;

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

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'form-assets',
  'form-assets',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public can read form assets" on storage.objects;
drop policy if exists "authenticated users can upload form assets" on storage.objects;
drop policy if exists "owners can update form assets" on storage.objects;
drop policy if exists "owners can delete form assets" on storage.objects;

create policy "public can read form assets"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'form-assets');

create policy "authenticated users can upload form assets"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'form-assets'
    and owner = auth.uid()
  );

create policy "owners can update form assets"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'form-assets'
    and owner = auth.uid()
  )
  with check (
    bucket_id = 'form-assets'
    and owner = auth.uid()
  );

create policy "owners can delete form assets"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'form-assets'
    and owner = auth.uid()
  );
