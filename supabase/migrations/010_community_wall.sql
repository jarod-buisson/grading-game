-- =========================================================
-- grading-game · community wall · 010
--
-- Context
-- -------
-- The solo result screen gains a "community wall": after submitting
-- your grade you can publish it and see how everyone else edited the
-- SAME photo. Design decisions (validated 2026-06):
--
--   * Publishing requires a REAL account (Google / Discord / email).
--     The app signs everyone in anonymously on load, so the usual
--     `TO authenticated` is NOT enough — policies must also check
--     the JWT's `is_anonymous` claim.
--   * One submission per (challenge, user). Re-submitting replaces.
--   * Wall images are gated server-side: the RPC only returns the
--     items if the caller has published on that challenge. Everyone
--     can read the COUNT (for the "12 edits await you" teaser).
--   * Hidden flag + reports table for moderation (owner moderates
--     from the Supabase dashboard).
--
-- Storage
-- -------
-- New public-read bucket `wall`. Path convention:
--     {user_id}/{challenge_id}.jpg
-- so the standard "first path segment = your uid" policy applies.
--
-- Idempotent · safe to re-run.
-- =========================================================


-- ============================================================
-- 0) helper: is the caller a "real" (non-anonymous) user?
-- ============================================================
-- Supabase anonymous sign-ins carry `"is_anonymous": true` in the
-- JWT. Centralise the check so policies stay readable.

CREATE OR REPLACE FUNCTION public.is_real_user()
RETURNS BOOLEAN
LANGUAGE sql STABLE
AS $$
    SELECT auth.uid() IS NOT NULL
       AND COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false;
$$;


-- ============================================================
-- 1) wall_submissions table
-- ============================================================

CREATE TABLE IF NOT EXISTS wall_submissions (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    challenge_id TEXT        NOT NULL,
    user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    image_path   TEXT        NOT NULL,
    hidden       BOOLEAN     NOT NULL DEFAULT false,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (challenge_id, user_id)
);

CREATE INDEX IF NOT EXISTS wall_submissions_challenge_idx
    ON wall_submissions (challenge_id) WHERE NOT hidden;

ALTER TABLE wall_submissions ENABLE ROW LEVEL SECURITY;

-- updated_at maintenance
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS wall_submissions_touch ON wall_submissions;
CREATE TRIGGER wall_submissions_touch
    BEFORE UPDATE ON wall_submissions
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- SELECT: you can always read your OWN row (drives the "already
-- published?" check). The public wall goes through the RPC below,
-- which enforces the publish-to-view gate — so no broad SELECT here.
DROP POLICY IF EXISTS "wall: read own" ON wall_submissions;
CREATE POLICY "wall: read own"
ON wall_submissions FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- INSERT: real accounts only, and only as yourself.
DROP POLICY IF EXISTS "wall: insert own (real users)" ON wall_submissions;
CREATE POLICY "wall: insert own (real users)"
ON wall_submissions FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid() AND public.is_real_user());

-- UPDATE (re-submit): same conditions. A hidden row stays editable by
-- its owner but stays hidden (only the dashboard clears the flag).
DROP POLICY IF EXISTS "wall: update own (real users)" ON wall_submissions;
CREATE POLICY "wall: update own (real users)"
ON wall_submissions FOR UPDATE
TO authenticated
USING  (user_id = auth.uid())
WITH CHECK (user_id = auth.uid() AND public.is_real_user() AND hidden = false);

-- DELETE: pull your own grade off the wall.
DROP POLICY IF EXISTS "wall: delete own" ON wall_submissions;
CREATE POLICY "wall: delete own"
ON wall_submissions FOR DELETE
TO authenticated
USING (user_id = auth.uid());


-- ============================================================
-- 2) wall_reports — lightweight moderation signal
-- ============================================================
-- Anyone signed-in (anonymous included — it's just a signal) can
-- flag a submission once. Nobody reads reports over PostgREST; the
-- owner reviews them in the dashboard and flips `hidden`.

CREATE TABLE IF NOT EXISTS wall_reports (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID        NOT NULL REFERENCES wall_submissions(id) ON DELETE CASCADE,
    reporter_id   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (submission_id, reporter_id)
);

ALTER TABLE wall_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reports: insert own" ON wall_reports;
CREATE POLICY "reports: insert own"
ON wall_reports FOR INSERT
TO authenticated
WITH CHECK (reporter_id = auth.uid());
-- (no SELECT policy on purpose — dashboard only)


-- ============================================================
-- 3) get_wall(challenge_id) — the gated wall feed
-- ============================================================
-- Returns JSONB:
--   {
--     "count":     <total visible submissions>,
--     "can_view":  <caller has published on this challenge>,
--     "items":     [ { nickname, image_path, created_at, is_you } ]  -- [] when !can_view
--   }
--
-- SECURITY DEFINER: joins `profiles` for nicknames without reopening
-- the locked-down profiles SELECT (cf. migration 009), and reads all
-- wall rows regardless of the self-only SELECT policy above.

