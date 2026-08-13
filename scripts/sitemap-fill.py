#!/usr/bin/env python3
"""
Add the pages that were never listed in sitemap.xml, and take the two internal
book-production pages out of Google.

The sitemap listed 328 URLs against 690 pages in the repo. Among the missing
were home.html itself, rtsa-home.html, three current ICX-FieldHawk datasheets
and seventeen DEI user manuals, so the pages a buyer is most likely to want were
the ones Google was least likely to find.

What gets added: the missing home and product-line pages, the missing docs
pages, the eleven book landing pages, and the 243 substantive book chapters.

What stays out: book quizzes and quiz answer keys, front matter, author and
contributor pages, and anything already carrying a noindex meta. Thin pages in
a sitemap dilute the crawl rather than help it.

Separately, two pages left over from producing the scintillator book are live
and marked index,follow: a webmaster deployment note and a raw image-library
listing. Both get a noindex meta and an X-Robots-Tag rule, and neither is added
to the sitemap.

Run from the repository root. Re-running is a no-op.
"""

import json
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = "https://www.berkeleynucleonics.com/"

# Left out of the index entirely: internal production leftovers.
INTERNAL = [
    "books/scintillators/web/WEBMASTER-DEPLOYMENT.html",
    "books/scintillators/figures/scionix/INDEX.html",
]

# Any quiz page, however the book names it. The earlier pattern anchored on
# `quiz-\d+.html` and so let through `quiz-01-why-rf-why-now.html`,
# `quiz-chapter-07.html`, `quiz-11_future.html` and the E/G answer keys - 70 quiz
# pages reached the sitemap. Match the word anywhere in the filename instead.
# `progress.html` is a per-reader tracker with no content of its own.
QUIZ_RE = re.compile(r"(?:^|/)(?:[^/]*quiz[^/]*|progress)\.html$", re.I)
MATTER_RE = re.compile(
    r"(?:^|/)(?:00-front-matter|about-the-authors|appendix-D-contributors)\.html$", re.I
)
ROBOTS_RE = re.compile(r'<meta[^>]+name="robots"[^>]+content="([^"]*)"', re.I)

# priority mirrors what the file already uses: 0.8 line/home, 0.6 docs, 0.5 deep
PRIORITY = [
    (re.compile(r"^(?:home|rtsa-home)\.html$"), "0.8"),
    (re.compile(r"^home-(?:academic|industrial)\.html$"), "0.7"),
    (re.compile(r"^sms-terms\.html$"), "0.5"),
    (re.compile(r"^docs/"), "0.6"),
    (re.compile(r"^books/[^/]+/index\.html$|^books/index\.html$"), "0.6"),
    (re.compile(r"^books/"), "0.5"),
]


def priority(rel):
    for pat, p in PRIORITY:
        if pat.match(rel):
            return p
    return "0.6"


def is_noindex(path):
    m = ROBOTS_RE.search(path.read_text(encoding="utf-8", errors="replace"))
    return bool(m and "noindex" in m.group(1).lower())


def lastmod(rel):
    """The file's own last commit date, rather than a blanket stamp."""
    try:
        d = subprocess.check_output(
            ["git", "log", "-1", "--format=%cs", "--", rel], cwd=ROOT, text=True
        ).strip()
        return d or "2026-08-06"
    except subprocess.CalledProcessError:
        return "2026-08-06"


def mark_internal():
    """noindex the two book-production pages, in the page and at the edge."""
    changed = []
    for rel in INTERNAL:
        path = ROOT / rel
        if not path.is_file():
            print("  !! missing: %s" % rel, file=sys.stderr)
            continue
        s = path.read_text(encoding="utf-8")
        if ROBOTS_RE.search(s):
            new = ROBOTS_RE.sub('<meta name="robots" content="noindex,nofollow">', s, count=1)
        else:
            new = s.replace("<head>", '<head>\n<meta name="robots" content="noindex,nofollow">', 1)
        if new != s:
            path.write_text(new, encoding="utf-8")
            changed.append(rel)

    # and at the edge, so it holds even if the file is served from cache
    vj = ROOT / "vercel.json"
    cfg = json.loads(vj.read_text(encoding="utf-8"))
    headers = cfg.setdefault("headers", [])
    have = {h.get("source") for h in headers}
    added = 0
    for rel in INTERNAL:
        src = "/" + rel
        if src in have:
            continue
        headers.insert(0, {
            "source": src,
            "headers": [{"key": "X-Robots-Tag", "value": "noindex, nofollow"}],
        })
        added += 1
    if added:
        vj.write_text(json.dumps(cfg, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print("noindex: %d pages updated, %d vercel.json rules added" % (len(changed), added))


def main():
    sm_path = ROOT / "sitemap.xml"
    sm = sm_path.read_text(encoding="utf-8")
    listed = set(re.findall(r"<loc>\s*([^<]+?)\s*</loc>", sm))
    listed_paths = {u.split("berkeleynucleonics.com/")[-1].strip("/") for u in listed}

    raw = subprocess.check_output(["git", "ls-files", "-z", "*.html"], cwd=ROOT)
    files = [f for f in raw.decode("utf-8").split("\0") if f and not f.startswith(".claude/")]

    add, skip = [], {"already listed": 0, "noindex": 0, "quiz": 0, "front/back matter": 0,
                     "internal": 0, "fragment": 0}
    for rel in files:
        if rel in listed_paths or rel.replace(".html", "") in listed_paths:
            skip["already listed"] += 1
            continue
        if rel in INTERNAL:
            skip["internal"] += 1
            continue
        if QUIZ_RE.search(rel):
            skip["quiz"] += 1
            continue
        if MATTER_RE.search(rel):
            skip["front/back matter"] += 1
            continue
        if rel.endswith("footer-snippet.html"):
            skip["fragment"] += 1
            continue
        if is_noindex(ROOT / rel):
            skip["noindex"] += 1
            continue
        add.append(rel)

    for k, v in skip.items():
        print("  skipped %-18s %d" % (k, v))
    print("to add: %d (sitemap had %d)" % (len(add), len(listed)))
    if not add:
        print("sitemap already complete")
        return 0

    def group(rel):
        if rel.startswith("docs/"):
            return 1
        if rel.startswith("books/"):
            return 2
        return 0

    add.sort(key=lambda r: (group(r), r))
    lines = []
    for rel in add:
        lines.append(
            "  <url><loc>%s%s</loc><lastmod>%s</lastmod><priority>%s</priority></url>"
            % (SITE, rel, lastmod(rel), priority(rel))
        )

    block = "\n".join(lines)
    sm = sm.replace("</urlset>", block + "\n</urlset>")
    sm_path.write_text(sm, encoding="utf-8")
    print("sitemap.xml now lists %d urls" % len(re.findall(r"<loc>", sm)))
    return 0


if __name__ == "__main__":
    mark_internal()
    raise SystemExit(main())
