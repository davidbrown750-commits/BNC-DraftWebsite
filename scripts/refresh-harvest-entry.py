#!/usr/bin/env python3
"""Refresh one or more scripts/page-harvest.json entries from the pages'
current on-disk HTML.

reindex-site-search.py only ever *reads* page-harvest.json - there is no
script in this repo that regenerates it from the live site, so its cached
"words" text for a page silently goes stale the moment that page's content
changes. If you edit a page (most commonly obsolete-products.html, adding a
newly-discontinued model) and then run reindex-site-search.py, the new text
will not reach the search index until that page's harvest entry is refreshed
first. This script does that refresh, for exactly the pages you name, using
the same chrome-stripping approach the reindexer already applies elsewhere.

Usage:
    python scripts/refresh-harvest-entry.py obsolete-products.html
    python scripts/refresh-harvest-entry.py obsolete-products.html docs/some-other-page.html

Run this, THEN run scripts/reindex-site-search.py.
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path.cwd()
HARVEST = ROOT / "scripts" / "page-harvest.json"

CHROME_RE = re.compile(r"<header\b.*?</header>|<footer\b.*?</footer>|<nav\b.*?</nav>", re.S | re.I)
SCRIPT_STYLE_RE = re.compile(r"<script\b.*?</script>|<style\b.*?</style>", re.S | re.I)
TAG_RE = re.compile(r"<[^>]+>")


def extract_words(html):
    html = SCRIPT_STYLE_RE.sub(" ", html)
    html = CHROME_RE.sub(" ", html)
    text = TAG_RE.sub(" ", html)
    text = re.sub(r"&amp;", "&", text)
    text = re.sub(r"&rsquo;|&#8217;", "'", text)
    text = re.sub(r"&[a-z]+;|&#\d+;", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def main(rel_paths):
    if not HARVEST.exists():
        print("missing harvest file: %s (run this from the repo root)" % HARVEST, file=sys.stderr)
        return 1
    pages = json.load(open(HARVEST, encoding="utf-8"))
    by_url = {p.get("u"): p for p in pages}
    status = 0
    for rel_path in rel_paths:
        entry = by_url.get(rel_path)
        if entry is None:
            print("no harvest entry for %s (check the path matches its 'u' field)" % rel_path, file=sys.stderr)
            status = 1
            continue
        page_file = ROOT / rel_path
        if not page_file.exists():
            print("no such file: %s" % page_file, file=sys.stderr)
            status = 1
            continue
        html = page_file.read_text(encoding="utf-8")
        old_len = len(entry.get("words", ""))
        entry["words"] = extract_words(html)
        print("%s: words %d -> %d chars" % (rel_path, old_len, len(entry["words"])))
    json.dump(pages, open(HARVEST, "w", encoding="utf-8"), ensure_ascii=False)
    return status


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    sys.exit(main(sys.argv[1:]))
