# Challenges

Each challenge lives in its own folder named with an id (any string,
typically `001`, `002`, …). The website reads `manifest.json` at the
root of this folder to discover available challenges.

## Quick workflow (with the automation script)

1. **Create a new folder** under this directory, e.g. `images/challenges/003/`.

2. **Drop your files inside.** Filenames must follow this convention
   (case-insensitive, any common extension):

   | File         | Required? | What it is                                                |
   | ------------ | --------- | --------------------------------------------------------- |
   | `cover.*`    | yes       | Flat preview shown on the game screen (jpg/png/webp/svg)  |
   | `source.*`   | optional  | The original file the player downloads (dng/raw/tif/...) |
   | `reference.*`| optional  | Your own grade, shown in result if "reference" is enabled |
   | `meta.json`  | optional  | `{"title": "...", "meta": "..."}` — see below             |

3. **Rebuild the manifest** by running, from the project root:

       python build_manifest.py

   Or on Windows, just double-click `build-manifest.bat`.

   The script:
   - Scans every subfolder of `images/challenges/`
   - Detects `cover.*`, `source.*`, `reference.*` by filename
   - Reads `meta.json` if present to set `title` and `meta`
   - Writes `manifest.json` with the file paths and sizes
   - Skips folders that don't have a cover

4. **Reload the game** in your browser. The new challenge appears in
   the random pick pool immediately.

## Other commands

    python build_manifest.py --list     # show what would be included, don't write
    python build_manifest.py --watch    # rebuild every time you add/edit files

## meta.json format

Drop a `meta.json` file in each challenge folder to set its display data
and copyright information:

```json
{
    "title": "São Paulo · 2024 · Portra 400",
    "meta":  "portra 400 · 6×7 · scan flat",
    "photographer": "Jane Doe",
    "license": "CC BY-NC",
    "terms": "Personal grading practice only. Do not redistribute the source file or use commercially.",
    "instagram": "janedoe"
}
```

All fields are optional. Defaults if missing:

| Field          | Default                                                                    |
| -------------- | -------------------------------------------------------------------------- |
| `title`        | `Challenge {id}`                                                           |
| `meta`         | `—`                                                                        |
| `photographer` | `unknown`                                                                  |
| `license`      | `All Rights Reserved`                                                      |
| `terms`        | `Personal grading practice only. Do not redistribute or use commercially.` |
| `instagram`    | `null` (no button shown)                                                   |

### `instagram` — accepted formats

The build script normalizes any of these to a bare handle (`janedoe`):

- `janedoe`
- `@janedoe`
- `instagram.com/janedoe`
- `https://www.instagram.com/janedoe/`

If present, a small clickable Instagram pill button appears on the
photographer's card on `/contributors.html`, opening the profile in a
new tab.

### Common license values

- `All Rights Reserved` — default, no special permissions granted
- `CC BY-NC` — Creative Commons attribution + non-commercial (allows derivatives)
- `CC BY-NC-ND` — attribution + non-commercial + no derivatives (most restrictive CC)
- `Public Domain` / `CC0` — no restrictions
- Or custom text — be explicit about what you allow

## Copyright protection — how the site protects contributors

For each challenge, the site applies four overlapping protections:

1. **Visible attribution** in the UI — photographer + license are shown
   in the rail of the game screen and in the comparison screen, so the
   player always knows whose work they're looking at.
2. **Terms-of-Use modal before download** — the player must tick
   a checkbox accepting the per-photo terms before the file is fetched.
   This creates a clear acknowledgement (and a small legal paper trail).
3. **Personalized filename** — the downloaded file is renamed from
   `source.dng` to `gg_{challengeId}_{playerNick}_{date}.{ext}`.
   If the file is shared without renaming, the recipient sees who
   downloaded it. Easy to strip but a useful passive deterrent.
4. **Embedded EXIF metadata** — *contributors are encouraged to embed*
   copyright + license info in the source file's metadata before adding
   it to the project. See below.

### Embedding EXIF metadata in your source files (recommended)

Use [ExifTool](https://exiftool.org/) — works on DNG, RAW, TIFF, JPEG
and most photography formats. From the command line:

```bash
exiftool \
  -Artist="Jane Doe" \
  -Copyright="© 2026 Jane Doe" \
  -CopyrightNotice="Provided to grading-game for educational use only" \
  -UsageTerms="Personal grading practice. Do not redistribute or use commercially." \
  -Rights="All rights reserved" \
  source.dng
```

This baked-in metadata survives the page download path (the JS doesn't
strip it). It can be removed with the right tooling, but for casual
sharing it's strong protection — and demonstrates the photographer's
intent if a leak ever leads to a dispute.

Alternative: most RAW processors (Lightroom, Capture One) have
"Metadata templates" that let you stamp copyright into every export
automatically. Set one up once, apply it before you send photos.

## Supported file extensions

- **Preview** (cover, reference): `.jpg`, `.jpeg`, `.png`, `.webp`, `.svg`
- **Source** (downloadable original): `.dng`, `.raw`, `.cr2`, `.cr3`, `.nef`,
  `.arw`, `.rw2`, `.raf`, `.tif`, `.tiff`, `.orf`, `.jpg`, `.png`

To add other extensions, edit the `PREVIEW_EXTS` / `SOURCE_EXTS` sets at the
top of `build_manifest.py`.

## Notes

- The manifest is regenerated **from scratch** every time — you can safely
  delete or rename challenge folders, the next run picks up the change.
- Folders starting with `.` (like `.DS_Store` or `.hidden`) are ignored.
- The game picks a challenge **at random** from this list on each session.
