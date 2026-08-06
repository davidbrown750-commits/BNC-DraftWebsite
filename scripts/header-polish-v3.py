#!/usr/bin/env python3
"""
Header and search-result polish, applied idempotently to every page with the nav.

  1. Signed in, a long name pushed the Get a Quote/Demo button on top of the
     Support menu. The nav was allowed to shrink below its own content width, so
     the pressure of the welcome text and avatar collapsed it and the items
     spilled over whatever followed. The nav now refuses to shrink past its
     content and the search box gives up width instead.
  2. Nav type comes down slightly and the items sit further apart.
  3. Get a Quote/Demo becomes RFQ/Demo, which is also what buys back the width.
  4. Result badges get one colour per category with white text, instead of
     purple on purple. Book becomes E-Book.

Run from the repository root. Re-running is a no-op.
"""

import re
import sys
import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parent.parent

NAV_V3_CSS = """<style id="bnc-nav-v2">/* header v3: search left, evenly spread bar, one control height */
.sitenav-inner{position:relative;gap:16px;}
.sitenav-logo{flex:0 0 auto;}
/* min-width:max-content is what stops a long signed-in name from collapsing the
   nav and pushing the RFQ button on top of the Support menu */
.sitenav-menu{margin-left:0;flex:1 1 auto;min-width:max-content;justify-content:space-evenly;gap:0;}
.nav-item>a{padding:0 12px;font-size:.8rem;}
/* one height and one font size for search, RFQ/Demo and Sign up */
.ss-input,.sitenav-cta,.bnc-signin{height:30px;box-sizing:border-box;padding:0 1em;border-radius:6px;font-family:'Myriad Pro','Segoe UI',Arial,sans-serif;font-size:.8rem;white-space:nowrap;}
.sitenav-cta,.bnc-signin{display:inline-flex;align-items:center;justify-content:center;line-height:1;font-weight:700;}
.sitenav-cta{margin-left:0;border:1px solid transparent;flex:0 0 auto;}
.bnc-acct{margin-left:0;flex:0 0 auto;gap:10px;}
.bnc-welcome{font-size:.8rem;}
/* the search box is what yields width when the bar gets tight */
.ss-wrap{position:static;margin-left:0;flex:0 1 auto;min-width:0;}
.ss-field{position:relative;display:inline-flex;align-items:center;max-width:100%;}
.ss-input{display:block;width:186px;max-width:100%;min-width:104px;line-height:28px;font-weight:600;color:#fff;transition:border-color .18s;}
.ss-input:focus{width:186px;}
.ss-input::-webkit-search-cancel-button{-webkit-appearance:none;appearance:none;}
/* resting state: bright white "Search" plus three waiting dots */
.ss-ph{position:absolute;left:calc(1em + 1px);top:50%;transform:translateY(-50%);display:flex;align-items:center;pointer-events:none;font-family:'Myriad Pro','Segoe UI',Arial,sans-serif;font-weight:600;font-size:.8rem;letter-spacing:.01em;color:#fff;transition:opacity .15s ease;}
.ss-input:not(:placeholder-shown)~.ss-ph{opacity:0;}
.ss-dots{display:inline-flex;align-items:center;gap:3px;margin-left:4px;}
.ss-dots i{display:block;width:3px;height:3px;border-radius:50%;background:#fff;animation:ss-dot 1.3s infinite ease-in-out;}
.ss-dots i:nth-child(2){animation-delay:.17s;}
.ss-dots i:nth-child(3){animation-delay:.34s;}
@keyframes ss-dot{0%,58%,100%{opacity:.3;transform:translateY(0);}29%{opacity:1;transform:translateY(-3px);}}
@media(prefers-reduced-motion:reduce){.ss-dots i{animation:none;opacity:.9;}}
/* The mega-menu flyouts are laid out even while hidden, so the rightmost ones
   stretch the document and raise a horizontal scrollbar. The site already
   clipped this below 1040px; do it at every width. `clip` rather than `hidden`,
   because `hidden` on the root would break the sticky header. */
html{overflow-x:clip;}
/* results overlay: pinned to the header container so it never runs off-screen */
.ss-panel{left:28px;right:28px;width:auto;max-width:none;top:calc(100% - 6px);}
.ss-panel.ss-grid{width:auto;max-width:none;}
.ss-gwrap{grid-template-columns:repeat(6,1fr);}
@media(max-width:1240px){.ss-gwrap{grid-template-columns:repeat(5,1fr);}}
@media(max-width:1080px){.ss-gwrap{grid-template-columns:repeat(4,1fr);}}
@media(max-width:920px){.ss-gwrap{grid-template-columns:repeat(3,1fr);}}
@media(max-width:560px){.ss-gwrap{grid-template-columns:repeat(2,1fr);}}
/* one colour per result category, white text on a solid box. The old badge was
   light purple on translucent purple for every type, which read as one blur. */
.ss-gbadge{font-size:.58rem;letter-spacing:.08em;padding:3px 8px;border:0;color:#fff;background:#475569;}
.ss-gbadge.ss-b-datasheet{background:#c2410c;}
.ss-gbadge.ss-b-video{background:#7e22ce;}
.ss-gbadge.ss-b-faq{background:#15803d;}
.ss-gbadge.ss-b-manual{background:#0655a3;}
.ss-gbadge.ss-b-application-note{background:#a16207;}
.ss-gbadge.ss-b-technical-brief{background:#be123c;}
.ss-gbadge.ss-b-e-book{background:#4338ca;}
.ss-gbadge.ss-b-product{background:#475569;}
/* half-strength dim over the page behind the overlay; the bar stays lit */
.ss-dim{position:fixed;inset:0;background:rgba(4,10,20,.5);opacity:0;visibility:hidden;transition:opacity .18s ease,visibility .18s;z-index:190;}
.ss-dim.open{opacity:1;visibility:visible;}
@media(max-width:1240px){
  .sitenav-inner{gap:12px;}
  .nav-item>a{padding:0 8px;font-size:.77rem;}
  .ss-input,.ss-input:focus{width:150px;}
}
@media(max-width:1150px){
  .sitenav-inner{gap:8px;}
  .nav-item>a{padding:0 6px;font-size:.74rem;letter-spacing:.03em;}
  .ss-input,.ss-input:focus{width:118px;}
  .ss-input,.sitenav-cta,.bnc-signin,.ss-ph,.bnc-welcome{font-size:.75rem;}
  .sitenav-cta,.bnc-signin{padding:0 .7em;}
}
@media(max-width:1040px){
  .ss-wrap{position:relative;}
  .ss-panel{left:0;right:auto;width:100%;top:calc(100% + 8px);}
  .ss-panel.ss-grid{width:100%;}
  .ss-field{width:100%;}
  .ss-input,.ss-input:focus{width:100%;}
}
</style>"""

