-- =========================================================
-- grading.game · storage bucket · 002
-- Run AFTER 001_schema.sql.
-- Idempotent: safe to re-run.
-- =========================================================

-- Create the submissions bucket (public-read so submissions can be displayed
-- in the gallery via plain URL; the obscure UUID paths keep things effectively
-- private to room members in practice).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'submissions',
    'submissions',
    true,
    52428800,                                       -- 50 MB per file
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/tiff']
)
ON CONFLICT (id) DO UPDATE
    SET public = true,
        file_size_limit = 52428800,
        allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/tiff'];

-- =========================================================
-- POLICIES on storage.objects for the submissions bucket
-- Path convention: {room_id}/{player_id}/grade.{ext}
-- =========================================================

-- Public read (matches bucket.public = true)
DROP POLICY IF EXISTS "submissions_storage_read" ON storage.objects;
CREATE POLICY "submissions_storage_read" ON storage.objects
FOR SELECT
USING (bucket_id = 'submissions');

-- Upload: must be a player in that room, and must upload under your own player_id
DROP POLICY IF EXISTS "submissions_storage_insert" ON storage.objects;
CREATE POLICY "submissions_storage_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'submissions'
    AND EXISTS (
        SELECT 1 FROM public.players p
        WHERE p.id::text   = split_part(name, '/', 2)
          AND p.room_id::text = split_part(name, '/', 1)
          AND p.user_id   = auth.uid()
    )
);

-- Update / Replace your own grade
DROP POLICY IF EXISTS "submissions_storage_update" ON storage.objects;
CREATE POLICY "submissions_storage_update" ON storage.objects
FOR UPDATE TO authenticated
USING (
    bucket_id = 'submissions'
    AND EXISTS (
        SELECT 1 FROM public.players p
        WHERE p.id::text = split_part(name, '/', 2)
          AND p.user_id  = auth.uid()
    )
);

-- Delete your own grade
DROP POLICY IF EXISTS "submissions_storage_delete" ON storage.objects;
CREATE POLICY "submissions_storage_delete" ON storage.objects
FOR DELETE TO authenticated
USING (
    bucket_id = 'submissions'
    AND EXISTS (
        SELECT 1 FROM public.players p
        WHERE p.id::text = split_part(name, '/', 2)
          AND p.user_id  = auth.uid()
    )
);
