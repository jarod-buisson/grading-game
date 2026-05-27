-- =========================================================
-- grading-game · fix RLS recursion · 003
--
-- The policies in 001_schema.sql reference `players` from within
-- `players`'s own SELECT policy, which makes Postgres re-evaluate
-- the policy recursively and abort with:
--   "infinite recursion detected in policy for relation players"
--
-- Standard fix: extract the membership check into a SECURITY DEFINER
-- helper function that bypasses RLS on `players`. Then every policy
-- that wants "is this user a member of this room?" calls that
-- function instead of querying `players` directly.
-- =========================================================

CREATE OR REPLACE FUNCTION is_room_member(p_room_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM players
        WHERE room_id = p_room_id AND user_id = auth.uid()
    );
$$;

GRANT EXECUTE ON FUNCTION is_room_member(UUID) TO anon, authenticated;

-- =========================================================
-- rebuild every policy that referenced `players` so it uses
-- is_room_member() instead
-- =========================================================

-- ----- players -----
DROP POLICY IF EXISTS players_select_same_room ON players;
CREATE POLICY players_select_same_room ON players FOR SELECT
USING (
    -- public rooms: everyone can see the player list
    EXISTS (SELECT 1 FROM rooms r WHERE r.id = players.room_id AND r.visibility = 'public')
    -- otherwise, only members of the room can see fellow players
    OR is_room_member(players.room_id)
);

-- ----- rooms -----
-- rooms_select_member referenced players directly which also recurses
-- because reading from `players` triggers the players policy.
DROP POLICY IF EXISTS rooms_select_member ON rooms;
CREATE POLICY rooms_select_member ON rooms FOR SELECT
USING ( is_room_member(rooms.id) );

-- ----- submissions -----
DROP POLICY IF EXISTS submissions_select_room ON submissions;
CREATE POLICY submissions_select_room ON submissions FOR SELECT
USING ( is_room_member(submissions.room_id) );

DROP POLICY IF EXISTS submissions_insert_self ON submissions;
CREATE POLICY submissions_insert_self ON submissions FOR INSERT
WITH CHECK (
    is_room_member(submissions.room_id)
    AND EXISTS (
        SELECT 1 FROM players p
        WHERE p.id = submissions.player_id
          AND p.user_id = auth.uid()
          AND p.room_id = submissions.room_id
    )
);

DROP POLICY IF EXISTS submissions_update_self ON submissions;
CREATE POLICY submissions_update_self ON submissions FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM players p
        WHERE p.id = submissions.player_id AND p.user_id = auth.uid()
    )
);

DROP POLICY IF EXISTS submissions_delete_self ON submissions;
CREATE POLICY submissions_delete_self ON submissions FOR DELETE
USING (
    EXISTS (
        SELECT 1 FROM players p
        WHERE p.id = submissions.player_id AND p.user_id = auth.uid()
    )
);

-- ----- votes -----
DROP POLICY IF EXISTS votes_select_room ON votes;
CREATE POLICY votes_select_room ON votes FOR SELECT
USING ( is_room_member(votes.room_id) );

-- Note: votes_insert_self / update_self / delete_self also query players,
-- but only by `players.id = votes.voter_id` (FK lookup), not by room_id
-- predicates that trigger the player SELECT policy. Those should be fine.
-- (If they ever recurse, we'd wrap them in another SECURITY DEFINER helper.)
