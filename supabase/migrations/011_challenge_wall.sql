-- =========================================================
-- grading-game · challenge wall (gallery entry point) · 011
--
-- Context
-- -------
-- The gallery (gallery.html) is a Pokédex of every photo. Once you've
-- UNLOCKED a photo (played it at least once → a game_history row), you
-- can now click its card and open challenge.html, a page that shows the
-- original (the photographer's reference) plus every edit players have
-- published on that same photo.
--
-- Why a second RPC instead of reusing get_wall (migration 010)?
-- -------------------------------------------------------------
-- get_wall is gated on PUBLISHING ("publish-to-view", Wordle-style) — it
-- only returns the items once your own edit is on the wall. That gate is
-- exactly right on the result screen (it nudges you to contribute before
-- you peek). But the gallery is a reward you already earned by playing:
-- if you've unlocked a photo you should be able to browse its wall even
-- if you never published your edit. So this page needs a DIFFERENT gate.
--
-- get_challenge_wall therefore gates on UNLOCKED (a game_history row for
-- the caller on that challenge) instead of published. The result-screen
-- get_wall is left completely untouched.
--
-- Idempotent · safe to re-run.
-- =========================================================


-- ============================================================
-- get_challenge_wall(challenge_id) — wall feed for an UNLOCKED photo
-- ============================================================
-- Returns JSONB, same shape as get_wall:
--   {
--     "count":     <total visible submissions>,
--     "can_view":  <caller has UNLOCKED this challenge (played it)>,
--     "items":     [ { id, nickname, image_path, created_at, updated_at, is_you } ]
--   }
-- items is [] unless can_view (so a direct URL hit on a photo you haven't
-- unlocked, or an anonymous visitor, reveals nothing).
--
-- SECURITY DEFINER: reads game_history (the unlock signal), all wall rows
-- regardless of the self-only SELECT policy on wall_submissions, and joins
-- profiles for nicknames without reopening the locked-down profiles SELECT.

CREATE OR REPLACE FUNCTION public.get_challenge_wall(p_challenge_id TEXT)
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

    -- Unlock gate: you've played this challenge at least once.
    SELECT EXISTS (
        SELECT 1 FROM game_history
        WHERE user_id = auth.uid()
          AND challenge_id::text = p_challenge_id
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

GRANT EXECUTE ON FUNCTION public.get_challenge_wall(TEXT) TO anon, authenticated;
