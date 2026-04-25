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

create index if not exists forms_creator_updated_idx on public.forms (creator_id, updated_at desc);
create index if not exists responses_form_submitted_idx on public.responses (form_id, submitted_at desc);
create index if not exists responses_form_email_idx on public.responses (form_id, lower(respondent_email))
where respondent_email is not null;

alter table public.forms enable row level security;
alter table public.responses enable row level security;
alter table public.profiles enable row level security;

drop policy if exists "owners can list own forms" on public.forms;
drop policy if exists "owners can create forms" on public.forms;
drop policy if exists "owners can update forms" on public.forms;
drop policy if exists "owners can delete forms" on public.forms;
drop policy if exists "public can read live public forms" on public.forms;

create policy "owners can list own forms"
  on public.forms for select
  to authenticated
  using (creator_id = auth.uid());

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
  using (creator_id = auth.uid())
  with check (creator_id = auth.uid());

create policy "owners can delete forms"
  on public.forms for delete
  to authenticated
  using (creator_id = auth.uid());

drop policy if exists "owners can read form responses" on public.responses;
drop policy if exists "public can submit responses to live public forms" on public.responses;
drop policy if exists "public can read profiles" on public.profiles;
drop policy if exists "users can create own profile" on public.profiles;
drop policy if exists "users can update own profile" on public.profiles;

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
