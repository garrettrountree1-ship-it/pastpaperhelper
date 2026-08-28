ALTER TABLE public.unit_sections
  ADD COLUMN IF NOT EXISTS planned_start date,
  ADD COLUMN IF NOT EXISTS planned_end date,
  ADD COLUMN IF NOT EXISTS planned_classes integer;