#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
add_pixls_challenge.py
─────────────────────────────────────────────────────────────────
Turns a curated raw.pixls.us file (or any local RAW you have the
rights to) into a ready-to-ship challenge folder:

    images/challenges/{id}/
        source.{ext}     ← downloaded RAW (gitignored, upload to R2)
        cover.jpg        ← neutral "flat" preview generated with rawpy
        meta.json        ← CC0 attribution, category

…then rebuilds manifest.json. The only manual step left is the R2
upload (the script prints exactly what to upload where).

Usage
─────
    # single file, from a raw.pixls.us direct download link:
    python tools/add_pixls_challenge.py "https://raw.pixls.us/getfile.php/..../file.NEF" \
        --photographer "Jane Doe" --category digital

    # or from a file you already downloaded:
    python tools/add_pixls_challenge.py "C:/Downloads/file.RAF" \
        --photographer "Jane Doe" --category negative

    # batch mode — one entry per line: url_or_path | photographer | category
    python tools/add_pixls_challenge.py --from-list picks.txt

Options
───────
    --photographer  Contributor name as credited on raw.pixls.us (required)
    --category      digital | negative          (default: digital)
    --id            Force a specific challenge id (default: next free)
    --title         Optional display title
    --max-edge      Cover max edge in px        (default: 2400)

