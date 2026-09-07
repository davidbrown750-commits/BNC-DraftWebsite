#!/usr/bin/env python3
"""Add a 'Lobby Screens' link to the staff Employee Portal nav column on every page,
inserted right after 'Internal Documentation'. Idempotent.

The nav on this site is physically copied into every HTML page rather than included,
so a one-link change is a sweep. Run after inject-portal-docs-link.py, which places
the anchor this script keys on.

The column itself is wrapped in data-bnc-staff, so the link is hidden by CSS until
_shared/bnc-auth.js confirms a @berkeleynucleonics.com sign-in. That is presentation
only; the dashboard enforces staff access server-side in api/lobby-screens.js.
"""
import os

ROOT = os.path.dirname(os.path.abspath(__file__)).rsplit(os.sep + "_shared", 1)[0]
ANCHOR = '<a href="/employee-portal.html#docs" target="_blank" rel="noopener">Internal Documentation</a>'
NEW = '<a href="/lobby-dashboard/" target="_blank" rel="noopener">Lobby Screens</a>'


def main():
    n = 0
    for dp, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in (".git", "node_modules")]
        for f in files:
            if not f.endswith(".html"):
                continue
            p = os.path.join(dp, f)
            try:
                s = open(p, encoding="utf-8", errors="surrogatepass").read()
            except OSError:
                continue
            if ANCHOR not in s or "/lobby-dashboard/" in s:
                continue
            s = s.replace(ANCHOR, ANCHOR + NEW, 1)
            open(p, "w", encoding="utf-8", errors="surrogatepass").write(s)
            n += 1
    print("Lobby Screens nav link added on", n, "pages")


if __name__ == "__main__":
    main()
