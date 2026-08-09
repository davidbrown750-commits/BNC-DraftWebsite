#!/usr/bin/env python3
"""
Install the standard sticky site header on pages that do not carry it yet.

The header, its stylesheets and the on-site-search scripts are inlined on every
page rather than pulled from a shared include, so a page built from a shell that
predates a header change silently keeps the old chrome, and a page family that
never had the header at all is invisible to the sweeps in header-search-v2.py
and header-polish-v3.py (both gate on `class="sitenav"` already being present).

This script closes that gap. It lifts every header asset out of one reference
page, rewrites the relative paths for the target's depth, and splices the set
into any page that is missing it. Re-running is a no-op.

Run from the repository root:

    python3 scripts/install-site-header.py            # report only
    python3 scripts/install-site-header.py --apply    # write the changes
"""

import argparse
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
REFERENCE = "awg-home.html"

# Pages that are deliberately without the site header. Keep this list short and
# keep a reason on every entry: it is the allow-list the consistency check reads.
EXEMPT = {
    # Office-wall signage, shown full-screen on a display with no visitor to navigate.
    "lobby/index.html",
    "lobby-sign/index.html",
    # Internal dashboards. Staff reach these from the Support menu of a real page.
    "employee-portal.html",
    "web-visitors.html",
    # Not a page: the paste-in footer component every book chapter is built from.
    "books/radar/html/footer-snippet.html",
    # Internal build note for whoever deploys the scintillators book.
    "books/scintillators/web/WEBMASTER-DEPLOYMENT.html",
    # Planning document for the RTSA book, never linked from the site.
    "books/realtime-spectrum-analyzers/html/OUTLINE.html",
}

# A page that forwards on load has no chrome to be consistent with. Matched on the
# meta refresh rather than on file size: the ten book splash pages carry a full
# OG/JSON-LD block and run to 12 KB, but they still redirect before anyone sees them.
REDIRECT_RE = re.compile(
    r"""<meta[^>]+http-equiv\s*=\s*["']?refresh["']?[^>]*>""", re.I
)

# Head assets, in the order the reference page carries them.
HEAD_STYLE_IDS = [
    "nav-cascade-css",
    "ss-css",
    "navgrplink",
    "bnc-mobile-nav-fix",
]
# End-of-body assets, in the order the reference page carries them. bnc-nav-v2 is
# last on purpose: it has to outrank both the inline blocks and the ssx-css block
# that ss-js appends to <head> at runtime.
BODY_STYLE_IDS = [
    "nav-casc3",
    "bnc-nav-v2",
]

GTM_CLOSE = "<!-- End Google Tag Manager (noscript) -->"

URL_ATTR_RE = re.compile(r'\b(href|src)="([^"]*)"')
ABSOLUTE_PREFIXES = ("/", "#", "http://", "https://", "//", "mailto:", "tel:", "data:")


def depth_prefix(rel: str) -> str:
    """Depth-relative link prefix, matching how the rest of the nav is written."""
    return "../" * rel.count("/")


def reprefix(block: str, prefix: str) -> str:
    """Prepend the target page's depth prefix to every document-relative URL.

    The reference page sits at the repository root, so each of its relative URLs
    is already correct for depth 0 and only needs the prefix in front.
    """
    if not prefix:
        return block

    def sub(m: "re.Match[str]") -> str:
        attr, url = m.group(1), m.group(2)
        if url.startswith(ABSOLUTE_PREFIXES) or not url:
            return m.group(0)
        return '%s="%s%s"' % (attr, prefix, url)

    return URL_ATTR_RE.sub(sub, block)


# A rule belongs to the header if any of its comma-separated selectors names one
# of the header's own classes. Selector matching, not position: the nav rules are
# not one contiguous run, several of them share a source line with an unrelated
# rule, and two of them live inside media queries, so slicing by offset silently
# drops most of the block.
HEADER_SEL_RE = re.compile(
    r"\.(?:sitenav|nav-item|nav-drop|nav-grp\d?|nav-sub\d?|nav-casc|nav-trigger|navtoggle|nc|ss-[a-z0-9-]+)\b"
)

BLOCK_AT_RULE_RE = re.compile(r"^@(?:media|supports|layer|container)\b", re.I)


def split_rules(css: str):
    """Yield (prelude, body, is_block_at_rule) for each top-level construct."""
    i = 0
    n = len(css)
    while i < n:
        # skip whitespace and comments between rules
        if css.startswith("/*", i):
            j = css.find("*/", i)
            i = n if j < 0 else j + 2
            continue
        if css[i] in " \t\r\n;":
            i += 1
            continue
        brace = css.find("{", i)
        if brace < 0:
            return
        prelude = css[i:brace].strip()
        depth = 0
        j = brace
        while j < n:
            if css[j] == "{":
                depth += 1
            elif css[j] == "}":
                depth -= 1
                if depth == 0:
                    break
            j += 1
        body = css[brace + 1:j]
        yield prelude, body, bool(BLOCK_AT_RULE_RE.match(prelude))
        i = j + 1


def extract_header_css(css: str) -> str:
    """Pull every header rule out of a stylesheet, media queries included."""
    out = []
    for prelude, body, is_at in split_rules(css):
        if is_at:
            inner = [
                "%s{%s}" % (p, b)
                for p, b, sub in split_rules(body)
                if not sub and HEADER_SEL_RE.search(p)
            ]
            if inner:
                out.append("%s{%s}" % (prelude, "".join(inner)))
        elif HEADER_SEL_RE.search(prelude):
            out.append("%s{%s}" % (prelude, body))
    return "\n".join(out)


