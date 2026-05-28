-- =========================================================
-- grading-game · contributions table · 007
-- =========================================================
-- Stores submissions from the "Want to contribute?" form on
-- contributors.html. Anyone (including anonymous visitors) can
-- INSERT a row. Nobody can SELECT/UPDATE/DELETE from the client
-- — submissions are read only via the Supabase dashboard (which
-- runs as service_role and bypasses RLS).
--
-- We also store the auth user_id if the submitter happened to
-- be signed in, so we can correlate submissions with profiles.
-- =========================================================


-- ---------- contributions table ----------------------------
create table if not exists contributions (
    id            uuid primary key default gen_random_uuid(),
    first_name    text not null check (length(trim(first_name)) > 0
                                       and length(first_name) <= 100),
    last_name     text not null check (length(trim(last_name)) > 0
                                       and length(last_name) <= 100),
    email         text not null check (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
    transfer_link text not null check (transfer_link ~* '^https?://'),
    message       text check (message is null or length(message) <= 2000),
    instagram     text check (instagram is null or length(instagram) <= 50),
    -- Optional link to the signed-in user (if any) at submission time
    user_id       uuid references auth.users(id) on delete set null,
    -- Honeypot — if a bot fills this, we still accept the row but flag it
    is_spam       boolean default false,
    created_at    timestamp with time zone default now()
);

create index if not exists contributions_created_at_idx
    on contributions (created_at desc);


-- ---------- RLS ---------------------------------------------
alter table contributions enable row level security;

-- Anyone (anon or authenticated) can submit a contribution.
drop policy if exists "anyone can submit contribution" on contributions;
create policy "anyone can submit contribution"
on contributions for insert
to anon, authenticated
with check (true);

-- No SELECT/UPDATE/DELETE policy → all reads/writes from client
-- are denied. Only the dashboard (service_role) can see them.


-- ---------- Done. -------------------------------------------
-- After running this in the Supabase SQL editor:
--   1. Go to Table Editor → contributions to confirm the table exists
--   2. Each form submission will appear as a new row
--   3. (Optional) Add a Database Webhook to forward new rows to
--      a notification service later if you want Slack/Discord pings
-- =========================================================
