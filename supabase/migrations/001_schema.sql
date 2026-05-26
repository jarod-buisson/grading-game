-- =========================================================
-- grading.game · initial schema · 001
-- Paste this entire file into the Supabase SQL Editor and run.
-- Idempotent: safe to re-run.
-- =========================================================

-- =========================================================
-- TABLES
-- =========================================================

CREATE TABLE IF NOT EXISTS rooms (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code          TEXT UNIQUE NOT NULL CHECK (length(code) = 6),
    visibility    TEXT NOT NULL DEFAULT 'public'
                  CHECK (visibility IN ('public', 'private')),
    host_id       UUID NOT NULL,                                  -- auth.users
    challenge_id  TEXT,
    duration_min  INT  NOT NULL DEFAULT 20
                  CHECK (duration_min BETWEEN 1 AND 120),
    state         TEXT NOT NULL DEFAULT 'lobby'
                  CHECK (state IN ('lobby','playing','gallery','result','finished')),
    max_players   INT  NOT NULL DEFAULT 8
                  CHECK (max_players BETWEEN 2 AND 16),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at    TIMESTAMPTZ,
    ended_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS rooms_code_idx       ON rooms (code);
CREATE INDEX IF NOT EXISTS rooms_public_idx     ON rooms (created_at DESC)
    WHERE visibility = 'public' AND state IN ('lobby', 'playing');


CREATE TABLE IF NOT EXISTS players (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL,                                    -- auth.users
    room_id     UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    nickname    TEXT NOT NULL CHECK (length(nickname) BETWEEN 3 AND 24),
    is_host     BOOLEAN NOT NULL DEFAULT false,
    joined_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, room_id)
);

CREATE INDEX IF NOT EXISTS players_room_id_idx ON players (room_id);
CREATE INDEX IF NOT EXISTS players_user_id_idx ON players (user_id);


CREATE TABLE IF NOT EXISTS submissions (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id       UUID NOT NULL REFERENCES rooms(id)   ON DELETE CASCADE,
    player_id     UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    file_url      TEXT NOT NULL,                                  -- public storage URL
    file_name     TEXT NOT NULL,
    file_size     BIGINT,
    submitted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (room_id, player_id)
);

CREATE INDEX IF NOT EXISTS submissions_room_id_idx ON submissions (room_id);


CREATE TABLE IF NOT EXISTS votes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id         UUID NOT NULL REFERENCES rooms(id)        ON DELETE CASCADE,
    voter_id        UUID NOT NULL REFERENCES players(id)      ON DELETE CASCADE,
    submission_id   UUID NOT NULL REFERENCES submissions(id)  ON DELETE CASCADE,
    stars           INT  NOT NULL CHECK (stars BETWEEN 1 AND 5),
    voted_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (voter_id, submission_id)
);

CREATE INDEX IF NOT EXISTS votes_room_id_idx       ON votes (room_id);
CREATE INDEX IF NOT EXISTS votes_submission_id_idx ON votes (submission_id);


-- =========================================================
-- HELPER FUNCTIONS
-- =========================================================

-- Generate a unique 6-char room code (no confusable chars: O/0/I/1)
CREATE OR REPLACE FUNCTION gen_room_code()
RETURNS TEXT
LANGUAGE plpgsql AS $$
DECLARE
    chars CONSTANT TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    n INT := length(chars);
    candidate TEXT;
    attempts INT := 0;
BEGIN
    LOOP
        candidate := '';
        FOR i IN 1..6 LOOP
            candidate := candidate || substr(chars, 1 + floor(random() * n)::int, 1);
        END LOOP;
        EXIT WHEN NOT EXISTS (SELECT 1 FROM rooms WHERE code = candidate);
        attempts := attempts + 1;
        IF attempts > 12 THEN
            RAISE EXCEPTION 'could not generate unique room code after 12 attempts';
        END IF;
    END LOOP;
    RETURN candidate;
END;
$$;


