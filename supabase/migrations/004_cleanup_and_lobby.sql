-- =========================================================
-- grading-game · auto-cleanup + lobby with private masking · 004
--
-- 1) Trigger: when the LAST player leaves a room, drop the room
--    (its remaining submissions/votes cascade via FK).
-- 2) RPC `list_lobby_rooms()` — returns lobby data with private
--    room codes redacted to ★ characters so private rooms can be
--    shown in the public lobby without leaking their join code.
-- =========================================================

-- ============================================================
-- 1) AUTO-DELETE ROOM WHEN LAST PLAYER LEAVES
-- ============================================================

CREATE OR REPLACE FUNCTION delete_room_if_empty()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count INT;
BEGIN
    -- Count remaining players in that room (excluding the row just deleted)
    SELECT count(*) INTO v_count FROM players WHERE room_id = OLD.room_id;
    IF v_count = 0 THEN
        DELETE FROM rooms WHERE id = OLD.room_id;
    END IF;
    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_delete_room_if_empty ON players;

CREATE TRIGGER trg_delete_room_if_empty
AFTER DELETE ON players
FOR EACH ROW
EXECUTE FUNCTION delete_room_if_empty();


-- ============================================================
-- 2) LOBBY RPC — returns rooms with private codes redacted
-- ============================================================

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
    created_at    TIMESTAMPTZ
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
        r.created_at
    FROM rooms r
    WHERE r.state IN ('lobby', 'playing')
    ORDER BY r.created_at DESC
    LIMIT 60;
$$;

GRANT EXECUTE ON FUNCTION list_lobby_rooms() TO anon, authenticated;


-- ============================================================
-- Sanity cleanup: remove rooms that have no players right now.
-- (These are the orphans left over from before the trigger
-- existed. Safe one-shot DELETE.)
-- ============================================================

DELETE FROM rooms r
WHERE NOT EXISTS (SELECT 1 FROM players p WHERE p.room_id = r.id);
