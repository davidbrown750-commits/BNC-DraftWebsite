#!/usr/bin/env python3
"""
Rebuild the on-site search index from the pages themselves, then roll it across
every page that carries the search.

The old index covered 436 of the site's 690 pages, so a keyword that only
appeared on, say, a book chapter or a DEI manual simply could not be found. This
walks every indexable page, mines its own words for what makes it distinctive,
and writes three sitewide-identical blocks:

  window.SITE_INDEX  {t,u,c,k}  what can be found, and under which words
  window.SSDESC      {url: text} the line of description under each result tile
  window.SSIMG       {url: path} the picture on each result tile

Keywords are the union of three sources: the page's own title and description,
every model number it mentions, and the terms that are common on this page but
rare across the site. Where the previous index already had hand-written keywords
for a page, those are kept and added to rather than replaced.

Run from the repository root. Re-running is a no-op.
"""

import json
import math
import hashlib
import pathlib
import posixpath
import re
import subprocess
import sys
from collections import Counter

ROOT = pathlib.Path(__file__).resolve().parent.parent
HARVEST = pathlib.Path("/Users/davidbrown/.claude/jobs/d192174c/tmp/page-harvest.json")

# --------------------------------------------------------------------------
# vocabulary
# --------------------------------------------------------------------------

STOP = set("""
a an the and or of to in on for with without at by from as is are was were be been being
this that these those it its it's their there here we our us you your they them he she his
her i me my mine not no nor but if then else when while how what which who whom whose why
where all any both each few more most other some such only own same so than too very can
will just should now also into over under again further once during before after above
below up down out off between about against through
one two three four five six seven eight nine ten first second third
page chapter section figure table note fig see next previous back top bottom
berkeley nucleonics corporation bnc inc com www http https html pdf
use used using uses need needs provide provides provided make makes made
new full high low good best better since per via etc
""".split())

# Confidential OEM supplier names, which must never reach a generated keyword.
# The index is a public artifact: every keyword in it is served to anyone who
# loads the site. On 2026-08-09 one such name had reached the live SAM 940+ index
# entry, harvested out of the manual's own text.
#
# The names are held as SHA-256 digests rather than as plain words because this
# file is itself served: /scripts/reindex-site-search.py returns 200 to anyone who
# asks. Writing the words here in the clear would republish exactly what the list
# exists to suppress. Add a name with:  hashlib.sha256(b"name").hexdigest()
#
# Removing a digest re-exposes that supplier site-wide on the next reindex.
BLOCKED_DIGESTS = {
    "570217f38dbbd8dd63db461cac47244f5a99dc5ae437617eb5cb6de6515f25c8",
    "2aedd2a1f235c076693b2dfb8129f8c6947e51d3e04f090cf4159da85d2c25f3",
}


def blocked(word):
    """True if this token names a confidential supplier and must not be indexed."""
    return hashlib.sha256(word.encode("utf-8")).hexdigest() in BLOCKED_DIGESTS


# Words that mean the same thing to a customer as the word they typed. The
# search engine has its own synonym map for queries; this one widens what a
# PAGE answers to, which is the half that was missing.
LINE_TERMS = {
    "pdg": "pulse delay generator ddg timing trigger gate jitter width channel sync strobe digital",
    "rfsg": "rf microwave signal generator synthesizer source frequency phase noise sweep list power sensor vector modulation",
    "awg": "arbitrary waveform generator awg arb sampling playback pattern sequence memory",
    "riid": "isotope identification radiation detection riid spectroscopy gamma neutron dose survey nuclide sam handheld",
    "scintiq": "scintillation detector crystal scintillator nai labr cebr clyc cllbc sipm pmt gamma neutron assembly",
    "dei": "high voltage pulser pulse current driver laser diode pockels kilovolt avalanche mosfet dei",
    "hvx": "high voltage power supply hv precision programmable polarity floating ripple regulation kilovolt",
    "rtsa": "real time spectrum analyzer rtsa handheld portable sweep poi ew sigint interference monitoring",
    "icx": "spectrum analyzer handheld rugged usb fieldhawk icx real time poi field portable",
    "nim": "nim module bin crate nuclear instrumentation amplifier discriminator",
    "medusa": "medusa multichannel detector array",
    "megiq": "megiq antenna measurement vna radiation chamber",
    "brightspec": "brightspec spectrometer millimeter wave rotational spectroscopy",
    "spectechniques": "spectechniques mossbauer spectrometer velocity transducer",
    "heinzinger": "heinzinger high voltage power supply precision",
    "books": "guide handbook primer tutorial fundamentals theory introduction nuts bolts",
    "general": "berkeley nucleonics company support service contact",
}