-- Create a room AND insert the host as the first player atomically.
-- Returns the new room row.
CREATE OR REPLACE FUNCTION create_room(
    p_visibility   TEXT,
    p_duration_min INT,
    p_challenge_id TEXT,
    p_nickname     TEXT
)
RETURNS rooms
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_room rooms;
    v_uid  UUID := auth.uid();
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'must be signed in (anonymous auth ok)';
    END IF;

    INSERT INTO rooms (code, visibility, host_id, challenge_id, duration_min)
    VALUES (gen_room_code(), p_visibility, v_uid, p_challenge_id, p_duration_min)
    RETURNING * INTO v_room;

    INSERT INTO players (user_id, room_id, nickname, is_host)
    VALUES (v_uid, v_room.id, p_nickname, true);

    RETURN v_room;
END;
$$;


-- Join a room by its code. Bypasses RLS (security definer) so private rooms
-- can be discovered with their code without leaking to the lobby listing.
-- Returns the room.
CREATE OR REPLACE FUNCTION join_room_by_code(
    p_code     TEXT,
    p_nickname TEXT
)
RETURNS rooms
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_room rooms;
    v_count INT;
    v_uid UUID := auth.uid();
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'must be signed in';
    END IF;

    SELECT * INTO v_room FROM rooms WHERE code = upper(p_code);
    IF v_room.id IS NULL THEN
        RAISE EXCEPTION 'room not found';
    END IF;
    IF v_room.state <> 'lobby' THEN
        RAISE EXCEPTION 'room not joinable (state: %)', v_room.state;
    END IF;

    SELECT count(*) INTO v_count FROM players WHERE room_id = v_room.id;
    IF v_count >= v_room.max_players THEN
        -- Allow re-joining your own player
        IF NOT EXISTS (SELECT 1 FROM players WHERE room_id = v_room.id AND user_id = v_uid) THEN
            RAISE EXCEPTION 'room full';
        END IF;
    END IF;

    INSERT INTO players (user_id, room_id, nickname)
    VALUES (v_uid, v_room.id, p_nickname)
    ON CONFLICT (user_id, room_id)
        DO UPDATE SET nickname = excluded.nickname,
                      last_seen = now();

    RETURN v_room;
END;
$$;


-- Transition room state (host only). Centralized so we can add validation later.
CREATE OR REPLACE FUNCTION set_room_state(
    p_room_id UUID,
    p_state   TEXT
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM rooms WHERE id = p_room_id AND host_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'not host of this room';
    END IF;
    IF p_state NOT IN ('lobby','playing','gallery','result','finished') THEN
        RAISE EXCEPTION 'invalid state %', p_state;
    END IF;
    UPDATE rooms
       SET state = p_state,
           started_at = CASE WHEN p_state = 'playing' AND started_at IS NULL THEN now() ELSE started_at END,
           ended_at   = CASE WHEN p_state IN ('finished','result')           THEN now() ELSE ended_at   END
     WHERE id = p_room_id;
END;
$$;


-- =========================================================
-- ROW LEVEL SECURITY
-- =========================================================

ALTER TABLE rooms       ENABLE ROW LEVEL SECURITY;
ALTER TABLE players     ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes       ENABLE ROW LEVEL SECURITY;

-- ----- rooms -----
DROP POLICY IF EXISTS rooms_select_public ON rooms;
DROP POLICY IF EXISTS rooms_select_member ON rooms;

-- Anyone can see public rooms (for the lobby listing)
CREATE POLICY rooms_select_public ON rooms FOR SELECT
USING (visibility = 'public');

-- Members of a room (private or public) can always see it
CREATE POLICY rooms_select_member ON rooms FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM players p
        WHERE p.room_id = rooms.id AND p.user_id = auth.uid()
    )
);

-- Updates only by host (room state transitions also covered by RPC)
DROP POLICY IF EXISTS rooms_update_host ON rooms;
CREATE POLICY rooms_update_host ON rooms FOR UPDATE
USING (host_id = auth.uid())
WITH CHECK (host_id = auth.uid());

DROP POLICY IF EXISTS rooms_delete_host ON rooms;
CREATE POLICY rooms_delete_host ON rooms FOR DELETE
USING (host_id = auth.uid());

-- We do NOT add INSERT policy — rooms are created via the create_room RPC.

