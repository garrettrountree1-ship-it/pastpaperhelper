ALTER TABLE public.answers ADD COLUMN IF NOT EXISTS image_paths text[] NOT NULL DEFAULT '{}';

CREATE POLICY "students upload own work" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'student-work' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "students read own work" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'student-work' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "students delete own work" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'student-work' AND (storage.foldername(name))[1] = auth.uid()::text);