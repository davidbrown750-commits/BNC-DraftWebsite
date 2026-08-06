#!/usr/bin/env python3
"""
Sitewide header + on-site-search rework, applied idempotently to every page that
carries the sticky nav.

  1. Moves the search control out of the far-right slot and into the left slot,
     immediately after the logo, and rebuilds its markup so the resting state
     reads "Search" in white followed by three animated dots.
  2. Renames the "Application Briefs" nav label to "Applications".
  3. Retunes the results overlay: six columns by three rows, anchored to the
     header container, with the page behind it dimmed by half.
  4. Adds the bnc-nav-v2 style block that gives the search box, the
     Get a Quote/Demo button and the Sign up button one common height and one
     common font size, and spreads the bar evenly across its width.

Re-running the script is a no-op. Run from the repository root.
"""

import re
import sys
import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parent.parent

# --------------------------------------------------------------------------
# 1. the style block, appended once at the end of <body> so it takes precedence
#    over both the inline blocks and the ssx-css block that ss-js appends to
#    <head> at runtime.
# --------------------------------------------------------------------------

NAV_V2_CSS = """<style id="bnc-nav-v2">/* header v2: search left, evenly spread bar, one control height */
.sitenav-inner{position:relative;gap:18px;}
.sitenav-logo{flex:0 0 auto;}
.sitenav-menu{margin-left:0;flex:1 1 auto;min-width:0;justify-content:space-evenly;gap:0;}
.nav-item>a{padding:0 9px;}
/* one height and one font size for search, Get a Quote/Demo and Sign up */
.ss-input,.sitenav-cta,.bnc-signin{height:30px;box-sizing:border-box;padding:0 1em;border-radius:6px;font-family:'Myriad Pro','Segoe UI',Arial,sans-serif;font-size:.82rem;white-space:nowrap;}
.sitenav-cta,.bnc-signin{display:inline-flex;align-items:center;justify-content:center;line-height:1;font-weight:700;}
.sitenav-cta{margin-left:0;border:1px solid transparent;}
.bnc-acct{margin-left:0;}
.ss-wrap{position:static;margin-left:0;flex:0 0 auto;}
.ss-field{position:relative;display:inline-flex;align-items:center;}
.ss-input{display:block;width:186px;line-height:28px;font-weight:600;color:#fff;transition:border-color .18s;}
.ss-input:focus{width:186px;}
.ss-input::-webkit-search-cancel-button{-webkit-appearance:none;appearance:none;}
/* resting state: bright white "Search" plus three waiting dots */
.ss-ph{position:absolute;left:calc(1em + 1px);top:50%;transform:translateY(-50%);display:flex;align-items:center;pointer-events:none;font-family:'Myriad Pro','Segoe UI',Arial,sans-serif;font-weight:600;font-size:.82rem;letter-spacing:.01em;color:#fff;transition:opacity .15s ease;}
.ss-input:not(:placeholder-shown)~.ss-ph{opacity:0;}
.ss-dots{display:inline-flex;align-items:center;gap:3px;margin-left:4px;}
.ss-dots i{display:block;width:3px;height:3px;border-radius:50%;background:#fff;animation:ss-dot 1.3s infinite ease-in-out;}
.ss-dots i:nth-child(2){animation-delay:.17s;}
.ss-dots i:nth-child(3){animation-delay:.34s;}
@keyframes ss-dot{0%,58%,100%{opacity:.3;transform:translateY(0);}29%{opacity:1;transform:translateY(-3px);}}
@media(prefers-reduced-motion:reduce){.ss-dots i{animation:none;opacity:.9;}}
/* results overlay: pinned to the header container so it never runs off-screen */
.ss-panel{left:28px;right:28px;width:auto;max-width:none;top:calc(100% - 6px);}
.ss-panel.ss-grid{width:auto;max-width:none;}
.ss-gwrap{grid-template-columns:repeat(6,1fr);}
@media(max-width:1240px){.ss-gwrap{grid-template-columns:repeat(5,1fr);}}
@media(max-width:1080px){.ss-gwrap{grid-template-columns:repeat(4,1fr);}}
@media(max-width:920px){.ss-gwrap{grid-template-columns:repeat(3,1fr);}}
@media(max-width:560px){.ss-gwrap{grid-template-columns:repeat(2,1fr);}}
/* the 1041-1240px band was already overflowing before this change: tighten the
   bar there so nothing collides, keeping the three controls in step */
@media(max-width:1240px){
  .sitenav-inner{gap:12px;}
  .nav-item>a{padding:0 7px;font-size:.79rem;}
  .ss-input,.ss-input:focus{width:150px;}
}
@media(max-width:1150px){
  .sitenav-inner{gap:8px;}
  .nav-item>a{padding:0 5px;font-size:.75rem;letter-spacing:.03em;}
  .ss-input,.ss-input:focus{width:118px;}
  .ss-input,.sitenav-cta,.bnc-signin,.ss-ph{font-size:.76rem;}
  .sitenav-cta,.bnc-signin{padding:0 .7em;}
}
/* half-strength dim over the page behind the overlay; the bar stays lit */
.ss-dim{position:fixed;inset:0;background:rgba(4,10,20,.5);opacity:0;visibility:hidden;transition:opacity .18s ease,visibility .18s;z-index:190;}
.ss-dim.open{opacity:1;visibility:visible;}
@media(max-width:1040px){
  .ss-wrap{position:relative;}
  .ss-panel{left:0;right:auto;width:100%;top:calc(100% + 8px);}
  .ss-panel.ss-grid{width:100%;}
  .ss-field{width:100%;}
  .ss-input,.ss-input:focus{width:100%;}
}
</style>"""

