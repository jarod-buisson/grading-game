#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
update_head.py
─────────────────────────────────────────────────────────────────
Propagate the contents of `partials/head-common.html` to every
*.html page in the project root.

Each page's <head> must contain the markers below, which act as
the "slot" the partial fills in. Everything between them is
replaced on each run. The markers themselves stay in place so
this script can be re-run any number of times.

    <head>
        <!-- :head-common-start: -->
        ... [auto-generated, do not hand-edit] ...
        <!-- :head-common-end: -->

        <title>page-specific</title>
        <link rel="stylesheet" href="page-specific.css">
    </head>

Usage
─────
    python update_head.py           # update all pages
    python update_head.py --check   # report what would change, don't write
"""
import re
import sys
from pathlib import Path

ROOT    = Path(__file__).parent.resolve()
PARTIAL = ROOT / "partials" / "head-common.html"

START_MARKER = "<!-- :head-common-start: -->"
END_MARKER   = "<!-- :head-common-end: -->"

PATTERN = re.compile(
    re.escape(START_MARKER) + r".*?" + re.escape(END_MARKER),
    re.DOTALL,
)


def main():
    check_only = "--check" in sys.argv[1:]

    if not PARTIAL.exists():
        print(f"[ERROR] Partial not found: {PARTIAL}")
        return 1

    partial_text = PARTIAL.read_text(encoding="utf-8").strip()
    # Replacement keeps the markers, with proper indentation inside <head>
    indent = "    "
    replacement = (
        START_MARKER + "\n"
        + "\n".join(indent + line if line.strip() else line
                    for line in partial_text.splitlines())
        + "\n" + indent + END_MARKER
    )

    pages = sorted(ROOT.glob("*.html"))
    if not pages:
        print("[warn] no *.html pages found in project root")
        return 0

    updated, skipped, missing = [], [], []

    for page in pages:
        text = page.read_text(encoding="utf-8")
        if START_MARKER not in text or END_MARKER not in text:
            missing.append(page.name)
            continue

        new_text, n = PATTERN.subn(replacement, text)
        if n == 0:
            skipped.append(page.name)
            continue

        if new_text == text:
            skipped.append(page.name)
            continue

        if check_only:
            updated.append(page.name)
        else:
            page.write_text(new_text, encoding="utf-8")
            updated.append(page.name)

    # ─── Summary ───
    print(f"[head] partial: {PARTIAL.relative_to(ROOT)}")
    print(f"[head] pages found: {len(pages)}")
    if updated:
        verb = "would update" if check_only else "updated"
        print(f"\n  {verb}:")
        for p in updated:
            print(f"    [ok]  {p}")
    if skipped:
        print(f"\n  unchanged:")
        for p in skipped:
            print(f"    [..]  {p}")
    if missing:
        print(f"\n  MISSING MARKERS (won't be touched until you add them):")
        for p in missing:
            print(f"    [!!]  {p}   -- add the start/end markers in <head>")
    print()
    if check_only:
        print("(--check mode - no files modified)")
    else:
        print(f"[done] {len(updated)} page(s) updated, {len(skipped)} unchanged, {len(missing)} missing markers")
    return 0


if __name__ == "__main__":
    sys.exit(main())