CREATE OR REPLACE FUNCTION public.get_wall(p_challenge_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_can_view BOOLEAN;
    v_count    INTEGER;
    v_items    JSONB;
BEGIN
    SELECT COUNT(*)::int INTO v_count
    FROM wall_submissions
    WHERE challenge_id = p_challenge_id AND NOT hidden;

    -- Publish-to-view gate: you see the wall once you're on it.
    SELECT EXISTS (
        SELECT 1 FROM wall_submissions
        WHERE challenge_id = p_challenge_id
          AND user_id = auth.uid()
          AND NOT hidden
    ) INTO v_can_view;

    IF v_can_view THEN
        SELECT COALESCE(jsonb_agg(item ORDER BY created_at DESC), '[]'::jsonb)
        INTO v_items
        FROM (
            SELECT jsonb_build_object(
                       'id',         w.id,
                       'nickname',   COALESCE(p.nickname, 'player'),
                       'image_path', w.image_path,
                       'created_at', w.created_at,
                       'updated_at', w.updated_at,
                       'is_you',     (w.user_id = auth.uid())
                   ) AS item,
                   w.created_at
            FROM wall_submissions w
            LEFT JOIN profiles p ON p.id = w.user_id
            WHERE w.challenge_id = p_challenge_id AND NOT w.hidden
            LIMIT 200
        ) sub;
    ELSE
        v_items := '[]'::jsonb;
    END IF;

    RETURN jsonb_build_object(
        'count',    v_count,
        'can_view', v_can_view,
        'items',    v_items
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_wall(TEXT) TO anon, authenticated;


-- ============================================================
-- 4) storage bucket `wall`
-- ============================================================
-- Public read (images are displayed by plain URL once you can see the
-- wall — the privacy gate lives on the FEED, not the files; paths are
-- unguessable enough in practice and the content is, by definition,
-- something the user chose to publish).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'wall',
    'wall',
    true,
    8388608,                                        -- 8 MB per file
    ARRAY['image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
    SET public = true,
        file_size_limit = 8388608,
        allowed_mime_types = ARRAY['image/jpeg','image/webp'];

-- Path convention: {user_id}/{challenge_id}.jpg
DROP POLICY IF EXISTS "wall_storage_read" ON storage.objects;
CREATE POLICY "wall_storage_read" ON storage.objects
FOR SELECT
USING (bucket_id = 'wall');

DROP POLICY IF EXISTS "wall_storage_insert" ON storage.objects;
CREATE POLICY "wall_storage_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'wall'
    AND split_part(name, '/', 1) = auth.uid()::text
    AND public.is_real_user()
);

DROP POLICY IF EXISTS "wall_storage_update" ON storage.objects;
CREATE POLICY "wall_storage_update" ON storage.objects
FOR UPDATE TO authenticated
USING (
    bucket_id = 'wall'
    AND split_part(name, '/', 1) = auth.uid()::text
)
WITH CHECK (
    bucket_id = 'wall'
    AND split_part(name, '/', 1) = auth.uid()::text
    AND public.is_real_user()
);

DROP POLICY IF EXISTS "wall_storage_delete" ON storage.objects;
CREATE POLICY "wall_storage_delete" ON storage.objects
FOR DELETE TO authenticated
USING (
    bucket_id = 'wall'
    AND split_part(name, '/', 1) = auth.uid()::text
);


-- ============================================================
-- 5) report_submission(submission_id) helper RPC
-- ============================================================
-- Thin wrapper so the client doesn't need INSERT on wall_reports
-- shape knowledge; swallows the duplicate-report case gracefully.

CREATE OR REPLACE FUNCTION public.report_submission(p_submission_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN false;
    END IF;
    INSERT INTO wall_reports (submission_id, reporter_id)
    VALUES (p_submission_id, auth.uid())
    ON CONFLICT (submission_id, reporter_id) DO NOTHING;
    RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.report_submission(UUID) TO authenticated;
