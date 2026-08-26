#!/usr/bin/env python3
"""Teach the on-site search a Blog Post result type.

The press room is 136 articles that had no badge of their own, so once they were
indexed they would all have read "Product" in slate grey next to the datasheets.
This adds the category, its colour, and its icon, and it guarantees one press
article a place in the first screen of results the same way a datasheet, a video
and a technical brief already get one.

The engine lives inline in index.html under <script id="ss-js"> and is copied to
every page by reindex-site-search.py, so it is edited here once. The stylesheet
is per page, so the colour rule is rolled across all of them.

Run from the repository root. Re-running is a no-op.
"""

import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent

BADGE = "Blog Post"
COLOUR = "#0d9488"          # teal: the one hue the other eight badges leave free
ICON = (
    "\"" + BADGE + "\":\"<svg viewBox='0 0 24 24' fill='none' stroke='#37b6f0' "
    "stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'>"
    "<path d='M4 6a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v12a2 2 0 0 0 2 2H6a2 2 0 0 1-2-2z'/>"
    "<path d='M17 8h1.5A1.5 1.5 0 0 1 20 9.5V18'/>"
    "<path d='M7.5 8h6M7.5 11.5h6M7.5 15h3.5'/></svg>\","
)


def patch_engine():
    p = ROOT / "index.html"
    s = original = p.read_text(encoding="utf-8")

    # 1. the category itself. "Blog Post" is tested before "book" only for
    #    readability; the two strings do not overlap.
    hook = 'if(t.indexOf("faq")>=0)return "FAQ";'
    add = 'if(t.indexOf("blog")>=0)return "Blog Post";'
    if add not in s:
        assert hook in s, "ssgBadge() not found"
        s = s.replace(hook, hook + add, 1)

    # 2. its icon, shown when an article has no artwork of its own
    icon_hook = 'var SSG_ICONS={'
    if '"Blog Post":"<svg' not in s:
        assert icon_hook in s, "SSG_ICONS not found"
        s = s.replace(icon_hook, icon_hook + ICON, 1)

    # 3. a reserved slot. buildTiles() already keeps one datasheet, one video,
    #    one technical brief and one FAQ visible before it fills the rest by
    #    score, so a whole content type cannot be crowded out by a strong run of
    #    one other type. The press room gets the same guarantee.
    filt = ('var blogs=docTiles.filter(function(t){return t.badge==="Blog Post";});')
    sheets_hook = 'var sheets=docTiles.filter(function(t){return t.badge==="Datasheet";});'
    if 'var blogs=docTiles' not in s:
        assert sheets_hook in s, "buildTiles() filters not found"
        s = s.replace(sheets_hook, sheets_hook + filt, 1)
    take_hook = 'take(faqTiles,1);'
    if 'take(blogs,1);' not in s:
        assert take_hook in s, "buildTiles() take chain not found"
        s = s.replace(take_hook, take_hook + 'take(blogs,1);', 1)

    if s != original:
        p.write_text(s, encoding="utf-8")
        print("index.html: engine taught the %s category" % BADGE)
        return True
    print("index.html: engine already knows %s" % BADGE)
    return False


def patch_css():
    """One colour per category, rolled across every page that carries search."""
    anchor = ".ss-gbadge.ss-b-product{background:#475569;}"
    rule = ".ss-gbadge.ss-b-blog-post{background:%s;}" % COLOUR
    raw = subprocess.check_output(["git", "ls-files", "-z", "*.html"], cwd=ROOT)
    files = [f for f in raw.decode("utf-8").split("\0") if f]
    changed = 0
    for rel in files:
        p = ROOT / rel
        try:
            s = p.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        if anchor not in s or rule in s:
            continue
        # the blog rule sits with the other eight, above the product default so
        # the cascade order stays the order the categories are listed in
        p.write_text(s.replace(anchor, rule + "\n" + anchor, 1), encoding="utf-8")
        changed += 1
    print("badge colour %s added on %d pages" % (COLOUR, changed))
    return changed


if __name__ == "__main__":
    patch_engine()
    patch_css()
    sys.exit(0)