LINE_LABEL = {
    "pdg": "Pulse & Delay Generators",
    "rfsg": "RF & Microwave Signal Generators",
    "awg": "Arbitrary Waveform Generators",
    "riid": "Isotope ID & Radiation Detection",
    "scintiq": "Scintillation Detectors",
    "dei": "High Power/Current Pulsers",
    "hvx": "HVX High Voltage Power Supplies",
    "rtsa": "ICX-FieldHawk Spectrum Analyzers",
    "icx": "ICX-FieldHawk Spectrum Analyzers",
    "nim": "NIM Modules",
    "medusa": "Medusa",
    "megiq": "MegiQ",
    "brightspec": "BrightSpec",
    "spectechniques": "SpecTechniques",
    "heinzinger": "Heinzinger",
    "books": "Nuts & Bolts Library",
    "general": "Berkeley Nucleonics",
}

# The type text the result badge reads. ssgBadge() looks at the last "·"
# segment, so these strings are load bearing.
KIND_TYPE = {
    "Data Sheet": "Data Sheet",
    "User Manual": "User Manual",
    "Application Brief": "Application Brief",
    "Technical Note": "Technical Note",
    "FAQ": "FAQ",
    "Book Chapter": "Book Chapter",
    "Book": "Book",
    "Product": "Product",
    "Company": "Product",
}

SLUGGY_RE = re.compile(r"^[0-9A-Za-z]+([-_][0-9A-Za-z]+)+$")
WORD_RE = re.compile(r"[a-z0-9]+(?:[.\-+][a-z0-9]+)*")
# BNC model numbers: 3-4 digits with optional suffix, plus the lettered families
MODEL_RE = re.compile(
    r"\b(?:model\s+)?("
    r"\d{3,4}[a-z]?(?:-[a-z0-9]{1,6})*"
    r"|(?:pvx|pvm|pvp|pco|pcx|pcm|pnc|pim|rfs|vsg|sam|icx|hvx|awg|db|ap|tb|pb)-?[a-z0-9]{1,8}(?:-[a-z0-9]{1,6})*"
    r")\b"
)


# --------------------------------------------------------------------------
# tile images, resolved from the page itself
# --------------------------------------------------------------------------

SKIP_IMG = ("logo", "icon", "favicon", "spacer", "bioz", "about-david-brown",
            "author", "placeholder", "1x1", "pixel", "badge", "wordmark")
IMG_RE = re.compile(r'<img\b[^>]*?\bsrc="([^"]+)"', re.I)
OG_RE = re.compile(r'<meta[^>]+property="og:image"[^>]+content="([^"]+)"', re.I)
CHROME_RE = re.compile(r"<header\b.*?</header>|<footer\b.*?</footer>|<nav\b.*?</nav>", re.S | re.I)
# A page-one crop out of a source PDF is almost always the letterhead band, so it
# lands a BNC logo on the result tile instead of the product. Later pages are
# real figures and stay eligible.
COVER_CROP_RE = re.compile(r"/p01-x\d+\.", re.I)


def resolve(rel_page, src):
    """Turn an img src on rel_page into a root-relative path, or "" if it is
    external, inline, or does not exist on disk."""
    src = (src or "").strip()
    if not src or src.startswith(("data:", "//")):
        return ""
    if src.startswith(("http://", "https://")):
        m = re.match(r"https?://(?:www\.)?berkeleynucleonics\.com/(.*)", src)
        if not m:
            return ""
        src = m.group(1)
    src = src.split("#")[0].split("?")[0]
    low = src.lower()
    if any(w in low for w in SKIP_IMG) or COVER_CROP_RE.search(low):
        return ""
    if src.startswith("/"):
        path = src.lstrip("/")
    else:
        base = rel_page.rsplit("/", 1)[0] if "/" in rel_page else ""
        path = posixpath.normpath(posixpath.join(base, src))
    if path.startswith(".."):
        return ""
    return path if (ROOT / path).is_file() else ""


