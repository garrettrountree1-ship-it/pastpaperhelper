alter table public.unit_sections
  add column if not exists document_work jsonb not null default '{}'::jsonb;

comment on column public.unit_sections.document_work is
  'Teacher annotations, pasted pictures, text boxes and editable slide text, keyed by material id.';
