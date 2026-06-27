#!/usr/bin/env python3
"""inject-employee-portal-nav.py — add the staff-only "Employee Portal" column to the
Support dropdown on every page. The column is gated by `data-bnc-staff` (bnc-auth.js
reveals it only for @berkeleynucleonics.com logins). Idempotent: skips pages already done.

  python _shared/inject-employee-portal-nav.py

Re-run safely after adding new pages.
"""
import re, subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

COL = ('<div class="nav-grp2" data-bnc-staff>Employee Portal<span class="nc">&#8250;</span>'
       '<div class="nav-sub">'
       '<a href="/employee-portal.html#visitors" target="_blank" rel="noopener">Website Visitor Review</a>'
       '<a href="/employee-portal.html#pending" target="_blank" rel="noopener">Website Pending Actions</a>'
       '</div></div>')

# Match the Support dropdown opening (tolerant of whitespace) and capture it so we can
# insert our column as the first nav-grp2 inside it.
ANCHOR = re.compile(r'(Support\s*&#9662;\s*</a>\s*<div class="nav-drop nav-casc">)')

def discover():
    try:
        out = subprocess.run(["rg", "-l", "-F", "Support &#9662;", str(ROOT)],
                             capture_output=True, text=True, timeout=60)
        files = [Path(p) for p in out.stdout.splitlines() if p.strip()]
        if files:
            return files
    except Exception:
        pass
    return [p for p in ROOT.rglob("*.html") if "_shared" not in p.parts]

def main():
    edited = skipped = nomatch = 0
    for f in discover():
        try:
            txt = f.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        if "data-webmaster" in COL:  # guard against accidental marker reuse
            pass
        if 'data-bnc-staff' in txt and 'employee-portal.html' in txt:
            skipped += 1
            continue
        new, n = ANCHOR.subn(lambda m: m.group(1) + COL, txt, count=1)
        if n == 0:
            nomatch += 1
            continue
        f.write_text(new, encoding="utf-8")
        edited += 1
    print(f"edited={edited} skipped(already done)={skipped} no-support-menu={nomatch}")

if __name__ == "__main__":
    main()