-- ----- players -----
DROP POLICY IF EXISTS players_select_same_room ON players;
CREATE POLICY players_select_same_room ON players FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM rooms r WHERE r.id = players.room_id AND r.visibility = 'public'
    )
    OR
    EXISTS (
        SELECT 1 FROM players p2
        WHERE p2.room_id = players.room_id AND p2.user_id = auth.uid()
    )
);

DROP POLICY IF EXISTS players_update_self ON players;
CREATE POLICY players_update_self ON players FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS players_delete_self ON players;
CREATE POLICY players_delete_self ON players FOR DELETE
USING (user_id = auth.uid());

-- INSERT goes through join_room_by_code or create_room RPC.

-- ----- submissions -----
DROP POLICY IF EXISTS submissions_select_room ON submissions;
-- Visible to all members of the room (frontend handles anonymity during gallery)
CREATE POLICY submissions_select_room ON submissions FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM players p
        WHERE p.room_id = submissions.room_id AND p.user_id = auth.uid()
    )
);

DROP POLICY IF EXISTS submissions_insert_self ON submissions;
CREATE POLICY submissions_insert_self ON submissions FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM players p
        WHERE p.id = submissions.player_id
          AND p.user_id = auth.uid()
          AND p.room_id = submissions.room_id
    )
);

DROP POLICY IF EXISTS submissions_update_self ON submissions;
CREATE POLICY submissions_update_self ON submissions FOR UPDATE
USING (
    EXISTS (SELECT 1 FROM players p WHERE p.id = submissions.player_id AND p.user_id = auth.uid())
);

DROP POLICY IF EXISTS submissions_delete_self ON submissions;
CREATE POLICY submissions_delete_self ON submissions FOR DELETE
USING (
    EXISTS (SELECT 1 FROM players p WHERE p.id = submissions.player_id AND p.user_id = auth.uid())
);

-- ----- votes -----
DROP POLICY IF EXISTS votes_select_room ON votes;
CREATE POLICY votes_select_room ON votes FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM players p
        WHERE p.room_id = votes.room_id AND p.user_id = auth.uid()
    )
);

DROP POLICY IF EXISTS votes_insert_self ON votes;
CREATE POLICY votes_insert_self ON votes FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM players p
        WHERE p.id = votes.voter_id AND p.user_id = auth.uid()
    )
    -- prevent voting on own submission
    AND NOT EXISTS (
        SELECT 1 FROM submissions s
        JOIN players p2 ON p2.id = s.player_id
        WHERE s.id = votes.submission_id AND p2.user_id = auth.uid()
    )
);

DROP POLICY IF EXISTS votes_update_self ON votes;
CREATE POLICY votes_update_self ON votes FOR UPDATE
USING (
    EXISTS (SELECT 1 FROM players p WHERE p.id = votes.voter_id AND p.user_id = auth.uid())
);

DROP POLICY IF EXISTS votes_delete_self ON votes;
CREATE POLICY votes_delete_self ON votes FOR DELETE
USING (
    EXISTS (SELECT 1 FROM players p WHERE p.id = votes.voter_id AND p.user_id = auth.uid())
);


-- =========================================================
-- REALTIME PUBLICATION
-- Enables postgres_changes streaming on these tables.
-- =========================================================

-- Drop first to avoid "relation already member" error on re-runs
DO $$
BEGIN
    BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE rooms;       EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE players;     EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE submissions; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE votes;       EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;

ALTER PUBLICATION supabase_realtime ADD TABLE rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE players;
ALTER PUBLICATION supabase_realtime ADD TABLE submissions;
ALTER PUBLICATION supabase_realtime ADD TABLE votes;


-- =========================================================
-- GRANTS — make sure anon/authenticated can call the RPCs
-- =========================================================

GRANT EXECUTE ON FUNCTION create_room(TEXT, INT, TEXT, TEXT)       TO anon, authenticated;
GRANT EXECUTE ON FUNCTION join_room_by_code(TEXT, TEXT)            TO anon, authenticated;
GRANT EXECUTE ON FUNCTION set_room_state(UUID, TEXT)               TO anon, authenticated;

GRANT SELECT, UPDATE, DELETE ON rooms       TO anon, authenticated;
GRANT SELECT, UPDATE, DELETE ON players     TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON submissions TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON votes       TO anon, authenticated;
