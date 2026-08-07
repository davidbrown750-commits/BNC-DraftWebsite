#!/usr/bin/env python3
"""
Give the book chapters whose <title> is just their filename a real one.

55 chapter pages carry <title>02-rf-fundamentals</title> while the page itself
opens with <h1>2. RF Fundamentals: Time and Frequency Domains</h1>. That is what
Google reads, and it is what the search result tile was showing.

The new title is the h1, trimmed of its leading chapter number, followed by the
book's name, kept under the 60-character limit.

Run from the repository root. Re-running is a no-op.
"""

import html
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent

TITLE_RE = re.compile(r"<title>(.*?)</title>", re.S | re.I)
H1_RE = re.compile(r"<h1[^>]*>(.*?)</h1>", re.S | re.I)
TAGS_RE = re.compile(r"<[^>]+>")
# a title that is really a filename: no spaces, and kebab or snake cased
SLUGGY_RE = re.compile(r"^[0-9A-Za-z]+([-_][0-9A-Za-z]+)+$")


def text(frag):
    return re.sub(r"\s+", " ", html.unescape(TAGS_RE.sub(" ", frag))).strip()


def book_names():
    """Short name per book, from each book's landing page."""
    names = {}
    for idx in sorted(ROOT.glob("books/*/index.html")):
        s = idx.read_text(encoding="utf-8", errors="replace")
        m = TITLE_RE.search(s)
        t = text(m.group(1)) if m else ""
        t = re.sub(r"\s*\|\s*(Berkeley Nucleonics.*|BNC)$", "", t).strip()
        t = re.sub(r"^(The\s+)?Nuts (and|&) Bolts of\s+", "", t).strip()
        t = re.sub(r"\s*[-–]\s*(Front Matter|Contents).*$", "", t).strip()
        names[idx.parent.name] = t
    return names


def main():
    names = book_names()
    raw = subprocess.check_output(["git", "ls-files", "-z", "books/*.html"], cwd=ROOT)
    files = [f for f in raw.decode("utf-8").split("\0") if f and "/html/" in f]

    fixed, skipped = 0, 0
    for rel in files:
        path = ROOT / rel
        s = path.read_text(encoding="utf-8")
        m = TITLE_RE.search(s)
        if not m:
            skipped += 1
            continue
        cur = text(m.group(1))
        if not SLUGGY_RE.match(cur):
            skipped += 1
            continue

        h = H1_RE.search(s)
        heading = text(h.group(1)) if h else ""
        # drop a leading "2." / "Chapter 7 -" style number, the book name carries context
        heading = re.sub(r"^(Chapter\s+\d+\s*[-:–]\s*|\d+(\.\d+)*\.?\s+)", "", heading).strip()
        if not heading:
            print("  !! no usable h1: %s" % rel, file=sys.stderr)
            skipped += 1
            continue

        book = names.get(rel.split("/")[1], "")
        title = "%s | %s" % (heading, book) if book else heading
        if len(title) > 60:
            title = heading if len(heading) <= 60 else heading[:57].rsplit(" ", 1)[0] + "..."

        s = TITLE_RE.sub(lambda _m: "<title>%s</title>" % html.escape(title, quote=False), s, count=1)
        path.write_text(s, encoding="utf-8")
        fixed += 1

    print("retitled %d chapters, left %d alone" % (fixed, skipped))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