NAV_CSS_RE = re.compile(r'<style id="bnc-nav-v2">.*?</style>', re.S)

# ---------------------------------------------------------------------------
# ss-js: a colour-carrying class on each badge, and Book becomes E-Book
# ---------------------------------------------------------------------------

SS_JS_EDITS = [
    ('if(t.indexOf("book")>=0)return "Book";', 'if(t.indexOf("book")>=0)return "E-Book";'),
    # the badge gets a category class so the palette can live in CSS
    ('<span class=\\"ss-gbadge\\">"+ssgEsc(t.badge)+',
     '<span class=\\"ss-gbadge ss-b-"+ssgSlug(t.badge)+"\\">"+ssgEsc(t.badge)+'),
    ('function ssgEsc(s){',
     'function ssgSlug(s){return (""+(s==null?"":s)).toLowerCase().replace(/[^a-z0-9]+/g,"-")'
     '.replace(/^-|-$/g,"");}\nfunction ssgEsc(s){'),
]


def transform(path: pathlib.Path, rel: str) -> bool:
    src = original = path.read_text(encoding="utf-8")
    if 'class="sitenav"' not in src:
        return False

    # -- 1. the header CTA label -------------------------------------------
    # Matched on the element rather than the old wording, because
    # scintiq-home.html said "Get a Quote" with no "/Demo" and a literal swap
    # would have skipped it. Anchored to the one that follows </nav>, since one
    # brief reuses .sitenav-cta for an in-body "Request a Model 685 demo"
    # button that must keep its own wording.
    src = re.sub(
        r'(</nav>\s*<a class="sitenav-cta"[^>]*>)[^<]*(</a>)',
        r"\1RFQ/Demo\2",
        src,
        count=1,
    )

    # -- 2. the stylesheet --------------------------------------------------
    if NAV_CSS_RE.search(src):
        src = NAV_CSS_RE.sub(lambda m: NAV_V3_CSS, src, count=1)
    else:
        k = src.rfind("</body>")
        if k < 0:
            print("  !! no </body>: %s" % rel, file=sys.stderr)
            return False
        src = src[:k] + NAV_V3_CSS + "\n" + src[k:]

    # -- 3. the search engine, scoped to its own block ----------------------
    a = src.find('<script id="ss-js">')
    if a >= 0:
        a += len('<script id="ss-js">')
        b = src.find("</script>", a)
        js = src[a:b]
        for old, new in SS_JS_EDITS:
            if old in js and new not in js:
                js = js.replace(old, new)
        src = src[:a] + js + src[b:]

    if src != original:
        path.write_text(src, encoding="utf-8")
        return True
    return False


def main() -> int:
    raw = subprocess.check_output(["git", "ls-files", "-z", "*.html"], cwd=ROOT)
    files = [f for f in raw.decode("utf-8").split("\0") if f and not f.startswith(".claude/")]

    changed = 0
    for rel in files:
        try:
            if transform(ROOT / rel, rel):
                changed += 1
        except Exception as exc:  # noqa: BLE001
            print("  !! %s: %s" % (rel, exc), file=sys.stderr)
    print("changed %d of %d files" % (changed, len(files)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
