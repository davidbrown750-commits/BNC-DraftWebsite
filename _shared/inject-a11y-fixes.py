#!/usr/bin/env python3
"""
Close the remaining WCAG 2.1 AA gaps on the BNC site.

The sitewide baseline (skip link, visible focus, #main landmark, .sr-only,
reduced-motion) is already in place via _shared/inject-a11y.py. This pass
handles what an audit on 2026-08-06 found still open:

  1. 48 <img> inside <figure> that have a <figcaption> but no alt attribute.
     The caption is already the text alternative and is programmatically
     associated, so these get alt="" rather than a duplicate of the caption -
     otherwise a screen reader announces the same sentence twice. Descriptions
     of the plotted data are deliberately NOT invented; the caption is the
     author's own wording and stays the single source of truth.

  2. 2 illustrative article images with no caption, which get real descriptive
     alt text written from the actual artwork.

  3. 2 genuinely unlabeled form fields (of 453 sitewide) get aria-label.

  4. The one failing text colour: #8a94a3 on white is 3.07:1, below the 4.5:1
     AA threshold for normal text. Replaced with #6b7480 (4.74:1), the nearest
     grey that passes. Only `color:` declarations are touched, never borders
     or backgrounds.

Safe to re-run; every edit is guarded. HTML comments are ignored so commented
-out markup is never rewritten.

    python3 _shared/inject-a11y-fixes.py --dry-run
    python3 _shared/inject-a11y-fixes.py
"""

import argparse
import os
import re
import sys

CHROME = '<header class="sitenav">'

OLD_GREY = "8a94a3"
NEW_GREY = "6b7480"          # 4.74:1 on white, passes WCAG AA for normal text

# Illustrative artwork with no caption. Alt written from the actual images.
ART_ALT = {
    "art-ew-hero2.png":
        "A satellite ground station at night: a large parabolic dish antenna, a "
        "smaller dish, and a long lattice antenna array on open grassland beneath "
        "the Milky Way, with a glowing arc tracing a signal path across the horizon.",
    "art-ew-field2.png":
        "A mobile radar system deployed at night in a rural field: a truck-mounted "
        "planar radar antenna and a mast-mounted sensor, with concentric arcs and a "
        "beam sweeping outward over distant farmland and hills.",
}

# Genuinely unlabeled form fields -> accessible names.
FIELD_LABELS = {
    "mcaspec": "MCA model detail",
    "sd-q": "Filter drivers and software",
}


def comment_spans(s):
    return [(m.start(), m.end()) for m in re.finditer(r"<!--.*?-->", s, re.S)]


def in_comment(pos, spans):
    return any(a <= pos < b for a, b in spans)


def fix_captioned_figures(s, spans):
    """alt="" for <img> that sit in a <figure> whose <figcaption> describes them."""
    count = 0
    out = []
    last = 0
    for m in re.finditer(r"<figure\b[^>]*>(.*?)</figure>", s, re.I | re.S):
        if in_comment(m.start(), spans):
            continue
        block = m.group(0)
        if "<figcaption" not in block.lower():
            continue
        new_block, n = re.subn(
            r"(<img\b(?![^>]*\balt\s*=)[^>]*?)(\s*/?>)",
            r'\1 alt=""\2',
            block,
            flags=re.I,
        )
        if n:
            out.append(s[last:m.start()])
            out.append(new_block)
            last = m.end()
            count += n
    out.append(s[last:])
    return "".join(out), count


def fix_art_images(s):
    count = 0
    for fname, alt in ART_ALT.items():
        pat = re.compile(
            r"(<img\b(?![^>]*\balt\s*=)[^>]*src\s*=\s*[\"'][^\"']*"
            + re.escape(fname) + r"[\"'][^>]*?)(\s*/?>)",
            re.I,
        )
        s, n = pat.subn(lambda mm: mm.group(1) + ' alt="' + alt + '"' + mm.group(2), s)
        count += n
    return s, count


def fix_field_labels(s):
    count = 0
    for fid, label in FIELD_LABELS.items():
        pat = re.compile(
            r"(<(?:input|select|textarea)\b(?![^>]*\baria-label\s*=)[^>]*\bid\s*=\s*[\"']"
            + re.escape(fid) + r"[\"'][^>]*?)(\s*/?>)",
            re.I,
        )
        s, n = pat.subn(lambda mm: mm.group(1) + ' aria-label="' + label + '"' + mm.group(2), s)
        count += n
    return s, count


def fix_contrast(s):
    # Only recolour text. Borders and backgrounds are left alone.
    pat = re.compile(r"(color\s*:\s*#)" + OLD_GREY, re.I)
    return pat.subn(r"\g<1>" + NEW_GREY, s)


def process(path):
    with open(path, encoding="utf-8", errors="replace") as fh:
        original = fh.read()
    if CHROME not in original:
        return None
    s = original
    spans = comment_spans(s)

    s, c_fig = fix_captioned_figures(s, spans)
    s, c_art = fix_art_images(s)
    s, c_lbl = fix_field_labels(s)
    s, c_col = fix_contrast(s)

    if s == original:
        return None
    notes = []
    if c_fig: notes.append("%d figure alt" % c_fig)
    if c_art: notes.append("%d art alt" % c_art)
    if c_lbl: notes.append("%d aria-label" % c_lbl)
    if c_col: notes.append("%d contrast" % c_col)
    return s, "; ".join(notes)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    skip = {".git", ".claude", "node_modules", "books"}
    changed = 0
    totals = {}
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in skip]
        for fn in sorted(filenames):
            if not fn.endswith(".html"):
                continue
            path = os.path.join(dirpath, fn)
            res = process(path)
            if not res:
                continue
            new, notes = res
            changed += 1
            print("  %-56s %s" % (os.path.relpath(path, root), notes))
            for part in notes.split("; "):
                n, k = part.split(" ", 1)
                totals[k] = totals.get(k, 0) + int(n)
            if not args.dry_run:
                with open(path, "w", encoding="utf-8") as fh:
                    fh.write(new)

    print("\n%s: %d file(s) changed" % ("DRY RUN" if args.dry_run else "applied", changed))
    for k, v in sorted(totals.items()):
        print("   %-12s %d" % (k, v))
    return 0


if __name__ == "__main__":
    sys.exit(main())
