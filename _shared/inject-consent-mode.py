#!/usr/bin/env python3
"""Declare Google Consent Mode v2 defaults, and let the GTM container load for everyone.

THIS CHANGES CONSENT BEHAVIOUR SITEWIDE. Read before merging.

What it was
-----------
Cookiebot runs in `data-blockingmode="manual"`, and the GTM container was loaded as
`<script type="text/plain" data-cookieconsent="statistics">`. Cookiebot only rewrites that
to executable JavaScript once the visitor grants the *statistics* category. A visitor who
declined the banner, or simply ignored it, loaded no Google tag at all.

That is stricter than it looks, and worse for everyone involved. The container sets no
cookies by itself, so blocking it buys no additional privacy — but it does mean Google
receives no signal whatsoever for those visitors, not even "this person said no." Nothing is
measured, and nothing is modelled to fill the gap. Conversions from that share of traffic
simply do not exist. There was also no `gtag('consent', ...)` call anywhere on the site, so
Consent Mode was not implemented in any form.

What it is now
--------------
The Google- and Cookiebot-documented arrangement:

  1. Consent Mode defaults are declared BEFORE Cookiebot, with every storage type denied
     (bar `security_storage`). Nothing is stored, and no ad identifier is sent, until the
     visitor says yes.
  2. The container is allowed to load, so those defaults reach Google and the tags inside
     can respect them. Individual tags still honour the consent state.
  3. Cookiebot's answer is bridged to `gtag('consent', 'update', ...)`.

`url_passthrough` keeps the gclid on internal navigation while ad_storage is denied, which
is what preserves attribution for a non-consenting click. `ads_data_redaction` strips ad
identifiers from denied-state pings.

Visual Visitor and Bing UET are deliberately left gated on `marketing` exactly as they are.
They are third-party trackers that do set identifiers of their own; this change is only
about the Google container and the consent signal.

Note for whoever reviews this: Cookiebot has its own Consent Mode integration that must be
switched on in the Cookiebot admin. The bridge here works whether or not that toggle is set,
and running both is harmless — consent updates are last-write-wins with identical values.

Idempotent. Run from the repo root:

    python3 _shared/inject-consent-mode.py            # apply
    python3 _shared/inject-consent-mode.py --check    # report only, change nothing
    python3 _shared/inject-consent-mode.py --revert   # undo, restoring the gated container
"""

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent

START = "<!-- START BNC consent mode -->"
END = "<!-- END BNC consent mode -->"

COOKIEBOT_START = "<!-- START Cookiebot -->"

GTM_GATED = '<script type="text/plain" data-cookieconsent="statistics">(function(w,d,s,l,i)'
GTM_OPEN = '<script data-cookieconsent="ignore">(function(w,d,s,l,i)'

BLOCK_RE = re.compile(re.escape(START) + r".*?" + re.escape(END) + r"\n?", re.DOTALL)

BLOCK = START + """
<script data-cookieconsent="ignore">
/* Google Consent Mode v2 defaults. Must run before Cookiebot and before the GTM container.

   Everything is denied until the visitor agrees — nothing is stored and no ad identifier is
   sent before then. Declaring the defaults is what lets the container load for everyone
   without loading anything *into* storage: Google gets a "denied" signal it can model
   against, instead of the silence it used to get from anyone who declined the banner.

   url_passthrough keeps the gclid on internal navigation while ad_storage is denied, which
   is what preserves attribution for a non-consenting click. ads_data_redaction strips ad
   identifiers from those denied-state pings. */
(function (w) {
  w.dataLayer = w.dataLayer || [];
  function gtag() { w.dataLayer.push(arguments); }
  w.gtag = w.gtag || gtag;

  gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
    functionality_storage: 'denied',
    personalization_storage: 'denied',
    security_storage: 'granted',
    wait_for_update: 500
  });
  gtag('set', 'ads_data_redaction', true);
  gtag('set', 'url_passthrough', true);

  /* Bridge Cookiebot's answer into Consent Mode. Cookiebot's built-in integration has to be
     enabled in the Cookiebot admin; this works whether or not it is, and running both is
     harmless because consent updates are last-write-wins with identical values. */
  function update() {
    var c = w.Cookiebot && w.Cookiebot.consent;
    if (!c) return;
    gtag('consent', 'update', {
      ad_storage: c.marketing ? 'granted' : 'denied',
      ad_user_data: c.marketing ? 'granted' : 'denied',
      ad_personalization: c.marketing ? 'granted' : 'denied',
      analytics_storage: c.statistics ? 'granted' : 'denied',
      functionality_storage: c.preferences ? 'granted' : 'denied',
      personalization_storage: c.preferences ? 'granted' : 'denied'
    });
  }
  w.addEventListener('CookiebotOnAccept', update);
  w.addEventListener('CookiebotOnDecline', update);
  w.addEventListener('CookiebotOnConsentReady', update);
})(window);
</script>
""" + END + "\n"


def main() -> int:
    check = "--check" in sys.argv
    revert = "--revert" in sys.argv
    changed, skipped, no_anchor, ungated = [], [], [], 0

    for path in sorted(ROOT.rglob("*.html")):
        if any(p in {".git", "node_modules"} for p in path.parts):
            continue
        text = path.read_text(encoding="utf-8", errors="surrogateescape")
        orig = text

        if revert:
            text = BLOCK_RE.sub("", text)
            text = text.replace(GTM_OPEN, GTM_GATED)
        else:
            if COOKIEBOT_START not in text:
                no_anchor.append(path)
                continue
            text = BLOCK_RE.sub("", text)  # strip any prior copy so edits roll out
            text = text.replace(COOKIEBOT_START, BLOCK + COOKIEBOT_START, 1)
            if GTM_GATED in text:
                text = text.replace(GTM_GATED, GTM_OPEN)
                ungated += 1

        if text == orig:
            skipped.append(path)
            continue
        if not check:
            path.write_text(text, encoding="utf-8", errors="surrogateescape")
        changed.append(path)

    verb = "would change" if check else ("reverted" if revert else "changed")
    print(f"{verb}: {len(changed)}")
    print(f"container un-gated on: {ungated}")
    print(f"already current, skipped: {len(skipped)}")
    print(f"no Cookiebot anchor, skipped: {len(no_anchor)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