def extract_assets() -> dict:
    """Lift every header asset out of the reference page."""
    src = (ROOT / REFERENCE).read_text(encoding="utf-8")
    out = {}

    # 1. the nav rules inside the page's first <style>
    i = src.find("<style>")
    j = src.find("</style>", i)
    css = src[i + len("<style>"):j]
    navcss = extract_header_css(css)
    if ".sitenav{" not in navcss or ".navtoggle" not in navcss or ".sitenav-menu" not in navcss:
        raise SystemExit(
            "reference page's nav CSS did not extract cleanly (got %d chars)" % len(navcss)
        )
    out["navcss"] = navcss.strip()

    # 2. the named style blocks
    for sid in HEAD_STYLE_IDS + BODY_STYLE_IDS:
        k = src.find('<style id="%s">' % sid)
        if k < 0:
            raise SystemExit("reference page has no <style id=%r>" % sid)
        e = src.find("</style>", k) + len("</style>")
        out[sid] = src[k:e]

    # 3. the header element
    h = src.find('<header class="sitenav">')
    he = src.find("</header>", h) + len("</header>")
    out["header"] = src[h:he]

    # 4. the auth/visit include block, between its own markers
    m = src.find("<!--bnc-auth-->")
    if m < 0:
        # The reference page carries the includes without the opening marker.
        m = src.find('<link rel="stylesheet" href="_shared/bnc-auth.css">')
        me = src.find("<!--/bnc-auth-->", m) + len("<!--/bnc-auth-->")
        out["auth"] = "<!--bnc-auth-->\n" + src[m:me]
    else:
        me = src.find("<!--/bnc-auth-->", m) + len("<!--/bnc-auth-->")
        out["auth"] = src[m:me]

    # 5. the on-site-search trio: ss-data, the index, ss-js
    s = src.find('<script id="ss-data">')
    se = src.find("</script>", src.find('<script id="ss-js">')) + len("</script>")
    out["sstrio"] = src[s:se]

    out["a11y"] = '<link rel="stylesheet" href="/_shared/bnc-a11y.css">'
    out["emerald"] = '<link rel="stylesheet" href="_shared/bnc-emerald.css">'
    return out


def has_header(src: str) -> bool:
    return 'class="sitenav"' in src


def is_redirect(src: str) -> bool:
    return bool(REDIRECT_RE.search(src))


def install(rel: str, src: str, assets: dict) -> str:
    prefix = depth_prefix(rel)

    head_bits = []
    head_bits.append("<style id=\"sitenav-css\">%s</style>" % assets["navcss"])
    for sid in HEAD_STYLE_IDS:
        head_bits.append(assets[sid])
    if "bnc-auth.css" not in src:
        head_bits.append(assets["auth"])
    if "bnc-a11y.css" not in src:
        head_bits.append(assets["a11y"])
    # Not decoration: emerald forces the last menu's flyouts to open inward so they
    # do not run off the right edge of the bar, and it hides the discontinued Model
    # 971 link that the canonical nav markup still carries.
    if "bnc-emerald.css" not in src:
        head_bits.append(assets["emerald"])
    head_block = "\n" + reprefix("\n".join(head_bits), prefix) + "\n"

    k = src.rfind("</head>")
    if k < 0:
        raise ValueError("no </head>")
    src = src[:k] + head_block + src[k:]

    # the header element, directly after the GTM noscript if the page has one
    hdr = reprefix(assets["header"], prefix)
    g = src.find(GTM_CLOSE)
    if g >= 0:
        at = g + len(GTM_CLOSE)
    else:
        b = re.search(r"<body[^>]*>", src)
        if not b:
            raise ValueError("no <body>")
        at = b.end()
    src = src[:at] + "\n" + hdr + "\n" + src[at:]

    # the search trio and the two late style blocks, at the end of <body>
    body_bits = []
    if 'id="ss-data"' not in src:
        trio = assets["sstrio"].replace(
            'window.SS_BASE="";', 'window.SS_BASE="%s";' % prefix, 1
        )
        body_bits.append(reprefix(trio, prefix))
    for sid in BODY_STYLE_IDS:
        if 'id="%s"' % sid not in src:
            body_bits.append(reprefix(assets[sid], prefix))
    if body_bits:
        e = src.rfind("</body>")
        if e < 0:
            raise ValueError("no </body>")
        src = src[:e] + "\n" + "\n".join(body_bits) + "\n" + src[e:]

    return src


def pages() -> list:
    raw = subprocess.check_output(["git", "ls-files", "-z", "*.html"], cwd=ROOT)
    return [f for f in raw.decode("utf-8").split("\0") if f and not f.startswith(".claude/")]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="write the changes")
    ap.add_argument("--only", default="", help="restrict to paths starting with this")
    args = ap.parse_args()

    assets = extract_assets()
    changed = already = exempt = stubs = failed = 0

    for rel in pages():
        if args.only and not rel.startswith(args.only):
            continue
        path = ROOT / rel
        src = path.read_text(encoding="utf-8")
        if has_header(src):
            already += 1
            continue
        if rel in EXEMPT:
            exempt += 1
            continue
        if is_redirect(src):
            stubs += 1
            continue
        try:
            new = install(rel, src, assets)
        except Exception as exc:  # noqa: BLE001
            print("  !! %s: %s" % (rel, exc), file=sys.stderr)
            failed += 1
            continue
        changed += 1
        if args.apply:
            path.write_text(new, encoding="utf-8")
        else:
            print("  would install: %s" % rel)

    verb = "installed on" if args.apply else "missing from"
    print(
        "%s %d pages; %d already current, %d exempt, %d redirect stubs, %d failed"
        % (verb, changed, already, exempt, stubs, failed)
    )
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
