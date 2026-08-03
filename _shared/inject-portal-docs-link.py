#!/usr/bin/env python3
"""Add an 'Internal Documentation' link to the existing staff Employee Portal nav
column on every page (inserted right after 'Website Pending Actions'). Idempotent.
Run once after inject-employee-portal-nav.py has already placed the column."""
import os
ROOT = os.path.dirname(os.path.abspath(__file__)).rsplit("/_shared", 1)[0]
ANCHOR = '<a href="/employee-portal.html#pending" target="_blank" rel="noopener">Website Pending Actions</a>'
NEW = '<a href="/employee-portal.html#docs" target="_blank" rel="noopener">Internal Documentation</a>'

def main():
    n = 0
    for dp, dirs, files in os.walk(ROOT):
        if "/.git" in dp:
            dirs[:] = [d for d in dirs if d != ".git"]; continue
        for f in files:
            if not f.endswith(".html"):
                continue
            p = os.path.join(dp, f)
            s = open(p, encoding="utf-8", errors="surrogatepass").read()
            if ANCHOR not in s or "/employee-portal.html#docs" in s:
                continue
            s = s.replace(ANCHOR, ANCHOR + NEW, 1)
            open(p, "w", encoding="utf-8", errors="surrogatepass").write(s)
            n += 1
    print("Internal Documentation nav link added on", n, "pages")

if __name__ == "__main__":
    main()
