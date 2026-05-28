-- =========================================================
-- grading-game · lock down stats exposure · 009
--
-- Context
-- -------
-- Before this migration, anyone with the publishable key could
-- query `profile_stats` over PostgREST and dump aggregated stats
-- for every signed-in player (nickname, games_played, wins,
-- total_score, best_score, avg_score). Two reasons:
--
--   1) The view was granted SELECT to `anon` AND `authenticated`,
--      and Postgres views run as the OWNER by default — so the
--      RLS policy on `game_history` (which restricts to
--      auth.uid() = user_id) was bypassed when reading through
--      the view.
--
--   2) The `profiles` table SELECT policy was `using (true)` for
--      every role, exposing the full list of (id, nickname,
--      display_name, avatar_url, bio, created_at) to anonymous
--      scrapers.
--
-- This migration:
--   * Recreates `profile_stats` as `security_invoker = true` AND
--     adds a WHERE id = auth.uid() filter so the view ONLY returns
--     the caller's own row, period. Belt + suspenders.
--   * Revokes SELECT on `profile_stats` from anon — only signed-in
--     users have a stats row to read anyway.
--   * Restricts the `profiles` SELECT policy to authenticated.
--     The multiplayer lobby reads room hosts via the security-
--     definer RPC `list_lobby_rooms`, so this doesn't break.
--   * Adds an RPC `is_nickname_available(text)` that returns only
--     a boolean — used by the client signup / rename flows so we
--     don't need direct SELECT on `profiles` from JS.
--
-- Idempotent · safe to re-run.
-- =========================================================


-- ============================================================
-- 1) profile_stats: self-only + security_invoker
-- ============================================================

DROP VIEW IF EXISTS profile_stats;

CREATE VIEW profile_stats
WITH (security_invoker = true) AS
SELECT
    p.id,
    p.nickname,
    p.display_name,
    p.avatar_url,
    p.bio,
    p.created_at,
    COALESCE(COUNT(g.id), 0)::int                                          AS games_played,
    COALESCE(COUNT(g.id) FILTER (WHERE g.mode = 'multi'), 0)::int          AS multi_games_played,
    COALESCE(COUNT(g.id) FILTER (WHERE g.mode = 'solo'),  0)::int          AS solo_games_played,
    COALESCE(SUM(g.score) FILTER (WHERE g.mode = 'multi'), 0)::int         AS total_score,
    COALESCE(MAX(g.score) FILTER (WHERE g.mode = 'multi'), 0)::int         AS best_score,
    ROUND(COALESCE(AVG(g.score) FILTER (WHERE g.mode = 'multi'), 0)::numeric, 1) AS avg_score,
    COALESCE(COUNT(g.id) FILTER (WHERE g.mode = 'multi' AND g.rank = 1), 0)::int AS wins
FROM profiles p
LEFT JOIN game_history g ON g.user_id = p.id
-- Explicit self-filter: even if the security_invoker setting is
-- ever flipped off, this WHERE clause guarantees a caller can only
-- see their own row. auth.uid() returns NULL for anon, so anon
-- queries return zero rows.
WHERE p.id = auth.uid()
GROUP BY p.id;

REVOKE ALL ON profile_stats FROM PUBLIC, anon;
GRANT SELECT ON profile_stats TO authenticated;


-- ============================================================
-- 2) profiles SELECT — authenticated only
-- ============================================================
-- The lobby host display, room state machine, etc. either go
-- through security-definer RPCs (list_lobby_rooms) or already
-- require auth (every user is at least anonymously signed in
-- when interacting with the app). Anonymous PostgREST queries
-- to /profiles will now return 0 rows.

DROP POLICY IF EXISTS "profiles are publicly readable" ON profiles;
DROP POLICY IF EXISTS "profiles are readable to authenticated" ON profiles;

CREATE POLICY "profiles are readable to authenticated"
ON profiles FOR SELECT
TO authenticated
USING (true);


-- ============================================================
-- 3) is_nickname_available(text) helper RPC
-- ============================================================
-- Replaces the direct `select id from profiles where nickname = ?`
-- pattern used by supabase-client.js + profile.js. Returns just a
-- boolean — no row data leaks to the client.
--
-- SECURITY DEFINER so it can read profiles regardless of the new
-- restricted SELECT policy (we want even anonymous users to be
-- able to pre-check a nickname during the signup flow).

CREATE OR REPLACE FUNCTION is_nickname_available(p_nickname TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
    SELECT NOT EXISTS (
        SELECT 1 FROM profiles WHERE nickname = p_nickname
    );
$$;

GRANT EXECUTE ON FUNCTION is_nickname_available(TEXT) TO anon, authenticated;
