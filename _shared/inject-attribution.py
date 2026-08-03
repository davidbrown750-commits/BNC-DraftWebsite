#!/usr/bin/env python3
"""Inject the paid-click attribution + dataLayer block into every page's <head>.

Why this exists
---------------
Both Google Ads campaigns tag their final URLs with UTMs, but nothing on the site ever
read them, so a paid click could not be tied to a lead in Nutshell. A repo-wide search for
`gclid` and `utm_` returned zero matches before this script. That made the core rule of a
B2B paid-search programme — judge the campaign on qualified pipeline in the CRM, not on
clicks — impossible to follow.

The block does two things, and both have to happen before the GTM container loads:

  1. Initialises `window.dataLayer`. Only thank-you.html did this; every other page relied
     on the container's own `w[l]=w[l]||[]`, which does not run until Cookiebot grants
     consent. So a `dataLayer.push` from page code had nowhere to land.
  2. Captures gclid / wbraid / gbraid / msclkid / utm_* off the landing URL, carries them
     across the visit, and exposes them as `window.BNC_ATTR` for the forms to submit.

Storage is deliberately tiered (see the block's own comment): sessionStorage always, the
90-day cookie only once Cookiebot reports marketing consent.

Idempotent — re-running it will not double-inject. Run from the repo root:

    python3 _shared/inject-attribution.py            # apply
    python3 _shared/inject-attribution.py --check    # report only, change nothing
"""

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent

START = "<!-- START BNC attribution -->"
END = "<!-- END BNC attribution -->"

# Anchor: the Cookiebot loader, which is byte-identical on every page that has it and
# always sits first in <head>. Injecting after it keeps Cookiebot first (required — it has
# to be able to see and block the tags that follow) while staying above the GTM container.
COOKIEBOT_RE = re.compile(
    r'<script id="Cookiebot"[^>]*></script>\n?(?:<!-- END Cookiebot -->\n?)?'
)

# Matches an already-injected block, so a re-run replaces it rather than skipping.
BLOCK_RE = re.compile(re.escape(START) + r".*?" + re.escape(END) + r"\n?", re.DOTALL)

