-- =========================================================
-- grading-game · account helpers · 006
-- =========================================================
-- Adds:
--   * INSERT policy on profiles so a freshly-signed-in user can
--     self-create their profile row when the auth-trigger didn't
--     fire (typical case: user deleted their account previously
--     and is signing back in with the same provider — auth.users
--     row already exists, so on_auth_user_created doesn't run).
--   * RPC delete_my_account() — fully removes the caller's auth
--     user (and through cascade: profile + game_history).
--     Runs as SECURITY DEFINER so it has permission to touch the
--     auth schema; protected by an internal auth.uid() check.
-- =========================================================


-- ---------- INSERT policy on profiles -----------------------
drop policy if exists "users insert own profile" on profiles;
create policy "users insert own profile"
on profiles for insert
to authenticated
with check (auth.uid() = id);


-- ---------- RPC: delete_my_account --------------------------
create or replace function delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
    me uuid := auth.uid();
begin
    if me is null then
        raise exception 'must be authenticated';
    end if;

    -- Deleting auth.users cascades to profile + game_history
    -- (and players + rooms.host_id → set null) thanks to the
    -- existing FK declarations.
    delete from auth.users where id = me;
end;
$$;

grant execute on function delete_my_account() to authenticated;