def page_images(rel_page):
    """The page's own subject image, best first: a real figure from the body,
    then its social image."""
    try:
        html = (ROOT / rel_page).read_text(encoding="utf-8", errors="replace")
    except OSError:
        return []
    body = CHROME_RE.sub(" ", html)
    out = []
    for m in IMG_RE.finditer(body):
        r = resolve(rel_page, m.group(1))
        if r and r not in out:
            out.append(r)
        if len(out) >= 3:
            break
    m = OG_RE.search(html)
    if m:
        r = resolve(rel_page, m.group(1))
        if r and r not in out:
            out.append(r)
    return out


def toks(text):
    return [w for w in WORD_RE.findall((text or "").lower())
            if len(w) > 1 and w not in STOP and not blocked(w)]


def main():
    if not HARVEST.exists():
        print("missing harvest: %s" % HARVEST, file=sys.stderr)
        return 1
    pages = json.load(open(HARVEST, encoding="utf-8"))

    # ---- carry the previous index's hand-written keywords forward ----------
    src = (ROOT / "index.html").read_text(encoding="utf-8")

    def grab(blob, name, opener):
        i = blob.find("window." + name + "=")
        if i < 0:
            return None
        j = blob.find(opener, i)
        closer = {"[": "]", "{": "}"}[opener]
        d = 0
        for k in range(j, len(blob)):
            if blob[k] == opener:
                d += 1
            elif blob[k] == closer:
                d -= 1
                if d == 0:
                    break
        return json.loads(blob[j:k + 1])

    def block(ident, tag="script"):
        m = re.search(r"<%s id=\"%s\"[^>]*>" % (tag, ident), src)
        st = m.end()
        return src[st:src.find("</%s>" % tag, st)]

    # After the first run the payload lives in the shared file, so that is where
    # the previous state has to be read from; index.html no longer carries it.
    shared_path = ROOT / "_shared" / "bnc-search-index.js"
    if shared_path.exists():
        prev = shared_path.read_text(encoding="utf-8")
        old_index = grab(prev, "SITE_INDEX", "[") or []
        old_img = grab(prev, "SSIMG", "{") or {}
    else:
        old_index = grab(block("ss-data"), "SITE_INDEX", "[") or []
        old_img = grab(block("ss-js"), "SSIMG", "{") or {}
    old_by_url = {e["u"]: e for e in old_index}

    # ---- document frequency, so we can tell distinctive words from filler --
    df = Counter()
    page_toks = {}
    for p in pages:
        t = set(toks(p["words"]))
        page_toks[p["u"]] = t
        df.update(t)
    n_docs = len(pages)

    # ---- book titles, so a chapter result says which book it came from -----
    book_title = {}
    for p in pages:
        if p["kind"] == "Book":
            book_title[p["u"].rsplit("/", 1)[0]] = re.sub(
                r"^(The\s+)?Nuts (and|&amp;|&) Bolts of\s+", "", p["t"]
            ).strip()

    # ---- fallback tile images ---------------------------------------------
    # Every result must carry a real, page-relevant picture. The site-wide hero
    # is what most docs/ pages declare as og:image, so it is explicitly demoted:
    # a genuine figure from the page body beats a shared banner every time.
    GENERIC = {"figures/home/hero.png", "figures/hero.png", "figures/og/hero.png"}

    def usable(path):
        """A tile image has to be a real subject picture that actually exists.
        The old index carried 99 paths to files that are no longer in the repo,
        which is why those tiles rendered as a bare icon."""
        if not path:
            return ""
        path = path.lstrip("/")
        if path in GENERIC:
            return ""
        if any(w in path.lower() for w in SKIP_IMG) or COVER_CROP_RE.search(path.lower()):
            return ""
        return path if (ROOT / path).is_file() else ""

    own_cache = {}

    def own(pg):
        u = pg["u"]
        if u not in own_cache:
            cands = [c for c in page_images(u) if usable(c)]
            own_cache[u] = cands[0] if cands else ""
        return own_cache[u]

    # one representative image per product line, taken from a real product page
    line_img = {}
    for pg in pages:
        if pg["kind"] in ("Data Sheet", "Product"):
            img = own(pg)
            if img and pg["line"] not in line_img:
                line_img[pg["line"]] = img
    for pg in pages:                       # second pass, any page type
        img = own(pg)
        if img and pg["line"] not in line_img:
            line_img[pg["line"]] = img

    # one cover per book, taken from that book's own landing page
    book_img = {}
    for pg in pages:
        if pg["kind"] == "Book":
            img = own(pg)
            if img:
                book_img[pg["u"].split("/")[1]] = img

    index, ssdesc, ssimg = [], {}, {}
    no_img = []

    for p in pages:
        u = p["u"]
        old = old_by_url.get(u)

        # -- title ----------------------------------------------------------
        # The previous index kept some titles that were really filenames
        # ("02-rf-fundamentals"), so a curated title only wins if it reads like
        # one.
        prev_t = (old or {}).get("t") or ""
        if SLUGGY_RE.match(prev_t.strip()):
            prev_t = ""
        title = prev_t or p["t"] or p["h1"] or u
        title = re.sub(r"\s+", " ", title).strip()

        # -- category -------------------------------------------------------
        # Derived, not inherited. The old index had a scintillator datasheet
        # filed under ICX-FieldHawk and 16 DEI datasheets with no type segment
        # at all, so their result badges read "Product" instead of "Datasheet".
        if p["kind"] == "Book Chapter":
            bt = book_title.get(u.rsplit("/html/", 1)[0], "Nuts & Bolts")
            cat = "%s · Book Chapter" % bt
        else:
            cat = "%s · %s" % (LINE_LABEL.get(p["line"], "Berkeley Nucleonics"),
                               KIND_TYPE.get(p["kind"], "Product"))

        # -- keywords -------------------------------------------------------
        kw = []
        kw += toks(title)
        kw += toks(p["d"])
        kw += toks(p["h1"])
        kw += LINE_TERMS.get(p["line"], "").split()
        kw += toks(KIND_TYPE.get(p["kind"], ""))
        if old and old.get("k"):
            kw += toks(old["k"])          # keep what was curated by hand

        blob = " ".join([title, p["d"], p["words"][:1200]]).lower()
        kw += [m.group(1) for m in MODEL_RE.finditer(blob)]

        # the terms this page leans on that the rest of the site does not
        tf = Counter(toks(p["words"]))
        scored = sorted(
            ((c * math.log(n_docs / (1 + df[w])), w) for w, c in tf.items() if df[w] < n_docs * 0.35),
            reverse=True,
        )
        kw += [w for _, w in scored[:28]]

        seen, out = set(), []
        for w in kw:
            if w and w not in seen and w not in STOP and not blocked(w):
                seen.add(w)
                out.append(w)
        index.append({"t": title, "u": u, "c": cat, "k": " ".join(out)})

        # -- tile description ----------------------------------------------
        desc = p["d"].strip()
        if not desc:
            desc = re.sub(r"\s+", " ", p["words"]).strip()[:170]
            desc = desc.rsplit(" ", 1)[0] if len(desc) == 170 else desc
        ssdesc[u] = desc

        # -- tile image ------------------------------------------------------
        # curated thumbnail, then the page's own figure, then its og image,
        # then the book cover or the product line, and only then the site hero
        img = usable(old_img.get(u, "")) or own(p)
        if not img and u.startswith("books/"):
            img = book_img.get(u.split("/")[1], "")
        if not img:
            img = line_img.get(p["line"], "")
        if not img:
            img = p["og"] or p["firstimg"] or line_img.get("general", "")
        if img:
            ssimg[u] = img
        else:
            no_img.append(u)

    # -- FAQ answers are results too, and they need a picture ---------------
    # They live in their own array keyed by faq.html#q-..., so they never had an
    # SSIMG entry and always rendered as a bare question-mark icon.
    faqs = []
    if shared_path.exists():
        faqs = grab(shared_path.read_text(encoding="utf-8"), "SS_FAQS", "[") or []
    if not faqs:
        faq_src = (ROOT / "index.html").read_text(encoding="utf-8")
        fi = faq_src.find("var FAQS=[")
        fj = faq_src.find("var wrap=document.querySelector", fi)
        try:
            faqs = json.loads(faq_src[fi + len("var FAQS="):fj].rstrip().rstrip(";"))
        except Exception:
            faqs = []
    for e in faqs:
        u = e.get("u", "")
        if not u or u in ssimg:
            continue
        text = ((e.get("q") or "") + " " + (e.get("kw") or "")).lower()
        best, best_hits = "general", 0
        for ln, terms in LINE_TERMS.items():
            hits = sum(1 for t in set(terms.split()) if re.search(r"\b%s\b" % re.escape(t), text))
            if hits > best_hits:
                best, best_hits = ln, hits
        img = line_img.get(best) or line_img.get("general")
        if img:
            ssimg[u] = img
    print("faq tile images added: %d of %d" % (sum(1 for e in faqs if e.get("u") in ssimg), len(faqs)))

    index.sort(key=lambda e: e["u"])
    print("index %d entries (was %d), ssdesc %d, ssimg %d, no image %d"
          % (len(index), len(old_index), len(ssdesc), len(ssimg), len(no_img)))
    for u in no_img[:10]:
        print("   no image: %s" % u)

    json.dump({"SITE_INDEX": index, "SSDESC": ssdesc, "SSIMG": ssimg},
              open("/Users/davidbrown/.claude/jobs/d192174c/tmp/new-index.json", "w"))
    return write_blocks(index, ssdesc, ssimg, faqs)


