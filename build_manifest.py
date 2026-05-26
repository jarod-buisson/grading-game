#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
build_manifest.py
─────────────────────────────────────────────────────────────────
Scans `images/challenges/` and rebuilds `manifest.json` from the
folders found inside. Run this every time you add, remove or
rename a challenge.

Usage
─────
    python build_manifest.py            # rebuild manifest.json
    python build_manifest.py --list     # just list what would be included
    python build_manifest.py --watch    # rebuild whenever a file changes

Per-challenge folder convention
───────────────────────────────
    images/challenges/{id}/
        cover.{jpg|jpeg|png|webp|svg}   ← preview shown to the player
        source.{dng|raw|cr2|cr3|nef|arw|rw2|raf|tif|tiff|orf|jpg|png}
                                        ← original file the player downloads
        reference.{jpg|jpeg|png|webp|svg}   ← (optional) your graded version
        meta.json                       ← (optional) {"title": "...", "meta": "..."}

If `meta.json` is missing, the title defaults to "Challenge {id}".
Folders without a cover image are skipped.
"""

import json
import os
import sys
import time
from pathlib import Path

ROOT           = Path(__file__).parent.resolve()
CHALLENGES_DIR = ROOT / "images" / "challenges"
MANIFEST       = CHALLENGES_DIR / "manifest.json"

PREVIEW_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".svg", ".tif", ".tiff"}
SOURCE_EXTS  = {".dng", ".raw", ".cr2", ".cr3", ".nef", ".arw", ".rw2",
                ".raf", ".tif", ".tiff", ".orf", ".jpg", ".jpeg", ".png"}

# ─────────────────────────────────────────────────────────────────
# R2 hosting for source files
# ─────────────────────────────────────────────────────────────────
# RAW / scan source files live in a Cloudflare R2 bucket exposed at
# `sources.grading-game.com`. Cloudflare Pages (where the static site
# is hosted) has a 25 MB per-file limit, so we cannot serve the
# 30-60 MB source files from the same domain — R2 has unlimited
# bandwidth + zero egress fees, so it's both technically necessary
# and the cheapest option.
#
# Local source files in `images/challenges/{id}/source.*` are kept
# only to detect challenges and to compute `sourceSize` for the UI.
# They are listed in .gitignore and should NOT be deployed to Pages.
R2_SOURCE_BASE_URL = "https://sources.grading-game.com/challenges"


# ─────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────

def find_named(folder: Path, basename: str, exts: set) -> Path | None:
    """Find `{basename}.{ext}` (case-insensitive) for any ext in `exts`."""
    target = basename.lower()
    for f in folder.iterdir():
        if not f.is_file():
            continue
        if f.stem.lower() == target and f.suffix.lower() in exts:
            return f
    return None


def to_url(p: Path) -> str:
    """Convert a Path → posix-style url string relative to project root."""
    return str(p.relative_to(ROOT)).replace("\\", "/")


def build_entry(folder: Path) -> dict | None:
    """Build a manifest entry for one folder, or None if no cover."""
    folder_id = folder.name

    cover     = find_named(folder, "cover",     PREVIEW_EXTS)
    reference = find_named(folder, "reference", PREVIEW_EXTS)
    source    = find_named(folder, "source",    SOURCE_EXTS)

    if not cover:
        return None

    meta = {}
    meta_path = folder / "meta.json"
    if meta_path.exists():
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            print(f"  [warn] {folder_id}/meta.json invalid: {e}")

    # Source URL on Cloudflare R2 — built from the source file's extension.
    # We keep the local file only to detect its presence + read its size.
    if source:
        source_url = f"{R2_SOURCE_BASE_URL}/{folder_id}/source{source.suffix.lower()}"
        source_size = source.stat().st_size
    else:
        source_url = None
        source_size = 0

    return {
        "id":           folder_id,
        "title":        meta.get("title") or f"Challenge {folder_id}",
        "meta":         meta.get("meta")  or "—",
        "cover":        to_url(cover),
        "source":       source_url,
        "sourceSize":   source_size,
        "reference":    to_url(reference) if reference else None,
        # Copyright / attribution — surfaced in the UI and the download modal.
        # Defaults are intentionally restrictive so contributors are protected
        # by default; they can loosen via meta.json if they want.
        "photographer": meta.get("photographer") or "unknown",
        "license":      meta.get("license")      or "All Rights Reserved",
        "terms":        meta.get("terms")        or
                        "Personal grading practice only. Do not redistribute or use commercially.",
        # Optional social link — shown as a clickable button on the
        # contributors page. Strip leading '@' or full URL fragments so we
        # only keep the bare handle (e.g. "janedoe", not "@janedoe" or
        # "https://instagram.com/janedoe").
        "instagram":    _clean_handle(meta.get("instagram")),
    }


def _clean_handle(value):
    """Normalize an Instagram handle: strip @, URLs, whitespace; lowercase."""
    if not value:
        return None
    s = str(value).strip()
    if not s:
        return None
    # Strip common URL prefixes
    for prefix in ("https://www.instagram.com/", "http://www.instagram.com/",
                   "https://instagram.com/", "http://instagram.com/",
                   "instagram.com/", "www.instagram.com/"):
        if s.lower().startswith(prefix):
            s = s[len(prefix):]
            break
    # Strip leading @ and any trailing slash or query string
    s = s.lstrip("@").rstrip("/")
    if "?" in s: s = s.split("?", 1)[0]
    if "/" in s: s = s.split("/", 1)[0]
    return s.lower() or None


def collect_entries() -> list[dict]:
    if not CHALLENGES_DIR.exists():
        print(f"[ERROR] Challenges directory not found: {CHALLENGES_DIR}")
        return []
    entries: list[dict] = []
    skipped: list[str]  = []
    for folder in sorted(CHALLENGES_DIR.iterdir()):
        if not folder.is_dir() or folder.name.startswith("."):
            continue
        entry = build_entry(folder)
        if entry:
            entries.append(entry)
        else:
            skipped.append(folder.name)

    # Print a compact summary table (ASCII only — Windows cp1252 chokes on emojis)
    print(f"[dir] {CHALLENGES_DIR}\n")
    if entries:
        for e in entries:
            mb = (e["sourceSize"] / (1024 * 1024)) if e["sourceSize"] else 0.0
            src = e["source"].split("/")[-1] if e["source"] else "-"
            ref = "y" if e["reference"] else " "
            print(f"   {e['id']:>4}  {e['title'][:34]:<34}  cover y  src {src:<14}  ref {ref}  {mb:6.2f} MB")
    if skipped:
        print(f"\n   skipped (no cover.*): {', '.join(skipped)}")
    if not entries and not skipped:
        print("   (folder is empty)")
    return entries


# ─────────────────────────────────────────────────────────────────
# Commands
# ─────────────────────────────────────────────────────────────────

def cmd_build() -> int:
    entries = collect_entries()
    manifest = {
        "version": 1,
        "note": "Auto-generated by build_manifest.py - drop a meta.json next to your photos to set title + meta.",
        "challenges": entries,
    }
    MANIFEST.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"\n[ok] wrote {to_url(MANIFEST)}  -  {len(entries)} challenge(s)")
    return 0


def cmd_list() -> int:
    collect_entries()
    print("\n(--list mode - manifest.json not modified)")
    return 0


def cmd_watch() -> int:
    print(f"[watch] watching {to_url(CHALLENGES_DIR)} - press Ctrl+C to stop\n")
    last_snapshot = None
    try:
        while True:
            snapshot = []
            for f in sorted(CHALLENGES_DIR.rglob("*")):
                if f.name == "manifest.json":
                    continue
                try:
                    snapshot.append((f, f.stat().st_mtime, f.stat().st_size))
                except OSError:
                    pass
            if snapshot != last_snapshot:
                if last_snapshot is not None:
                    print("\n[change detected] rebuilding...\n")
                cmd_build()
                last_snapshot = snapshot
            time.sleep(1.0)
    except KeyboardInterrupt:
        print("\n[stop] watcher stopped")
        return 0


# ─────────────────────────────────────────────────────────────────
# Entrypoint
# ─────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    args = sys.argv[1:]
    if "--help" in args or "-h" in args:
        print(__doc__)
        sys.exit(0)
    if "--list" in args:
        sys.exit(cmd_list())
    if "--watch" in args:
        sys.exit(cmd_watch())
    sys.exit(cmd_build())