BLOCK = START + """
<script data-cookieconsent="ignore">
/* Paid-click attribution. Runs before the GTM container so `dataLayer` exists for every
   page, and so a gclid is captured on the landing page even if the visitor converts three
   pages later. `window.BNC_ATTR` is what the forms read on submit.

   Storage is tiered on purpose. sessionStorage is always written, so an ad click that
   converts in the same visit is attributable regardless of the cookie banner. The 90-day
   first-party cookie — the only part that tracks across visits — is written only once
   Cookiebot reports marketing consent. */
(function (w, d) {
  w.dataLayer = w.dataLayer || [];
  var KEYS = ['gclid', 'wbraid', 'gbraid', 'msclkid',
              'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
  var CLICK_IDS = ['gclid', 'wbraid', 'gbraid', 'msclkid'];
  var NAME = 'bnc_attr', MAX_AGE = 7776000; /* 90 days */

  function readCookie() {
    try {
      var m = d.cookie.match(/(?:^|;\\s*)bnc_attr=([^;]*)/);
      return m ? JSON.parse(decodeURIComponent(m[1])) : null;
    } catch (e) { return null; }
  }
  function writeCookie(o) {
    try {
      d.cookie = NAME + '=' + encodeURIComponent(JSON.stringify(o)) + ';path=/;max-age=' +
        MAX_AGE + ';samesite=lax' + (location.protocol === 'https:' ? ';secure' : '');
    } catch (e) {}
  }
  function readSession() {
    try { return JSON.parse(sessionStorage.getItem(NAME) || 'null'); } catch (e) { return null; }
  }
  function writeSession(o) {
    try { sessionStorage.setItem(NAME, JSON.stringify(o)); } catch (e) {}
  }
  function marketingOk() {
    try { return !!(w.Cookiebot && w.Cookiebot.consent && w.Cookiebot.consent.marketing); }
    catch (e) { return false; }
  }

  var q, fresh = {}, hasFresh = false, hasClickId = false;
  try { q = new URLSearchParams(location.search); } catch (e) { q = null; }
  if (q) {
    for (var i = 0; i < KEYS.length; i++) {
      var v = q.get(KEYS[i]);
      if (v) {
        fresh[KEYS[i]] = String(v).slice(0, 200);
        hasFresh = true;
        if (CLICK_IDS.indexOf(KEYS[i]) !== -1) hasClickId = true;
      }
    }
  }

  var attr = readSession() || readCookie();
  /* A new click id always wins — it is a fresh paid visit. Campaign params without a click
     id only fill in when nothing is stored yet, so an internal link carrying stale UTMs
     cannot overwrite the real acquisition source. */
  if (hasFresh && (hasClickId || !attr)) {
    fresh.landing_page = String(location.pathname).slice(0, 300);
    fresh.first_seen = new Date().toISOString();
    attr = fresh;
    writeSession(attr);
    if (marketingOk()) writeCookie(attr);
  }
  w.BNC_ATTR = attr || {};

  /* Cookiebot resolves after this script. Promote to the cross-visit cookie once, if and
     when marketing consent lands. */
  function promote() { if (w.BNC_ATTR && w.BNC_ATTR.first_seen && marketingOk()) writeCookie(w.BNC_ATTR); }
  w.addEventListener('CookiebotOnAccept', promote);
  w.addEventListener('CookiebotOnConsentReady', promote);

  /* Native (non-fetch) forms post straight to /api/form, so the values have to ride along
     as hidden inputs. Fetch-based forms read window.BNC_ATTR directly instead. */
  function stamp() {
    if (!w.BNC_ATTR || !w.BNC_ATTR.first_seen) return;
    var forms = d.getElementsByTagName('form');
    for (var i = 0; i < forms.length; i++) {
      var f = forms[i];
      if (f.getAttribute('data-bnc-attr') === '1') continue;
      if (!/\\/api\\/form/.test(f.getAttribute('action') || '')) continue;
      f.setAttribute('data-bnc-attr', '1');
      for (var k in w.BNC_ATTR) {
        if (!Object.prototype.hasOwnProperty.call(w.BNC_ATTR, k)) continue;
        var el = d.createElement('input');
        el.type = 'hidden'; el.name = k; el.value = w.BNC_ATTR[k];
        f.appendChild(el);
      }
    }
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', stamp);
  else stamp();

  /* Conversion event for forms that never navigate. The forms that post natively land on
     thank-you.html, which fires this for them. The fetch-based ones — QuickQuote, the
     datasheet PDF configurator, the line-card quote, the book resource forms and quizzes —
     stay on the page and show an inline success, so they have to fire it themselves.
     Between them they cover most of the site's form volume and none of it was measurable.
     Call once, on confirmed success only. */
  w.bncTrackFormSubmit = function (formType) {
    try {
      var ev = { event: 'form_submission_complete', form_type: String(formType || 'contact') };
      var a = w.BNC_ATTR || {};
      if (a.gclid) ev.gclid = a.gclid;
      if (a.utm_source) ev.utm_source = a.utm_source;
      if (a.utm_campaign) ev.utm_campaign = a.utm_campaign;
      w.dataLayer.push(ev);
    } catch (e) {}
  };
})(window, document);
</script>
""" + END + "\n"


def main() -> int:
    check_only = "--check" in sys.argv
    changed, updated, skipped, no_anchor = [], [], [], []

    for path in sorted(ROOT.rglob("*.html")):
        if any(p in {".git", "node_modules"} for p in path.parts):
            continue
        text = path.read_text(encoding="utf-8", errors="surrogateescape")

        had_block = START in text
        # Strip any existing block first, then re-insert at the anchor. Doing it in that
        # order means a re-run picks up edits to BLOCK *and* relocates it if the anchor
        # moved, instead of leaving a stale copy behind.
        stripped = BLOCK_RE.sub("", text, count=1) if had_block else text

        m = COOKIEBOT_RE.search(stripped)
        if not m:
            # Redirect stubs and HTML fragments carry no tag stack at all. Nothing to do.
            no_anchor.append(path)
            continue

        out = stripped[: m.end()] + BLOCK + stripped[m.end():]
        if out == text:
            skipped.append(path)
            continue
        if not check_only:
            path.write_text(out, encoding="utf-8", errors="surrogateescape")
        (updated if had_block else changed).append(path)

    rel = lambda p: p.relative_to(ROOT)
    print(f"{'would inject' if check_only else 'injected'}: {len(changed)}")
    print(f"{'would update' if check_only else 'updated in place'}: {len(updated)}")
    print(f"already current, skipped: {len(skipped)}")
    print(f"no Cookiebot anchor (redirect stubs / fragments), skipped: {len(no_anchor)}")
    for p in no_anchor:
        print(f"  - {rel(p)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
