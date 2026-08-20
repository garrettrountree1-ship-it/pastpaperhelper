ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS gradebook_detail boolean NOT NULL DEFAULT true;
ALTER TABLE public.class_student_settings ADD COLUMN IF NOT EXISTS gradebook_detail boolean;