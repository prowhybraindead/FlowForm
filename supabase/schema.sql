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

create index if not exists forms_creator_updated_idx on public.forms (creator_id, updated_at desc);
create index if not exists responses_form_submitted_idx on public.responses (form_id, submitted_at desc);

alter table public.forms enable row level security;
alter table public.responses enable row level security;

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
