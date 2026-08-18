create table public.class_units (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  title text not null,
  description text,
  position integer not null default 0,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.class_units to authenticated;
grant all on public.class_units to service_role;
alter table public.class_units enable row level security;

create policy "Teachers manage units in their classes" on public.class_units
  for all to authenticated
  using (public.is_class_teacher(class_id, auth.uid()))
  with check (public.is_class_teacher(class_id, auth.uid()));

create policy "Students view units in their classes" on public.class_units
  for select to authenticated
  using (public.is_class_member(class_id, auth.uid()));

create index class_units_class_id_idx on public.class_units(class_id);

create table public.unit_materials (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.class_units(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  title text not null,
  kind text not null default 'document',
  storage_path text,
  external_url text,
  file_name text,
  file_size bigint,
  content_type text,
  position integer not null default 0,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.unit_materials to authenticated;
grant all on public.unit_materials to service_role;
alter table public.unit_materials enable row level security;

create policy "Teachers manage materials in their classes" on public.unit_materials
  for all to authenticated
  using (public.is_class_teacher(class_id, auth.uid()))
  with check (public.is_class_teacher(class_id, auth.uid()));

create policy "Students view materials in their classes" on public.unit_materials
  for select to authenticated
  using (public.is_class_member(class_id, auth.uid()));

create index unit_materials_unit_id_idx on public.unit_materials(unit_id);

create policy "Teachers upload class materials" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'class-materials'
    and public.is_class_teacher(((storage.foldername(name))[1])::uuid, auth.uid())
  );

create policy "Teachers delete class materials" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'class-materials'
    and public.is_class_teacher(((storage.foldername(name))[1])::uuid, auth.uid())
  );

create policy "Class members read class materials" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'class-materials'
    and (
      public.is_class_teacher(((storage.foldername(name))[1])::uuid, auth.uid())
      or public.is_class_member(((storage.foldername(name))[1])::uuid, auth.uid())
    )
  );