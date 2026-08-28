alter table public.class_units
  add column if not exists planned_start date,
  add column if not exists planned_end date,
  add column if not exists planned_classes integer;

create table if not exists public.unit_sections (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.class_units(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  title text not null,
  position integer not null default 0,
  notes_blocks jsonb not null default '[]'::jsonb,
  notes_text text not null default '',
  ai_summary text,
  ai_summary_updated_at timestamptz,
  material_id uuid references public.unit_materials(id) on delete set null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.unit_sections to authenticated;
grant all on public.unit_sections to service_role;
alter table public.unit_sections enable row level security;

create policy "Class teachers manage unit sections"
  on public.unit_sections for all to authenticated
  using (public.is_class_teacher(class_id, auth.uid()))
  with check (public.is_class_teacher(class_id, auth.uid()));

create policy "Class members read unit sections"
  on public.unit_sections for select to authenticated
  using (public.is_class_member(class_id, auth.uid()));

create index if not exists unit_sections_unit_idx on public.unit_sections(unit_id, position);