# --------------------------------------------------------------------------
# 2. the search control markup that replaces the old .ss-wrap contents
# --------------------------------------------------------------------------

SS_WRAP_V2 = (
    '<div class="ss-wrap"><span class="ss-field">'
    '<input class="ss-input" type="search" placeholder=" " aria-label="Search the site" autocomplete="off">'
    '<span class="ss-ph" aria-hidden="true">Search<span class="ss-dots"><i></i><i></i><i></i></span></span>'
    '</span><div class="ss-panel" role="listbox"></div></div>'
)

SS_WRAP_RE = re.compile(r'<div class="ss-wrap">.*?</div>\s*</div>', re.S)

# --------------------------------------------------------------------------
# 3. ss-js edits: six-up grid, an eighteen-tile cap, and the dim layer
# --------------------------------------------------------------------------

SS_JS_EDITS = [
    # six columns instead of five, and a container-width panel
    ("grid-template-columns:repeat(5,1fr);", "grid-template-columns:repeat(6,1fr);"),
    (".ss-panel.ss-grid{width:min(940px,94vw);max-width:94vw;padding:14px 14px 16px;}",
     ".ss-panel.ss-grid{padding:14px 14px 16px;}"),
    # eighteen tiles at rest (6x3), thirty-six once expanded
    ("var cap=expanded?20:10;", "var cap=expanded?36:18;"),
    # the hint's tile count only matters while collapsed, so stop paying for a
    # second full tile assembly on every expanded redraw
    ("var total=buildTiles(20).length;", "var total=expanded?tiles.length:buildTiles(36).length;"),
    # a result tile opens in a new tab but never closed the panel, which would
    # strand the dim over the page the visitor comes back to
    ('else{window.open(base+el.getAttribute("data-u"),"_blank","noopener");}',
     'else{window.open(base+el.getAttribute("data-u"),"_blank","noopener");ssClose();}'),
    # searching "faq" dropped every FAQ-category page and returned nothing:
    # only strip a FAQ-category result when the FAQ section already carries it
    ("results.filter(function(r){return((''+(r.e.c||'')).toLowerCase().indexOf('faq')<0);})",
     "results.filter(function(r){var c=(''+(r.e.c||'')).toLowerCase();"
     "if(c.indexOf('faq')<0)return true;var u=r.e.u||'';"
     "for(var i=0;i<faqs.length;i++){if(faqs[i].e.u===u)return false;}return true;})"),
    # book chapters are a real page type now, so give them their own badge
    ('if(t.indexOf("faq")>=0)return "FAQ";return "Product";}',
     'if(t.indexOf("faq")>=0)return "FAQ";if(t.indexOf("book")>=0)return "Book";return "Product";}'),
    # widen the candidate pools so an eighteen-tile grid can actually be filled
    ("}).filter(Boolean).sort(function(a,b){return b.s-a.s;}).slice(0,40);if(pins.length)",
     "}).filter(Boolean).sort(function(a,b){return b.s-a.s;}).slice(0,60);if(pins.length)"),
    ("return {v:v,s:sc,t:seek,mt:mt,inText:!!best};}).filter(Boolean)"
     ".sort(function(a,b){return b.s-a.s;}).slice(0,3);}",
     "return {v:v,s:sc,t:seek,mt:mt,inText:!!best};}).filter(Boolean)"
     ".sort(function(a,b){return b.s-a.s;}).slice(0,4);}"),
    ("sc+=hit*0.6;return{e:e,s:sc};}).filter(Boolean).sort(function(a,b){return b.s-a.s;}).slice(0,4);}",
     "sc+=hit*0.6;return{e:e,s:sc};}).filter(Boolean).sort(function(a,b){return b.s-a.s;}).slice(0,6);}"),
    # every close of the panel also lifts the dim; every open lays it down
    # anchored on what follows, so a second run cannot stack another ssDim call
    ('panel.className="ss-panel ss-grid open";Array.prototype',
     'panel.className="ss-panel ss-grid open";ssDim(true);Array.prototype'),
    ('panel.className="ss-panel";', 'ssClose();'),
]

# The Book icon is added under its own guard: its anchor survives the insertion,
# so a plain replace would stack another copy on every run.
BOOK_ICON_ANCHOR = '"Product":"<svg viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'#37b6f0\''
BOOK_ICON = (
    '"Book":"<svg viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'#37b6f0\' stroke-width=\'1.6\''
    " stroke-linecap='round' stroke-linejoin='round'>"
    "<path d='M4 19.5A2.5 2.5 0 0 1 6.5 17H20'/>"
    "<path d='M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z'/>"
    "<path d='M9 7.5h7M9 11h7'/></svg>\","
)

