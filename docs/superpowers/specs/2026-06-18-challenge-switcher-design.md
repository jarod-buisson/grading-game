# Challenge switcher dropdown (challenge.html)

## Problem

`challenge.html` (the community wall for one photo) only links back to
`gallery.html` via "← back to gallery". To look at another unlocked
photo's wall, the player has to leave, re-find the card in the grid,
and come back. We want in-page navigation between unlocked challenges
without leaving `challenge.html`.

## Scope

`challenge.html` only. No changes to `gallery.html`, `solo.html`, or
any other picker on the site.

## UI

A new dedicated bar, `<nav class="cw-switcher-bar">`, inserted between
the existing `<header class="top-bar">` and `<main class="cw-stage">`.
It contains a single trigger button, left-aligned:

```html
<nav class="cw-switcher-bar">
  <button class="cw-switcher-trigger" id="cw-switcher-trigger"
          type="button" aria-haspopup="listbox" aria-expanded="false">
    <span class="cw-switcher-thumb" aria-hidden="true">
      <img src="<current challenge reference>" alt="">
    </span>
    <span class="cw-switcher-label">challenge 004</span>
    <span class="cw-switcher-caret" aria-hidden="true">▾</span>
  </button>
  <div class="cw-switcher-panel" id="cw-switcher-panel" role="listbox" hidden>
    <!-- one row per unlocked challenge, see below -->
  </div>
</nav>
```

Clicking the trigger opens `cw-switcher-panel`, anchored directly below
it (`position: absolute`), a scrollable list (`max-height: ~360px;
overflow-y: auto`) of rows, one per unlocked challenge, sorted by id
ascending (manifest order — same order the gallery grid uses):

```html
<a class="cw-switcher-row" href="challenge.html?c=007" role="option">
  <span class="cw-switcher-row-thumb"><img src="…reference…" alt=""></span>
  <span class="cw-switcher-row-label">007 · Some Photographer</span>
</a>
```

The row for the **currently open** challenge is included (so the
player can confirm what they're looking at) but rendered as a
non-interactive `<span class="cw-switcher-row cw-switcher-row--active"
role="option" aria-selected="true">` with a checkmark, not a link.

Thumbnails: `challenge.reference` (same image gallery.js shows for
unlocked cards), ~36×36, `object-fit: cover`, slightly rounded
corners. Row label: `{padded id} · {photographer}` — mirrors the
gallery card's id + photographer line. Visual style (colors, fonts,
borders) reuses existing theme tokens (`--bg-elev-1`,
`--border-subtle`, `--font-mono` for the id, `--font-ui` for the rest)
— no new design language.

## Data flow

No new server calls. Reuses exactly what `gallery.js` already does:

- `window.gg.getUnlockedChallengeIds()` → `Set<string>` of unlocked
  ids (empty for anonymous users — existing behavior of that
  function).
- `images/challenges/manifest.json` → already fetched once by
  `challenge.js`'s `init()` for the current challenge; fetch is
  reused/extended to read the full `challenges` array for the other
  unlocked entries' name + reference image.

Build the switcher list as: every manifest entry whose id is in the
unlocked set, including the current challenge's own id (it must be
unlocked already, since the wall just rendered as open), sorted
ascending by id.

## Behavior

- Selecting a row navigates via normal `<a href="challenge.html?c=ID">`
  — full page load, no client-side routing. Consistent with how
  `gallery.js` already links into this page.
- Trigger toggles the panel; clicking outside the bar, or pressing
  `Escape`, closes it and returns focus to the trigger.
- No arrow-key roving focus in this first pass (lists are short in
  practice) — Tab/Enter on the focusable rows is enough.
- `aria-expanded` on the trigger reflects open/closed state.

## Edge cases

- **Current challenge is locked, or anonymous visitor**
  (`wall.can_view === false` — e.g. direct URL hit on a photo never
  played, or browsing anonymously): `renderLocked()` runs and the
  switcher bar/trigger are never built at all — the whole `<nav
  class="cw-switcher-bar">` stays `hidden`. Browsing between photos
  you can't view doesn't make sense, and we must not leak which ids
  exist/are unlockable via this UI. (The switcher only ever mounts
  inside `renderOpen()`, which by construction means the visitor is
  authenticated and this challenge is unlocked.)
- **Only the current challenge is unlocked** (unlocked set has exactly
  1 entry once `renderOpen()` runs): the trigger renders `disabled`,
  no panel, label unchanged. The bar itself still renders (visual
  consistency across visits to this page).
- **Manifest or unlock fetch fails**: falls back to the existing
  failure behavior of those calls (empty Set / `showError`) — if that
  happens the unlocked set can't even contain the current id, so the
  switcher degrades the same way as the "only this one" case above
  (disabled trigger) rather than throwing.

## i18n

Static strings (none needed beyond what's already on the page — the
trigger label is just the challenge id, not user-facing copy that
needs translation) follow the existing `data-i18n`/`t()` convention if
any are added during implementation (e.g. a "no other challenges
unlocked yet" hint). Challenge names/photographer strings are raw data
and are not translated, matching every other listing on the site
(gallery, comparator).

## Out of scope / explicitly not doing

- No keyboard arrow navigation inside the panel.
- No client-side (no-reload) navigation between challenges.
- No changes to the locked-state CTA or the comparator.
- No changes to `gallery.html` or any other page.
