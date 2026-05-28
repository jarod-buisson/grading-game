-- =========================================================
-- grading-game · room category filter · 008
--
-- Adds a `category` column to `rooms` so the host can narrow
-- the random challenge pick to a capture medium (negative /
-- digital) at room creation time — same dropdown the solo
-- setup already has.
--
-- Three changes:
--   1) ADD COLUMN rooms.category (nullable text, checked)
--   2) Replace create_room() to accept p_category and store it
--   3) Replace list_lobby_rooms() to surface category in the
--      lobby payload (so we could badge cards later — the
--      lobby UI ignores it for now but it's free).
--
-- Idempotent · safe to re-run.
-- =========================================================

-- ============================================================
-- 1) Add the category column
-- ============================================================
-- nullable on purpose: NULL == "random · all categories", same
-- semantic as the solo dropdown's default option. The CHECK
-- mirrors the values produced by build_manifest.py's
-- _clean_category() helper so we never persist garbage even if
-- someone calls the RPC directly.

ALTER TABLE rooms
    ADD COLUMN IF NOT EXISTS category TEXT
    CHECK (category IS NULL OR category IN ('negative', 'digital'));


-- ============================================================
-- 2) create_room — accept and persist category
-- ============================================================
-- Old signature is replaced atomically: DROP first so we don't
-- end up with two overloads (positional and named args would
-- both resolve and Postgres would refuse to pick one).

DROP FUNCTION IF EXISTS create_room(TEXT, INT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION create_room(
    p_visibility   TEXT,
    p_duration_min INT,
    p_challenge_id TEXT,
    p_nickname     TEXT,
    p_category     TEXT DEFAULT NULL
)
RETURNS rooms
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_room rooms;
    v_uid  UUID := auth.uid();
    v_cat  TEXT := NULLIF(lower(trim(coalesce(p_category, ''))), '');
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'must be signed in (anonymous auth ok)';
    END IF;

    -- Normalize: treat "random" and empty values as NULL (= no filter)
    IF v_cat IN ('random', '') THEN
        v_cat := NULL;
    END IF;
    IF v_cat IS NOT NULL AND v_cat NOT IN ('negative', 'digital') THEN
        RAISE EXCEPTION 'invalid category: %', p_category;
    END IF;

    INSERT INTO rooms (code, visibility, host_id, challenge_id, duration_min, category)
    VALUES (gen_room_code(), p_visibility, v_uid, p_challenge_id, p_duration_min, v_cat)
    RETURNING * INTO v_room;

    INSERT INTO players (user_id, room_id, nickname, is_host)
    VALUES (v_uid, v_room.id, p_nickname, true);

    RETURN v_room;
END;
$$;

GRANT EXECUTE ON FUNCTION create_room(TEXT, INT, TEXT, TEXT, TEXT) TO anon, authenticated;


-- ============================================================
-- 3) list_lobby_rooms — surface category in lobby payload
-- ============================================================
-- The new column is appended at the end so existing clients that
-- decode the row by position still work. The signature changes
-- so we drop+recreate (CREATE OR REPLACE can't change return
-- type — Postgres would error with "cannot change return type").

DROP FUNCTION IF EXISTS list_lobby_rooms();

CREATE OR REPLACE FUNCTION list_lobby_rooms()
RETURNS TABLE(
    id            UUID,
    display_code  TEXT,
    visibility    TEXT,
    state         TEXT,
    max_players   INT,
    duration_min  INT,
    host_nickname TEXT,
    player_count  INT,
    created_at    TIMESTAMPTZ,
    category      TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        r.id,
        CASE
            WHEN r.visibility = 'private' THEN '★★★★★★'
            ELSE r.code
        END                                                                AS display_code,
        r.visibility,
        r.state,
        r.max_players,
        r.duration_min,
        (SELECT p.nickname FROM players p
            WHERE p.room_id = r.id AND p.is_host LIMIT 1)                  AS host_nickname,
        (SELECT count(*)::int FROM players p WHERE p.room_id = r.id)       AS player_count,
        r.created_at,
        r.category
    FROM rooms r
    WHERE r.state IN ('lobby', 'playing')
    ORDER BY r.created_at DESC
    LIMIT 60;
$$;

GRANT EXECUTE ON FUNCTION list_lobby_rooms() TO anon, authenticated;