SS_JS_HELPERS = """var wrap=document.querySelector(".ss-wrap");if(!wrap)return;"""

# NB: ssClose's body deliberately avoids the literal `panel.className="ss-panel";`
# so that re-running the sweep cannot rewrite the helper into a call to itself.
SS_JS_HELPERS_V2 = """var wrap=document.querySelector(".ss-wrap");if(!wrap)return;
/* half-strength dim behind the results overlay (sits under the sticky bar) */
function ssDim(on){var d=document.getElementById("ss-dim");if(!d){d=document.createElement("div");d.id="ss-dim";d.className="ss-dim";document.body.appendChild(d);d.addEventListener("click",function(){ssClose();});}if(on){void d.offsetHeight;d.classList.add("open");}else{d.classList.remove("open");}}
function ssClose(){panel.setAttribute("class","ss-panel");ssDim(false);}
"""


def prefix_for(rel: str) -> str:
    """Depth-relative link prefix, matching how the rest of the nav is written."""
    return "../" * rel.count("/")


def transform(path: pathlib.Path, rel: str) -> bool:
    src = original = path.read_text(encoding="utf-8")

    if 'class="sitenav"' not in src:
        return False

    # -- 1. nav label -------------------------------------------------------
    src = src.replace(
        '<a class="nav-trigger">Application Briefs &#9662;</a>',
        '<a class="nav-trigger">Applications &#9662;</a>',
    )

    # -- 2. move the search control to the left, and rebuild its markup ------
    # The old block sits between the CTA and the hamburger; lift it out and
    # re-seat it directly after the logo anchor.
    # Guard on the migrated marker so a second run is a true no-op rather than
    # a cut-and-reinsert that leaves another blank line behind each time.
    if '<span class="ss-field">' not in src:
        m = SS_WRAP_RE.search(src)
        if not m:
            print("  !! no .ss-wrap to move: %s" % rel, file=sys.stderr)
            return False
        src = src[: m.start()] + src[m.end():]
        # re-seat it immediately after the logo anchor, wherever that sits
        i = src.find('<a class="sitenav-logo"')
        j = src.find("</a>", i) + len("</a>")
        src = src[:j] + "\n  " + SS_WRAP_V2 + src[j:]
        # tidy the gap the lift left behind
        src = re.sub(r'(</div>|</button>)\n?\s*\n\s*(<nav class="sitenav-menu">)', r"\1\n  \2", src, count=1)

    # -- 3. logo points at the home page ------------------------------------
    p = prefix_for(rel)
    src = re.sub(
        r'<a class="sitenav-logo"(?:\s+href="[^"]*")?(?:\s+aria-label="[^"]*")?',
        '<a class="sitenav-logo" href="%shome.html" aria-label="Berkeley Nucleonics home"' % p,
        src,
        count=1,
    )

    # -- 4. ss-js retune ----------------------------------------------------
    # Scoped strictly to the ss-js block. Applied document-wide, the grid-column
    # edits would also rewrite the bnc-nav-v2 stylesheet this script adds below,
    # and the sweep would stop being a no-op on its second run.
    a = src.find('<script id="ss-js">')
    if a >= 0:
        a += len('<script id="ss-js">')
        b = src.find("</script>", a)
        js = src[a:b]

        for old, new in SS_JS_EDITS:
            if old in js:
                js = js.replace(old, new)
        if '"Book":"<svg' not in js and BOOK_ICON_ANCHOR in js:
            js = js.replace(BOOK_ICON_ANCHOR, BOOK_ICON + BOOK_ICON_ANCHOR, 1)
        # helpers go in last, so the edit pass above can never reach into them
        if "function ssClose()" not in js:
            js = js.replace(SS_JS_HELPERS, SS_JS_HELPERS_V2, 1)

        src = src[:a] + js + src[b:]

    # -- 5. the style block, once, at the end of <body> ---------------------
    if 'id="bnc-nav-v2"' not in src:
        k = src.rfind("</body>")
        if k < 0:
            print("  !! no </body>: %s" % rel, file=sys.stderr)
            return False
        src = src[:k] + NAV_V2_CSS + "\n" + src[k:]

    if src != original:
        path.write_text(src, encoding="utf-8")
        return True
    return False


def main() -> int:
    # -z, because plain ls-files C-quotes the handful of paths carrying a non
    # ASCII character (the +/- and ohm signs in the legacy product folders) and
    # would drop them silently.
    raw = subprocess.check_output(["git", "ls-files", "-z", "*.html"], cwd=ROOT)
    files = [f for f in raw.decode("utf-8").split("\0") if f and not f.startswith(".claude/")]

    changed = skipped = 0
    for rel in files:
        path = ROOT / rel
        try:
            if transform(path, rel):
                changed += 1
            else:
                skipped += 1
        except Exception as exc:  # noqa: BLE001
            print("  !! %s: %s" % (rel, exc), file=sys.stderr)
            skipped += 1

    print("changed %d, untouched %d, of %d files" % (changed, skipped, len(files)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
