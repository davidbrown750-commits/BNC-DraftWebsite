#!/usr/bin/env python3
"""
Stop the open mobile nav from zooming the whole page out.

Below 1040px the mega-menu flattens into a drawer, and the flattening rules
already let the leaf links wrap. The rows above them do not: `.nav-item>a`,
`.nav-trigger`, `.nav-grp2` and `.nav-grp3` keep the `white-space:nowrap` they
need on the desktop bar, so a category called "RF & Microwave Signal Generators
& Sensors" cannot break. The drawer's intrinsic width comes out at 473px.

On a handset that is wider than the screen, and mobile Chrome responds by
shrinking the page to fit: measured on a 360px Pixel profile, tapping the
hamburger took the layout viewport from 360px to 489px, which zooms out every
word on the page. 390px and 430px did the same. The reader taps the menu and
the site gets smaller.

Letting those four rows wrap in the drawer, and only in the drawer, fixes it.
The desktop bar is untouched.

Run from the repository root:

    python3 scripts/header-mobile-wrap.py            # report only
    python3 scripts/header-mobile-wrap.py --apply
"""

import argparse
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent

MARKER = 'id="bnc-nav-mobile-wrap"'

CSS = """<style id="bnc-nav-mobile-wrap">/* the drawer must fit the screen it opens on */
@media(max-width:1040px){
  /* These four keep nowrap on the desktop bar, where the labels sit side by side
     and must not break. In the drawer they stack, so wrapping is what we want,
     and without it the longest category sets the width of the whole panel. */
  .sitenav.open .nav-item>a,
  .sitenav.open .nav-trigger,
  .sitenav.open .nav-grp2,
  .sitenav.open .nav-grp3{white-space:normal;}
  .sitenav.open .sitenav-menu,
  .sitenav.open .nav-drop,
  .sitenav.open .nav-drop.nav-casc,
  .sitenav.open .nav-sub,
  .sitenav.open .nav-sub3{max-width:100%;min-width:0;}
  /* iOS Safari zooms the page in when a focused input is under 16px and never
     zooms back out, which leaves the bar hanging half off the screen. */
  .ss-input,.ss-ph{font-size:16px;}
  .ss-input{height:44px;}
  /* WCAG 2.5.5: 44x44 of hit area. The hamburger was 42x38 and the two buttons
     were 30px tall, which is small for a thumb and is the control every mobile
     visitor has to hit first. */
  .navtoggle{width:44px;height:44px;}
  .sitenav-cta,.bnc-signin{min-height:44px;}
}
</style>"""


def pages() -> list:
    raw = subprocess.check_output(["git", "ls-files", "-z", "*.html"], cwd=ROOT)
    return [f for f in raw.decode("utf-8").split("\0") if f and not f.startswith(".claude/")]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    changed = skipped = 0
    for rel in pages():
        path = ROOT / rel
        src = path.read_text(encoding="utf-8")
        if 'class="sitenav"' not in src:
            skipped += 1
            continue
        if MARKER in src:
            a = src.find('<style id="bnc-nav-mobile-wrap">')
            b = src.find("</style>", a) + len("</style>")
            if src[a:b] == CSS:
                skipped += 1
                continue
            src = src[:a] + src[b:]
        k = src.rfind("</body>")
        if k < 0:
            print("  !! no </body>: %s" % rel, file=sys.stderr)
            skipped += 1
            continue
        if args.apply:
            path.write_text(src[:k] + CSS + "\n" + src[k:], encoding="utf-8")
        changed += 1

    print("%s %d pages, %d untouched" % ("fixed" if args.apply else "would fix", changed, skipped))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
