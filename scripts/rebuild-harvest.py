#!/usr/bin/env python3
"""Regenerate scripts/page-harvest.json from the pages on disk.

WHY THIS EXISTS
reindex-site-search.py only ever READS the harvest, and refresh-harvest-entry.py can only
refresh a page that is already in it - it errors on anything new. So nothing in the repo could
bring the harvest back in line with the site. Two things went wrong as a result:

  1. Every page edited since the harvest was last written kept its OLD cached text, so the
     search index rebuilt happily from stale input and nobody could tell.
  2. Pages added since then were never harvested at all, so they could never be indexed no
     matter how many times the reindexer ran. 701 pages on disk against 680 harvested.

This walks the site and adds the pages that were missing, so they can finally be indexed.

IT ONLY ADDS. IT DOES NOT REFRESH EXISTING TEXT.
Refreshing was investigated and deliberately left out, because the diff could not be trusted
to mean what it appeared to mean. A first pass reported 661 of 701 pages "changed", which is
not a believable amount of real editing. Two extractor artefacts turned out to be responsible:

  * the browser title and "Skip to main content" were being prepended to every page, and
  * HTML entities were being deleted rather than decoded, so every arrow and dash in a page
    read as a change.

Fixing both moved 151 pages to byte-identical, and that is what makes the rest trustworthy:
an extractor that reproduces 151 existing entries exactly is not drifting. The remaining
differences are real. 162 pages hold text that is a strict PREFIX of the current page, so they
were truncated when first harvested; the books and manuals have genuinely grown since.

Only two pages appear to shrink, and neither lost anything. Their cached text still carried the
whole site nav ("Skip to main content Search Home Products ..."), because they were harvested
by a run that did not strip chrome. Removing it is the point, not a regression.

Refresh is still opt-in behind --refresh. Rewriting every entry that feeds the live site's
search should be a decision someone makes, not a side effect of running a script.

WHAT IT WILL NOT TOUCH
Curated fields (title, description, kind, product line) are preserved on pages that already
have them. Those have been corrected by hand over time - the reindexer's own comments describe
rescuing titles that were really filenames - and regenerating them from scratch would quietly
undo that work. Only `words` is always recomputed, because it is purely derived.

Pages carrying a noindex robots tag are left out, which is how the site says a page is not for
search. That exclusion is honoured rather than second-guessed.

  python scripts/rebuild-harvest.py            # report what would change
  python scripts/rebuild-harvest.py --write
"""
import argparse
import html
import json
import os
import pathlib
import re
import sys

ROOT = pathlib.Path.cwd()
HARVEST = ROOT / "scripts" / "page-harvest.json"

CHROME_RE = re.compile(r"<header\b.*?</header>|<footer\b.*?</footer>|<nav\b.*?</nav>", re.S | re.I)
SCRIPT_STYLE_RE = re.compile(r"<script\b.*?</script>|<style\b.*?</style>", re.S | re.I)
TAG_RE = re.compile(r"<[^>]+>")
NOINDEX_RE = re.compile(r'name=["\']robots["\'][^>]*content=["\'][^"\']*noindex', re.I)
CANONICAL_RE = re.compile(r'rel=["\']canonical["\'][^>]*href=["\']([^"\']+)', re.I)

# A page shorter than this is a stub, not an answer. docs/press-article.html is the case that
# prompted it: 195 characters saying the article has not been moved to the new site yet. Putting
# that in front of a searcher costs them a click and gives them nothing back.
MIN_NEW_CHARS = 300

# Fragments and build output, not pages a person would ever search for.
SKIP_PATH = re.compile(
    r"(^|/)(_shared|figures|node_modules)/|"
    r"snippet|WEBMASTER|/INDEX\.html$|_template|\.bak\.html$",
    re.I,
)


def extract_words(markup):
    """Chrome-stripping for pages being added for the first time.

    Starts from what refresh-harvest-entry.py does, then drops the leading browser title and
    skip-link. Existing harvest entries begin at the page's own heading, and a new entry that
    opened with "... | Berkeley Nucleonics Skip to main content" would rank differently from
    every page around it for no reason a searcher could see.
    """
    markup = SCRIPT_STYLE_RE.sub(" ", markup)
    markup = CHROME_RE.sub(" ", markup)
    text = TAG_RE.sub(" ", markup)
    # Decode entities properly rather than deleting them. The old approach turned every
    # &[a-z]+; into a space, which quietly ate the arrows and dashes the existing entries
    # actually contain, so pages looked edited when only the extractor had changed.
    text = html.unescape(text)
    text = re.sub(r"\s+", " ", text).strip()
    return re.sub(r"^.*?Skip to main content\s*", "", text, count=1).strip()


def first(pattern, markup, group=1):
    m = re.search(pattern, markup, re.I | re.S)
    return (m.group(group) or "").strip() if m else ""


def guess_kind(url):
    low = url.lower()
    if "/books/" in low or low.startswith("books/"):
        return "Book" if low.endswith("/index.html") else "Book Chapter"
    if "datasheet" in low:
        return "Data Sheet"
    if "manual" in low or "handbook" in low:
        return "User Manual"
    if "/ufaq/" in low or "faq" in low:
        return "FAQ"
    if "/docs/" in low:
        return "Application Brief"
    return "Company"


