#!/usr/bin/env python3
"""
Make the standard site header sit correctly on the web-book pages.

The books are a different animal from the rest of the site. Their body is a
centred reading column (max-width 820px, or 780px on the two books that use
_bnc-style.css), so a header placed inside it renders as a short strip floating
in the middle of the bar's own background rather than spanning the window. They
also carry three pieces of their own pinned chrome that all assume nothing is
above them: the reader banner, the in-book search button, and the riids topbar.

This adds one stylesheet, appended after bnc-nav-v2 so it wins, that:

  * takes the header out of the reading column and pins it across the window,
    and pays back the space it now occupies as padding on the body;
  * pushes the book's own pinned chrome down below the bar;
  * gives every anchor target a scroll margin, so the 198 cross-file fragment
    links in the tables of contents no longer land under the bar.

Run from the repository root:

    python3 scripts/fit-book-header.py            # report only
    python3 scripts/fit-book-header.py --apply
"""

import argparse
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent

# Desktop bar is 66px plus its 1px rule. Below 1040px bnc-mobile-nav-fix lets the
# bar grow to fit, so the offsets there are measured against its min-height.
BAR = 67
BAR_SM = 61

BOOK_FIT_CSS = """<style id="sitenav-book-fit">/* the site bar, fitted to a book page */
/* The reading column is a centred max-width body, so the bar has to leave it to
   span the window. Fixed rather than sticky: it is immune to whatever width,
   margin or padding each book gives its body, and the books disagree. */
.sitenav{position:fixed;top:0;left:0;right:0;width:auto;max-width:none;margin:0;}
body{padding-top:%(bar)dpx;}
/* The books pin three things of their own, all of them at the top, all of them
   written when nothing was above them. */
.bnc-top-banner{top:%(bar)dpx!important;}
.bnc-search-btn{top:%(btn)dpx!important;}
.topbar{top:%(bar)dpx!important;z-index:40!important;}
/* 1,505 headings carry an id and the tables of contents link across files into
   them, so without this every one of those links lands under the bar. */
[id]{scroll-margin-top:%(anchor)dpx;}
@media(max-width:1040px){
  body{padding-top:%(barsm)dpx;}
  .bnc-top-banner{top:%(barsm)dpx!important;}
  .bnc-search-btn{top:%(btnsm)dpx!important;}
  .topbar{top:%(barsm)dpx!important;}
  [id]{scroll-margin-top:%(anchorsm)dpx;}
}
@media(max-width:1040px){
  /* Pre-existing, and nothing to do with the bar: a few chapters carry five and
     six column tables that are wider than a phone, and a table that will not fit
     makes mobile Chrome shrink the whole page instead. Measured on the riids
     chapter: 517px of table on a 360px screen took the layout viewport to 531px.
     Let the table scroll inside its own box and the page stays at 1:1. */
  /* The books disagree about their content wrapper (main.wrap, div.wrap,
     div.shell, or none), so match on the table itself. There are no tables
     in the header or the footer for this to catch by accident. */
  body table{display:block;overflow-x:auto;max-width:100%%;}
}
@media print{.sitenav,.bnc-top-banner,.bnc-search-btn{display:none!important;}body{padding-top:0;}}
</style>""" % {
    "bar": BAR,
    "barsm": BAR_SM,
    "btn": BAR + 14,
    "btnsm": BAR_SM + 14,
    "anchor": BAR + 18,
    "anchorsm": BAR_SM + 14,
}

MARKER = 'id="sitenav-book-fit"'


def pages() -> list:
    raw = subprocess.check_output(["git", "ls-files", "-z", "books/*.html"], cwd=ROOT)
    return [f for f in raw.decode("utf-8").split("\0") if f]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    changed = skipped = 0
    for rel in pages():
        path = ROOT / rel
        src = path.read_text(encoding="utf-8")
        if 'class="sitenav"' not in src:
            skipped += 1
            continue
        if MARKER in src:
            a = src.find('<style id="sitenav-book-fit">')
            b = src.find("</style>", a) + len("</style>")
            if src[a:b] == BOOK_FIT_CSS:
                skipped += 1
                continue
            src = src[:a] + src[b:]
        k = src.rfind("</body>")
        if k < 0:
            print("  !! no </body>: %s" % rel, file=sys.stderr)
            skipped += 1
            continue
        new = src[:k] + BOOK_FIT_CSS + "\n" + src[k:]
        changed += 1
        if args.apply:
            path.write_text(new, encoding="utf-8")

    print("%s %d book pages, %d untouched" % ("fitted" if args.apply else "would fit", changed, skipped))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