Licence rules (read me!)
────────────────────────
Only use files raw.pixls.us lists as CC0. The site has a separate
"non-CC0 samples" list — skip those. We credit the contributor in
meta.json anyway, because it's the decent thing to do.
"""

import argparse
import json
import re
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path

ROOT           = Path(__file__).resolve().parent.parent
CHALLENGES_DIR = ROOT / "images" / "challenges"

# Keep in sync with build_manifest.py SOURCE_EXTS
SOURCE_EXTS = {".dng", ".raw", ".cr2", ".cr3", ".nef", ".arw", ".rw2",
               ".raf", ".tif", ".tiff", ".orf", ".jpg", ".jpeg", ".png"}
# Extensions PIL can open directly (no RAW decode needed)
PIL_EXTS    = {".tif", ".tiff", ".jpg", ".jpeg", ".png"}

WARN_SIZE_MB = 80   # medium-format files get heavy — warn, don't block


# ─────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────

def next_free_id() -> str:
    """Highest numeric folder name + 1, zero-padded to 3."""
    best = 0
    if CHALLENGES_DIR.exists():
        for f in CHALLENGES_DIR.iterdir():
            if f.is_dir() and f.name.isdigit():
                best = max(best, int(f.name))
    return f"{best + 1:03d}"


def guess_ext(url_or_path: str) -> str:
    """Extension from the path part of a URL (query string stripped)."""
    clean = url_or_path.split("?", 1)[0].split("#", 1)[0]
    m = re.search(r"(\.[A-Za-z0-9]+)$", clean)
    return m.group(1).lower() if m else ""


def fetch_source(src: str, dest: Path) -> None:
    """Download a URL or copy a local file to dest."""
    if re.match(r"^https?://", src, re.I):
        print(f"  [dl] {src}")
        req = urllib.request.Request(
            src, headers={"User-Agent": "grading-game challenge importer"})
        with urllib.request.urlopen(req) as r, open(dest, "wb") as out:
            shutil.copyfileobj(r, out, length=1024 * 512)
    else:
        local = Path(src)
        if not local.exists():
            raise FileNotFoundError(local)
        print(f"  [copy] {local}")
        shutil.copyfile(local, dest)


def make_cover(source: Path, dest: Path, max_edge: int) -> None:
    """Neutral flat preview: camera WB, no styling — the player's
    starting point, not an interpretation."""
    from PIL import Image
    ext = source.suffix.lower()
    if ext in PIL_EXTS:
        im = Image.open(source)
        im = im.convert("RGB")
    else:
        import rawpy
        with rawpy.imread(str(source)) as raw:
            rgb = raw.postprocess(use_camera_wb=True, output_bps=8)
        im = Image.fromarray(rgb)
    im.thumbnail((max_edge, max_edge), Image.LANCZOS)
    im.save(dest, "JPEG", quality=88, optimize=True, progressive=True)
    print(f"  [cover] {im.size[0]}x{im.size[1]} -> {dest.stat().st_size // 1024} KB")


def write_meta(folder: Path, photographer: str, category: str, title: str) -> None:
    meta = {
        "title":        title or "",
        "meta":         "",
        "photographer": f"{photographer} · raw.pixls.us",
        "license":      "CC0",
        "terms":        ("CC0 / public domain. Source file contributed to "
                         f"raw.pixls.us by {photographer}."),
        "category":     category,
    }
    (folder / "meta.json").write_text(
        json.dumps(meta, indent=4, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"  [meta] CC0 · {photographer} · {category}")


def add_one(src: str, photographer: str, category: str,
            forced_id: str | None, title: str, max_edge: int) -> str | None:
    ext = guess_ext(src)
    if ext not in SOURCE_EXTS:
        print(f"  [skip] unsupported extension '{ext}' for {src}")
        return None

    cid = forced_id or next_free_id()
    folder = CHALLENGES_DIR / cid
    if folder.exists() and any(folder.iterdir()):
        print(f"  [skip] {folder} already exists and is not empty")
        return None
    folder.mkdir(parents=True, exist_ok=True)

    source_path = folder / f"source{ext}"
    fetch_source(src, source_path)

    size_mb = source_path.stat().st_size / (1024 * 1024)
    print(f"  [size] {size_mb:.1f} MB")
    if size_mb > WARN_SIZE_MB:
        print(f"  [warn] heavy file (> {WARN_SIZE_MB} MB) — players on slow "
              "connections will feel it. Consider picking a lighter one.")

    make_cover(source_path, folder / "cover.jpg", max_edge)
    write_meta(folder, photographer, category, title)
    return cid


# ─────────────────────────────────────────────────────────────────
# Entrypoint
# ─────────────────────────────────────────────────────────────────

def main() -> int:
    ap = argparse.ArgumentParser(
        description="Import a CC0 raw.pixls.us file as a challenge.")
    ap.add_argument("source", nargs="?",
                    help="URL or local path of the RAW file")
    ap.add_argument("--photographer", help="contributor name (as on pixls)")
    ap.add_argument("--category", default="digital",
                    choices=["digital", "negative"])
    ap.add_argument("--id", dest="cid", default=None,
                    help="force a challenge id (default: next free)")
    ap.add_argument("--title", default="")
    ap.add_argument("--max-edge", type=int, default=2400)
    ap.add_argument("--from-list", dest="listfile",
                    help="batch file: one 'url | photographer | category' per line")
    args = ap.parse_args()

    jobs: list[tuple[str, str, str]] = []
    if args.listfile:
        for line in Path(args.listfile).read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = [p.strip() for p in line.split("|")]
            if len(parts) < 2:
                print(f"[skip] malformed line: {line}")
                continue
            url, who = parts[0], parts[1]
            cat = parts[2] if len(parts) > 2 and parts[2] else "digital"
            jobs.append((url, who, cat))
    else:
        if not args.source or not args.photographer:
            ap.error("source and --photographer are required "
                     "(or use --from-list)")
        jobs.append((args.source, args.photographer, args.category))

    added: list[str] = []
    for url, who, cat in jobs:
        print(f"\n[challenge] {url}")
        cid = add_one(url, who, cat,
                      args.cid if len(jobs) == 1 else None,
                      args.title if len(jobs) == 1 else "",
                      args.max_edge)
        if cid:
            added.append(cid)

    if not added:
        print("\n[done] nothing added")
        return 1

    # Rebuild the manifest so the new challenges go live locally
    print("\n[manifest] rebuilding…")
    subprocess.run([sys.executable, str(ROOT / "build_manifest.py")],
                   cwd=ROOT, check=True)

    # The one manual step: R2
    print("\n" + "=" * 60)
    print("LAST STEP — upload the source files to R2:")
    print("  Cloudflare dashboard > R2 > your sources bucket")
    for cid in added:
        src = next((CHALLENGES_DIR / cid).glob("source.*"))
        print(f"    upload {src.relative_to(ROOT)}")
        print(f"        as challenges/{cid}/{src.name}")
    print("  (the manifest already points to "
          "sources.grading-game.com/challenges/{id}/source.ext)")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(main())