def guess_line(url, text):
    """Product line slug, matching the values already in the harvest."""
    hay = (url + " " + text[:1500]).lower()
    for needles, slug in [
        (("icx", "fieldhawk", "rtsa", "spectrum analyz"), "rtsa"),
        (("arbitrary waveform", "awg"), "awg"),
        (("pulse generator", "delay generator", "pdg"), "pdg"),
        (("scintillat", "cebr3", "labr3"), "scintiq"),
        (("isotope", "riid", "sam 940"), "riid"),
        (("signal generator", "phase noise", "rfs-"), "rfsg"),
        (("pulser", "high voltage", "pvx", "dei"), "dei"),
    ]:
        if any(n in hay for n in needles):
            return slug
    return ""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--refresh", action="store_true",
                    help="also update the cached text of pages already in the harvest")
    args = ap.parse_args()

    if not HARVEST.exists():
        print("missing harvest file: %s (run from the repo root)" % HARVEST, file=sys.stderr)
        return 1

    pages = json.load(open(HARVEST, encoding="utf-8"))
    by_url = {p.get("u"): p for p in pages}

    added, refreshed, unchanged, skipped_noindex, skipped_path = [], [], 0, [], 0
    skipped_canonical, skipped_thin = [], []

    for dirpath, dirnames, filenames in os.walk(ROOT):
        if ".git" in dirpath:
            continue
        for name in sorted(filenames):
            if not name.endswith(".html"):
                continue
            rel = os.path.relpath(os.path.join(dirpath, name), ROOT).replace("\\", "/")
            if SKIP_PATH.search(rel):
                skipped_path += 1
                continue
            try:
                markup = (ROOT / rel).read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            if NOINDEX_RE.search(markup):
                if rel not in by_url:
                    skipped_noindex.append(rel)
                continue

            words = extract_words(markup)
            entry = by_url.get(rel)
            if entry is None:
                # Respect the page's own canonical. The two -full.html handbooks are
                # single-page copies of handbooks that are already indexed, which is why they
                # were never in the sitemap either. Indexing them would put a second, 2.3 MB
                # result next to the real one and split the traffic between them.
                canon = CANONICAL_RE.search(markup)
                if canon:
                    target = canon.group(1).split("berkeleynucleonics.com/")[-1].split("#")[0]
                    if target and target != rel and (ROOT / target).exists():
                        skipped_canonical.append((rel, target))
                        continue
                if len(words) < MIN_NEW_CHARS:
                    skipped_thin.append((rel, len(words)))
                    continue
                title = first(r"<title[^>]*>(.*?)</title>", markup) or name
                title = re.sub(r"\s*\|\s*Berkeley Nucleonics\s*$", "", title).strip()
                added.append(rel)
                if args.write:
                    pages.append({
                        "u": rel,
                        "t": title,
                        "d": first(r'name=["\']description["\'][^>]*content=["\'](.*?)["\']', markup),
                        "og": first(r'property=["\']og:image["\'][^>]*content=["\'](.*?)["\']', markup),
                        "h1": TAG_RE.sub("", first(r"<h1[^>]*>(.*?)</h1>", markup)).strip(),
                        "firstimg": first(r'<img[^>]+src=["\'](.*?)["\']', markup),
                        "kind": guess_kind(rel),
                        "line": guess_line(rel, words),
                        "words": words,
                    })
            elif entry.get("words") != words:
                refreshed.append((rel, len(entry.get("words") or ""), len(words)))
                if args.refresh and args.write:
                    entry["words"] = words
            else:
                unchanged += 1

    print("pages added   : %d" % len(added))
    for rel in added[:12]:
        print("    + %s" % rel)
    if len(added) > 12:
        print("    ... and %d more" % (len(added) - 12))
    verb = "refreshed" if args.refresh else "DIFFER from cache (not applied; pass --refresh)"
    print("text %s: %d page(s)" % (verb, len(refreshed)))
    for rel, before, after in sorted(refreshed, key=lambda r: -abs(r[2] - r[1]))[:8]:
        print("    ~ %-58s %d -> %d chars" % (rel[:58], before, after))
    print("unchanged     : %d" % unchanged)
    print("skipped noindex: %d   skipped fragments/artifacts: %d"
          % (len(skipped_noindex), skipped_path))
    # Named, never silent: a page left out of search should be a visible decision.
    for rel, target in skipped_canonical:
        print("    canonical -> %s, so not indexed: %s" % (target, rel))
    for rel, n in skipped_thin:
        print("    only %d chars of text, too thin to index: %s" % (n, rel))

    if args.write:
        json.dump(pages, open(HARVEST, "w", encoding="utf-8"), ensure_ascii=False)
        print("\nwrote %s (%d entries)" % (HARVEST, len(pages)))
        print("Next: python scripts/reindex-site-search.py")
    else:
        print("\nDry run. Re-run with --write.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