def write_blocks(index, ssdesc, ssimg, faqs):
    """Move the search payload into one shared file and point every page at it.

    Inlining it cost 254 KB on each of 343 pages, roughly three quarters of the
    HTML, and a richer index would have made that worse. In a shared file it is
    downloaded once and cached for the whole visit.
    """
    j = lambda o: json.dumps(o, separators=(",", ":"), ensure_ascii=False)

    raw = subprocess.check_output(["git", "ls-files", "-z", "*.html"], cwd=ROOT)
    files = [f for f in raw.decode("utf-8").split("\0") if f and not f.startswith(".claude/")]

    # ---- lift the FAQ list out of the engine, once ------------------------
    home = (ROOT / "index.html").read_text(encoding="utf-8")
    a = home.find('<script id="ss-js">') + len('<script id="ss-js">')
    b = home.find("</script>", a)
    js = home[a:b]
    code = js[js.find("/*ssx v4"):]
    f0 = code.find("var FAQS=[")
    f1 = code.find("var wrap=document.querySelector")
    if f0 >= 0:
        # re-serialised rather than copied verbatim, so the generated file is
        # byte-stable no matter which run produced it
        faqs_literal = j(json.loads(code[f0 + len("var FAQS="):f1].rstrip().rstrip(";")))
        engine = code[:f0] + "var FAQS=window.SS_FAQS||[];" + code[f1:]
    else:
        # already lifted on a previous run; keep the list we read back
        faqs_literal = j(faqs)
        engine = code

    shared = ROOT / "_shared" / "bnc-search-index.js"
    shared.write_text(
        "/* Berkeley Nucleonics on-site search data. Generated by\n"
        "   scripts/reindex-site-search.py from the pages themselves. Do not hand edit. */\n"
        "window.SITE_INDEX=" + j(index) + ";\n"
        "window.SSDESC=" + j(ssdesc) + ";\n"
        "window.SSIMG=" + j(ssimg) + ";\n"
        "window.SS_FAQS=" + faqs_literal + ";\n",
        encoding="utf-8",
    )
    print("wrote %s (%.0f KB)" % (shared, shared.stat().st_size / 1024))

    changed = 0
    for rel in files:
        path = ROOT / rel
        s = original = path.read_text(encoding="utf-8")
        p = "../" * rel.count("/")
        tag = '<script src="%s_shared/bnc-search-index.js"></script>' % p

        if 'id="ss-data"' not in s:
            # The press room carried the search box and its styling but never the
            # engine, so typing in it did nothing at all. Give it the same stack
            # every other page gets.
            if 'id="ss-css"' not in s or 'class="ss-wrap"' not in s:
                continue
            k = s.rfind("</body>")
            s = (s[:k] + '<script id="ss-data">window.SS_BASE="%s";</script>' % p
                 + tag + '<script id="ss-js">' + engine + "</script>\n" + s[k:])
            path.write_text(s, encoding="utf-8")
            changed += 1
            print("  gave %s the search engine it was missing" % rel)
            continue

        # ss-data keeps only the depth-relative base, which cannot be shared
        s = re.sub(r'(<script id="ss-data">).*?(</script>)',
                   lambda m: m.group(1) + 'window.SS_BASE="%s";' % p + m.group(2),
                   s, count=1, flags=re.S)

        # ss-js keeps only the engine
        s = re.sub(r'(<script id="ss-js">).*?(</script>)',
                   lambda m: m.group(1) + engine + m.group(2),
                   s, count=1, flags=re.S)

        # the shared file must execute before the engine reads window.SITE_INDEX,
        # so it is a plain ordered script immediately above it
        if tag not in s:
            s = s.replace('<script id="ss-js">', tag + '<script id="ss-js">', 1)

        if s != original:
            path.write_text(s, encoding="utf-8")
            changed += 1

    print("rewired search on %d pages" % changed)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
