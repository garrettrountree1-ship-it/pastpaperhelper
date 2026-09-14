CREATE POLICY "students update own work"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'student-work' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'student-work' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Teachers update class materials"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'class-materials' AND is_class_teacher(((storage.foldername(name))[1])::uuid, auth.uid()))
WITH CHECK (bucket_id = 'class-materials' AND is_class_teacher(((storage.foldername(name))[1])::uuid, auth.uid()));