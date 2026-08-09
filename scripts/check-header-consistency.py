#!/usr/bin/env python3
"""
Fail if any page's header has drifted from the reference page's.

This is the guard the site did not have. The header is inlined on every page
rather than pulled from a shared include, so the only thing keeping ~670 copies
identical is that somebody remembers to re-run the sweeps. A page built next
month from a shell copied today will carry today's header for as long as nobody
notices, which is exactly how academy-free-access.html, sms-terms.html and the
Medusa assembly manual ended up still saying "Get a Quote/Demo" a day after the
rest of the site stopped.

Every page is sorted into one of four buckets:

  current   the header matches the reference page's, marker for marker
  stale     the page has a header, but an older one - re-run the sweeps
  missing   the page has no header and is not excused - run install-site-header
  excused   a redirect stub, a fragment, or on the allow-list in
            install-site-header.py, with a reason recorded there

Anything stale or missing is an error.

    python3 scripts/check-header-consistency.py
    python3 scripts/check-header-consistency.py --verbose
"""

import argparse
import importlib.util
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent

# Reuse the installer's notion of what counts as a page, so the two can never
# disagree about which files are excused.
_spec = importlib.util.spec_from_file_location(
    "install_site_header", ROOT / "scripts" / "install-site-header.py"
)
_installer = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_installer)

REFERENCE = _installer.REFERENCE

# Every marker the current header must carry. Each one is a thing that has been
# added or changed by a past sweep, so a page missing any of them predates it.
MARKERS = [
    ('class="sitenav"', "the header element"),
    ('class="ss-field"', "search rebuilt for the left slot"),
    ('class="ss-dots"', "the three animated dots"),
    (">RFQ/Demo<", "the shortened CTA label"),
    ('id="bnc-nav-v2"', "the shared control height and font size"),
    ("function ssClose()", "the dimmed results overlay"),
    ("repeat(6,1fr)", "the six-column results grid"),
    (".ss-b-datasheet", "the colour-coded result badges"),
    ('<a class="nav-trigger">Applications', "the renamed Applications menu"),
    ('id="ss-js"', "the on-site search"),
    ("bnc-emerald.css", "inward-opening Support flyouts"),
    ('id="bnc-nav-mobile-wrap"', "the drawer that fits a handset screen"),
]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    ref = (ROOT / REFERENCE).read_text(encoding="utf-8")
    for marker, why in MARKERS:
        if marker not in ref:
            print(
                "the reference page %s is missing %r (%s) - the check is "
                "calibrated against a page that has itself drifted" % (REFERENCE, marker, why),
                file=sys.stderr,
            )
            return 2

    current = stale = missing = excused = 0
    problems = []

    for rel in _installer.pages():
        src = (ROOT / rel).read_text(encoding="utf-8")

        if rel in _installer.EXEMPT or _installer.is_redirect(src):
            excused += 1
            continue
        if "<html" not in src.lower():
            excused += 1
            continue

        if 'class="sitenav"' not in src:
            missing += 1
            problems.append((rel, "no header at all"))
            continue

        absent = [why for marker, why in MARKERS if marker not in src]
        if absent:
            stale += 1
            problems.append((rel, "missing " + ", ".join(absent)))
        else:
            current += 1
            if args.verbose:
                print("  ok  %s" % rel)

    for rel, why in problems:
        print("  %-58s %s" % (rel, why))

    print(
        "\n%d current, %d stale, %d missing, %d excused" % (current, stale, missing, excused)
    )
    if problems:
        print(
            "\nRe-run the sweeps to fix a stale page:\n"
            "    python3 scripts/header-search-v2.py\n"
            "    python3 scripts/header-polish-v3.py\n"
            "and install-site-header.py --apply for one that has no header yet.\n"
            "If a page is meant to have no header, add it to EXEMPT in\n"
            "scripts/install-site-header.py with the reason."
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
