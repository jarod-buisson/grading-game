-- =========================================================
-- grading.game · profiles + game history · 005
-- =========================================================
-- Adds:
--   profiles       — per-user profile (nickname, avatar, display name)
--   game_history   — per-game log used to compute stats
--   profile_stats  — view aggregating game_history into stats
--
-- Design notes:
--   * All FKs point at auth.users with ON DELETE CASCADE so a
--     user deleting their account erases everything in one shot
--     (GDPR-friendly).
--   * Anonymous users (no email) deliberately do NOT get a profile
--     row — they can still play, just without persistent stats.
--   * profiles.nickname is unique (collisions resolved at signup
--     time by appending a numeric suffix in the trigger below).
--   * profile_stats is a VIEW, not a materialized table, so stats
--     stay accurate without any sync logic. Cheap because the
--     dataset will be small per user (one row per game played).
-- =========================================================


-- ---------- profiles ---------------------------------------
create table if not exists profiles (
    id            uuid primary key references auth.users(id) on delete cascade,
    nickname      text unique not null,
    display_name  text,
    avatar_url    text,
    bio           text,
    created_at    timestamp with time zone default now(),
    updated_at    timestamp with time zone default now()
);

create index if not exists profiles_nickname_lower_idx
    on profiles (lower(nickname));


-- ---------- game_history -----------------------------------
create table if not exists game_history (
    id               uuid primary key default gen_random_uuid(),
    user_id          uuid not null references auth.users(id) on delete cascade,
    mode             text not null check (mode in ('solo', 'multi')),
    challenge_id     text not null,
    room_id          uuid references rooms(id) on delete set null,
    score            int default 0,           -- votes received (multi only)
    rank             int,                     -- 1, 2, 3... (multi only)
    duration_seconds int,                     -- length of the round
    played_at        timestamp with time zone default now()
);

create index if not exists game_history_user_id_idx
    on game_history (user_id);
create index if not exists game_history_user_played_at_idx
    on game_history (user_id, played_at desc);


-- ---------- profile_stats view ------------------------------
-- Aggregates game_history into convenient per-user stats.
-- Query from JS for the profile page:
--   select * from profile_stats where id = auth.uid();
create or replace view profile_stats as
select
    p.id,
    p.nickname,
    p.display_name,
    p.avatar_url,
    p.bio,
    p.created_at,
    coalesce(count(g.id), 0)::int as games_played,
    coalesce(count(g.id) filter (where g.mode = 'multi'), 0)::int as multi_games_played,
    coalesce(count(g.id) filter (where g.mode = 'solo'),  0)::int as solo_games_played,
    coalesce(sum(g.score) filter (where g.mode = 'multi'), 0)::int as total_score,
    coalesce(max(g.score) filter (where g.mode = 'multi'), 0)::int as best_score,
    round(coalesce(avg(g.score) filter (where g.mode = 'multi'), 0)::numeric, 1) as avg_score,
    coalesce(count(g.id) filter (where g.mode = 'multi' and g.rank = 1), 0)::int as wins
from profiles p
left join game_history g on g.user_id = p.id
group by p.id;

grant select on profile_stats to anon, authenticated;


-- ---------- RLS on profiles ---------------------------------
alter table profiles enable row level security;

drop policy if exists "profiles are publicly readable" on profiles;
create policy "profiles are publicly readable"
on profiles for select
using (true);

drop policy if exists "users update own profile" on profiles;
create policy "users update own profile"
on profiles for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "users delete own profile" on profiles;
create policy "users delete own profile"
on profiles for delete
to authenticated
using (auth.uid() = id);

-- INSERT is handled by the auth-trigger below, never by clients.


-- ---------- RLS on game_history -----------------------------
alter table game_history enable row level security;

drop policy if exists "users read own game history" on game_history;
create policy "users read own game history"
on game_history for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "users insert own game history" on game_history;
create policy "users insert own game history"
on game_history for insert
to authenticated
with check (auth.uid() = user_id);

-- No UPDATE / DELETE policies on game_history: it's append-only,
-- erased only via the cascade when the user deletes their account.


-- ---------- Trigger: auto-create profile on signup ----------
-- Runs after every insert into auth.users.
-- Skips anonymous users (no email) — they keep playing without
-- a profile, until they choose to sign in.
-- For OAuth/email users, derives a nickname from metadata and
-- guarantees uniqueness by appending a numeric suffix on collision.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    base_nickname  text;
    final_nickname text;
    suffix         int := 0;
begin
    -- Anonymous users don't get a profile row.
    if new.email is null then
        return new;
    end if;

    -- Derive a base nickname from OAuth metadata, falling back
    -- progressively to the email prefix, then a random id chunk.
    base_nickname := coalesce(
        nullif(new.raw_user_meta_data ->> 'preferred_username', ''),
        nullif(new.raw_user_meta_data ->> 'user_name',         ''),
        nullif(new.raw_user_meta_data ->> 'name',              ''),
        nullif(new.raw_user_meta_data ->> 'full_name',         ''),
        nullif(split_part(new.email, '@', 1),                  ''),
        'user_' || substr(new.id::text, 1, 8)
    );

    -- Sanitize: lowercase, [a-z0-9_] only, max 20 chars
    base_nickname := lower(regexp_replace(base_nickname, '[^a-zA-Z0-9_]', '', 'g'));
    base_nickname := left(base_nickname, 20);

    -- If the sanitized result is empty, fallback to a random id
    if base_nickname = '' or base_nickname is null then
        base_nickname := 'user_' || substr(new.id::text, 1, 8);
    end if;

    -- Ensure uniqueness by appending a numeric suffix
    final_nickname := base_nickname;
    while exists(select 1 from profiles where nickname = final_nickname) loop
        suffix := suffix + 1;
        final_nickname := base_nickname || suffix::text;
        -- Safety net: avoid infinite loop on pathological data
        if suffix > 9999 then
            final_nickname := base_nickname || substr(new.id::text, 1, 6);
            exit;
        end if;
    end loop;

    insert into profiles (id, nickname, display_name, avatar_url)
    values (
        new.id,
        final_nickname,
        nullif(new.raw_user_meta_data ->> 'name', ''),
        nullif(new.raw_user_meta_data ->> 'avatar_url', '')
    );

    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row
    execute function handle_new_user();


-- ---------- Trigger: keep profiles.updated_at fresh ---------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on profiles;
create trigger profiles_set_updated_at
    before update on profiles
    for each row
    execute function set_updated_at();


-- ---------- Done. -------------------------------------------
-- Next steps (handled in app code, not SQL):
--   1. Enable Google provider in Supabase Dashboard → Authentication → Providers
--   2. Add Google Cloud OAuth client credentials there
--   3. Update js/supabase-client.js to add signInWithGoogle() + onAuthStateChange listener
--   4. Build profile.html
--   5. Insert into game_history when a solo/multi round ends, IF auth.uid() is not null
-- =========================================================
