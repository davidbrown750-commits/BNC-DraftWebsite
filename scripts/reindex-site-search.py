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
import tempfile
from collections import Counter

ROOT = pathlib.Path(__file__).resolve().parent.parent
HARVEST = pathlib.Path(__file__).resolve().parent / "page-harvest.json"
PRESS = ROOT / "_shared" / "bnc-press-articles.json"

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


# Discontinued products whose own datasheet/manual page must not appear in
# search, so a customer searching a model number sees obsolete-products.html
# steering them to the current replacement, rather than a datasheet for a
# product BNC no longer sells reading as if it were still available. The
# page itself is untouched and still reachable by direct link or nav; it is
# only left out of the generated index. Add a page here only once its exact
# model number is confirmed obsolete on obsolete-products.html - a model
# number can be reused by an unrelated current product (Model 676 currently
# names both an obsolete unit and a shipping AWG), so do not add an entry
# from the model number alone without checking its page is really the
# discontinued one.
SUPERSEDED_URLS = {
    "docs/bnc-awg-676-datasheet.html",
    "docs/bnc-model-588-datasheet.html",
    "docs/bnc-model-588-user-manual.html",
    "docs/bnc-dei-pco-7121-datasheet.html",
    "docs/bnc-dei-pco-7121-user-manual.html",
    "docs/bnc-model-960-datasheet.html",
    "docs/bnc-pm1703gna-datasheet.html",
    "docs/bnc-sam-940-datasheet.html",
    "docs/bnc-sam-945-datasheet.html",
    "docs/bnc-sam-945-user-manual.html",
}


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
    "Blog Post": "Blog Post",
    "Product": "Product",
    "Company": "Product",
}

SLUGGY_RE = re.compile(r"^[0-9A-Za-z]+([-_][0-9A-Za-z]+)+$")
WORD_RE = re.compile(r"[a-z0-9]+(?:[.\-+][a-z0-9]+)*")
# BNC model numbers: 3-4 digits with optional suffix, plus the lettered families
MODEL_RE = re.compile(
    r"\b(?:model\s+)?("
    r"\d{3,4}[a-z]?(?:-[a-z0-9]{1,6})*"
    r"|(?:pvx|pvm|pvp|pco|pcx|pcm|pnc|pim|pm|rfs|vsg|sam|icx|hvx|awg|db|ap|tb|pb)-?[a-z0-9]{1,8}(?:-[a-z0-9]{1,6})*"
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
    """Every subject image the page shows, best first: real figures from the
    body in document order, then its social image. The old cap of three was
    enough when a page needed one picture; the tile assignment needs the whole
    list, because a chapter carrying thirty figures is what lets the thirty
    pages around it each end up with a different one."""
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
        if len(out) >= 40:
            break
    m = OG_RE.search(html)
    if m:
        r = resolve(rel_page, m.group(1))
        if r and r not in out:
            out.append(r)
    return out


# --------------------------------------------------------------------------
# press room articles
# --------------------------------------------------------------------------
# The press room is 136 articles served by one page, docs/press-article.html,
# which reads _shared/bnc-press-articles.json and renders whichever ?id= it is
# handed. A crawler that walks .html files on disk therefore sees exactly one
# press page, so none of the writing in the press room could be found by search.
# Each article is folded in here as its own result, keyed by the query-string URL
# the reader actually opens. The result badge reads Blog Post.

TAG_RE = re.compile(r"<[^>]+>")
ENT = {"&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#8217;": "'",
       "&rsquo;": "'", "&lsquo;": "'", "&ldquo;": '"', "&rdquo;": '"',
       "&nbsp;": " ", "&ndash;": "-", "&mdash;": ", ", "&#8211;": "-",
       "&#8212;": ", ", "&hellip;": "...", "&deg;": " deg", "&times;": "x",
       "&apos;": "'", "&#039;": "'", "&#8230;": "..."}

# "May 5th 2023 - " and friends. The date is already the article's own field, and
# leading it in the result title pushes the actual subject out of the two-line clamp.
DATELEAD_RE = re.compile(
    r"^\s*(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?"
    r"|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+"
    r"\d{1,2}(?:st|nd|rd|th)?[,]?\s*\d{4}\s*[\u2013\u2014:-]+\s*", re.I)


def detag(html):
    """Article bodies are stored as HTML. Search wants the words."""
    t = re.sub(r"<(script|style)\b.*?</\1>", " ", html or "", flags=re.S | re.I)
    t = re.sub(r"<(li|p|h[1-6]|div|br|tr)\b[^>]*>", " . ", t, flags=re.I)
    t = TAG_RE.sub(" ", t)
    for k, v in ENT.items():
        t = t.replace(k, v)
    t = re.sub(r"&#(\d+);",
               lambda m: chr(int(m.group(1))) if int(m.group(1)) < 0x11000 else " ", t)
    t = re.sub(r"\s*\.\s*(\.\s*)+", ". ", t)
    return re.sub(r"\s+", " ", t).strip()


def press_line(text):
    """Which product line an article belongs to, by which line's vocabulary it
    uses most. Same test the FAQ tiles use, so the two agree."""
    low = text.lower()
    best, best_hits = "general", 0
    for ln, terms in LINE_TERMS.items():
        if ln in ("books", "general"):
            continue
        hits = sum(1 for t in set(terms.split())
                   if re.search(r"\b%s\b" % re.escape(t), low))
        if hits > best_hits:
            best, best_hits = ln, hits
    return best if best_hits >= 2 else "general"


def press_pages():
    """The press room, as index entries shaped like every other page."""
    if not PRESS.exists():
        return []
    try:
        arts = json.load(open(PRESS, encoding="utf-8"))
    except (OSError, ValueError):
        return []
    out = []
    for a in arts:
        aid = (a.get("id") or "").strip()
        if not aid:
            continue
        title = detag(a.get("title") or "")
        title = DATELEAD_RE.sub("", title).strip().strip("-\u2013\u2014: ")
        body = detag(a.get("body") or "")
        if not title:
            title = body[:70]
        # the tile prints the headline directly above the description, so the
        # description opens on the article's own first line instead
        lede = body
        if lede.lower().startswith(title.lower()[:40]):
            lede = lede[len(title):].lstrip(" .:-")
        img = (a.get("img") or "").strip().lstrip("/")
        out.append({
            "u": "docs/press-article.html?id=" + aid,
            "t": title,
            "d": lede[:400],
            "og": img,
            "h1": title,
            "firstimg": img,
            "kind": "Blog Post",
            "line": press_line(title + " " + body),
            "words": (title + " " + body)[:24000],
            "_press": {"date": a.get("date") or "", "img": img,
                       "cats": a.get("cats") or [], "body": body},
        })
    return out


def toks(text):
    return [w for w in WORD_RE.findall((text or "").lower())
            if len(w) > 1 and w not in STOP and not blocked(w)]


# --------------------------------------------------------------------------
# result descriptions
# --------------------------------------------------------------------------
# The line under a result tile used to be whatever the page put in its meta
# description, and for the 295 pages with no meta description it was the first
# 170 characters of the page text. That produced tiles reading "(c) 2026
# Berkeley Nucleonics Corporation. Progress is stored..." and a dozen more that
# opened with the company name before saying anything. A searcher already knows
# whose site this is. What they cannot see is what the thing they are about to
# click actually is, and whether it covers the words they typed. So every
# description now names the form first, then says what it covers.

# the form noun, deliberately more specific than the badge: a quiz, a glossary
# and a chapter all badge as E-Book, and they are not the same thing to read
DESC_FORM = {
    "Data Sheet": "Datasheet",
    "User Manual": "Operating manual",
    "Application Brief": "Application note",
    "Technical Note": "Technical brief",
    "Book Chapter": "Book chapter",
    "Book": "Free web book",
    "Blog Post": "Press-room article",
    "Product": "Product overview",
    "Company": "",
    "FAQ": "",
}

# filename tells us more than the harvested kind does for book furniture
FORM_BY_NAME = [
    (re.compile(r"/quiz-|/[0-9]+-quiz|reader-quiz", re.I), "Chapter quiz"),
    (re.compile(r"glossary", re.I), "Glossary"),
    (re.compile(r"bibliograph|further-reading", re.I), "Reading list"),
    (re.compile(r"about-the-authors", re.I), "About the authors"),
    (re.compile(r"/progress\.html$", re.I), "Reading-progress tracker"),
    (re.compile(r"front-matter", re.I), "Book front matter"),
    (re.compile(r"answer-key", re.I), "Quiz answer key"),
    (re.compile(r"/appendix", re.I), "Book appendix"),
    (re.compile(r"/OUTLINE\.html$", re.I), "Book outline"),
]

# attribution and legal furniture, none of which tells a searcher anything
BOILER = [
    (re.compile(r"(?i)(?:\u00a9|&copy;|\(c\))\s*\d{4}[^.]*\.?"), " "),
    (re.compile(r"(?i)\bcopyright\b[^.]*\.?"), " "),
    (re.compile("(?:\u00a9|&copy;)"), " "),
    (re.compile(r"(?i)all rights reserved\.?"), " "),
    (re.compile(r"(?i)\bberkeley\s+nucleonics\s+corporation\b,?"), " "),
    (re.compile(r"(?i)\bberkeley\s+nucleonics\b,?"), " "),
    (re.compile(r"(?i)\bthe nuts and bolts of\b"), " "),
    (re.compile(r"(?i)\b(?:contact|call)\s+us\b[^.]*\.?"), " "),
    (re.compile(r"(?i)\brequest a quote\b[^.]*\.?"), " "),
    (re.compile(r"(?i)\bskip to (?:main )?content\b"), " "),
    (re.compile(r"(?i)\bprivacy policy\b|\bterms of use\b"), " "),
]

SENT_RE = re.compile(r"(?<=[.!?])\s+")


def scrub(text):
    """Strip attribution and legal furniture, then tidy what is left."""
    t = " " + re.sub(r"\s+", " ", text or "") + " "
    for rx, rep in BOILER:
        t = rx.sub(rep, t)
    t = re.sub(r"\s+([,.;:])", r"\1", t)
    t = re.sub(r"([,.;:])\1+", r"\1", t)
    t = re.sub(r"^[\s,.;:\-\u2013\u2014]+", "", t)
    t = re.sub(r"\s+", " ", t).strip()
    if t and t[0].islower() and not re.match(r"^[a-z]{1,4}[0-9(]", t):
        t = t[0].upper() + t[1:]
    return t


def first_real_sentences(words, limit=150):
    """The opening of the page's own prose, skipping nav crumbs and stubs."""
    body = scrub(re.sub(r"\s+", " ", words or "")[:2400])
    out = []
    for s in SENT_RE.split(body):
        s = s.strip()
        if len(s) < 35 or s.count(" ") < 4:
            continue
        if re.match(r"(?i)^(home|products|support|menu|search|next|previous)\b", s):
            continue
        out.append(s)
        if sum(len(x) + 1 for x in out) >= limit:
            break
    return " ".join(out)


def trim_to(text, n):
    """Cut on a sentence boundary where possible, a word boundary otherwise."""
    text = text.strip()
    if len(text) <= n:
        return text
    cut = text[:n]
    dot = max(cut.rfind(". "), cut.rfind("? "), cut.rfind("! "))
    if dot > n * 0.55:
        return cut[:dot + 1].strip()
    return cut.rsplit(" ", 1)[0].rstrip(" ,;:") + "..."


def drop_echo(detail, *headings):
    """Cut a heading the tile already shows off the front of the description.

    Page text usually opens by restating its own title, so an untreated
    description spent its first and most visible line saying a second time
    what the title directly above it had just said."""
    variants = []
    for h in headings:
        h = re.sub(r"\s+", " ", (h or "")).strip()
        # "Why Scintillation, Why Now | Scintillation Detectors" is one heading
        # wearing the site's title suffix; both halves are worth testing
        # "Appendix C. Industry Trends" is a label plus a heading, and the page
        # text opens on the heading alone
        parts = [h] + re.split(r"\s*[|\u00b7\u2013\u2014]\s*", h)
        parts.append(re.sub(r"(?i)^(?:appendix\s+[a-z0-9]+|chapter\s+\d+)[.:]?\s*", "", h))
        for part in parts:
            part = part.strip(" .|:-")
            if len(part) >= 6 and part not in variants:
                variants.append(part)
    variants.sort(key=len, reverse=True)

    for _ in range(3):
        cut = False
        for h in variants:
            if detail[:len(h)].lower() != h.lower():
                continue
            rest = detail[len(h):]
            tail = rest.lstrip(" .:|-\u2013\u2014")
            # A heading is followed by punctuation or by a new sentence. A lower
            # case word means the title was this sentence's subject, so removing
            # it would leave the description starting on a bare verb.
            if rest[:1] not in ("", " ") or not tail:
                continue
            if not (rest.lstrip()[:1] in (".", ":", "|", "\u2013", "\u2014")
                    or tail[:1].isupper() or tail[:1].isdigit()):
                continue
            detail, cut = tail, True
            break
        # "1.1 What a Scintillator Does, in One Paragraph A scintillator is"
        stripped = re.sub(r"^\d+(?:\.\d+)*\s+", "", detail)
        cut = cut or stripped != detail
        detail = stripped
        if not cut:
            break
    return detail.strip()


def make_desc(p, terms):
    """One tile description: the form, then what it covers, then the distinctive
    terms it answers to. Never the company name, never a copyright line."""
    u = p["u"]
    form = ""
    for rx, f in FORM_BY_NAME:
        if rx.search("/" + u):
            form = f
            break
    if not form:
        form = DESC_FORM.get(p["kind"], "")

    detail = drop_echo(scrub(p.get("d") or ""), p.get("t"), p.get("h1"))
    if len(detail) < 45:
        detail = drop_echo(first_real_sentences(p.get("words") or ""),
                           p.get("t"), p.get("h1"))
    detail = trim_to(detail, 165)

    parts = []
    if form:
        parts.append(form + ".")
    if detail:
        parts.append(detail if detail.endswith((".", "!", "?")) else detail + ".")
    out = " ".join(parts).strip()

    # the words this page answers to that the sentence above did not already
    # say, so a searcher can see why their query landed here
    low = out.lower()
    extra = []
    for w in terms:
        if len(w) < 4 or w in low:
            continue
        if not re.search(r"[a-z]{3}", w):        # "0.80", "51b51", "5-16"
            continue
        if any(w in e or e in w for e in extra):  # "crystal" then "crystals"
            continue
        extra.append(w)
        if len(extra) == 4:
            break
    if extra and len(out) < 190:
        tail = " Covers: " + ", ".join(extra) + "."
        if len(out) + len(tail) <= 240:      # never cut a list off mid-item
            out = (out + tail).strip()
    return trim_to(out, 240) or (form or "Reference page.")


def main():
    if not HARVEST.exists():
        print("missing harvest: %s" % HARVEST, file=sys.stderr)
        return 1
    pages = json.load(open(HARVEST, encoding="utf-8"))
    press = press_pages()
    pages = pages + press
    print("pages: %d harvested + %d press-room articles" % (len(pages) - len(press), len(press)))

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

    # ---- tile pictures: the candidate pools -------------------------------
    # Every result carries a real, page-relevant picture, and no two results
    # carry the same one. The old build handed a page a single image and fell
    # back to one representative shot per product line when the page had none
    # of its own, which is why a scintillator search returned the MetRad 1
    # product photo forty-five times over. Each page now offers a ranked list
    # of candidates and an assignment pass gives every result its own.
    GENERIC = {"figures/home/hero.png", "figures/hero.png", "figures/og/hero.png"}
    # book furniture, not subject matter: the Going Deeper banner is injected
    # into every chapter, so it is a picture of nothing in particular.
    POOL_SKIP = ("going-deeper", "-thumb", "sprite", "divider", "rule.")

    def usable(path):
        """A tile image has to be a real subject picture that actually exists.
        The old index carried 99 paths to files that are no longer in the repo,
        which is why those tiles rendered as a bare icon."""
        if not path:
            return ""
        # an inline data: URI is not a file on disk, and stat() on one throws
        if path.startswith("data:") or len(path) > 500:
            return ""
        path = path.lstrip("/")
        if path in GENERIC:
            return ""
        low = path.lower()
        if any(w in low for w in SKIP_IMG) or COVER_CROP_RE.search(low):
            return ""
        if any(w in low for w in POOL_SKIP):
            return ""
        return path if (ROOT / path).is_file() else ""

    own_cache = {}

    def own_all(pg):
        """Every picture the page itself shows, best first."""
        u = pg["u"]
        if u not in own_cache:
            if "?" in u:                    # press article: its own artwork
                own_cache[u] = [c for c in [usable(pg.get("firstimg") or "")] if c]
            else:
                seen, out = set(), []
                for c in page_images(u):
                    c = usable(c)
                    if c and c not in seen:
                        seen.add(c)
                        out.append(c)
                own_cache[u] = out
        return own_cache[u]

    IMG_EXT = (".png", ".jpg", ".jpeg", ".svg", ".webp", ".gif")

    def dir_pool(rel_dir):
        d = ROOT / rel_dir
        if not d.is_dir():
            return []
        out = []
        for f in sorted(d.rglob("*")):
            if f.is_file() and f.suffix.lower() in IMG_EXT:
                r = usable(f.relative_to(ROOT).as_posix())
                if r:
                    out.append(r)
        return out

    # every figure each book ships, so a chapter with no <img> of its own still
    # gets a picture out of its own book rather than a product photo
    pool_cache = {}

    def cached_pool(key, rel_dir):
        if key not in pool_cache:
            pool_cache[key] = dir_pool(rel_dir)
        return pool_cache[key]

    CHAPNUM_RE = re.compile(r"(?:^|[/-])(?:chapter-|quiz-|appendix-)?(\d{1,2})[-.]")

    def book_slug(u):
        return u.split("/")[1] if u.startswith("books/") and u.count("/") > 1 else ""

    def chapter_key(u):
        m = CHAPNUM_RE.search(u.rsplit("/", 1)[-1])
        return "%02d" % int(m.group(1)) if m else ""

    def book_candidates(u):
        """That book's own figures, the ones belonging to this chapter first."""
        slug = book_slug(u)
        if not slug:
            return []
        pool = cached_pool("book:" + slug, "books/%s/figures" % slug)
        ck = chapter_key(u)
        if not ck:
            return pool
        n = int(ck)
        # fig-03-..., chapter-03-opener, Ch3_Sec3.1_Figure2, 03-materials
        pats = [re.compile(r"(?:^|[/_-])(?:fig|chapter|ch)?[-_]?0?%d[-_.]" % n, re.I),
                re.compile(r"(?:^|/)ch0?%d[_-]" % n, re.I)]
        mine = [p for p in pool if any(r.search(p.rsplit("/", 1)[-1]) for r in pats)]
        rest = [p for p in pool if p not in mine]
        return mine + rest

    DOCFIG_RE = re.compile(r"^docs/(?:bnc-)?(.+?)-(datasheet|user-manual)\.html$")

    def doc_candidates(u):
        """A datasheet or manual keeps its own figure folder under docs/figures."""
        m = DOCFIG_RE.match(u)
        if not m:
            return []
        stem = m.group(1).replace("bnc-", "")
        suffix = "ds" if m.group(2) == "datasheet" else "man"
        out = []
        for cand in ("%s-%s" % (stem, suffix), stem):
            out += cached_pool("doc:" + cand, "docs/figures/" + cand)
        return out

    # every picture that any page of a product line actually shows, so a line
    # fallback is a real pool rather than one repeated photo
    line_pool = {}
    for pg in pages:
        line_pool.setdefault(pg["line"], [])
        for c in own_all(pg):
            if c not in line_pool[pg["line"]]:
                line_pool[pg["line"]].append(c)

    GLOBAL_POOL = []
    for _ln in sorted(line_pool):
        for c in line_pool[_ln]:
            if c not in GLOBAL_POOL:
                GLOBAL_POOL.append(c)
    for _d in ("figures/apps", "figures/scint", "figures/wp", "docs/figures"):
        for c in cached_pool("g:" + _d, _d):
            if c not in GLOBAL_POOL:
                GLOBAL_POOL.append(c)

    def borrowable(paths):
        """Pictures a page may inherit. A page keeps whatever it displays
        itself, but a name that identifies a supplier does not get carried onto
        tiles for pages that never showed it."""
        return [c for c in paths if "scionix" not in c.lower()]

    def candidates(pg):
        """Ranked pictures for one result. Rank is priority, not quality: the
        page's own artwork always outranks anything borrowed."""
        u = pg["u"]
        out = []

        def push(paths):
            for c in paths:
                c = usable(c)
                if c and c not in out:
                    out.append(c)

        push(own_all(pg))
        push([pg.get("og") or "", pg.get("firstimg") or ""])
        push(borrowable(doc_candidates(u)))
        push(borrowable(book_candidates(u)))
        push(borrowable(line_pool.get(pg["line"], [])))
        return out

    index, ssdesc, ssimg = [], {}, {}
    cand_of = {}
    no_img = []


    seen_urls = set()
    for p in pages:
        u = p["u"]
        if u in SUPERSEDED_URLS or u in seen_urls:
            continue
        seen_urls.add(u)
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

        # Model numbers are pulled from the page's full text, not a truncated
        # slice of it. A 1200-char cap here silently dropped every model past
        # the opening of long reference pages such as obsolete-products.html,
        # which is precisely the page that most needs every model captured.
        blob = " ".join([title, p["d"], p["words"]]).lower()
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
        ssdesc[u] = make_desc(p, [w for _, w in scored[:14]])

        # -- tile pictures, ranked; which one it gets is settled below -------
        c = candidates(p)
        prev = usable(old_img.get(u, ""))
        if prev:
            c = [prev] + [x for x in c if x != prev]
        cand_of[u] = c

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
        if not u or u in cand_of:
            continue
        text = ((e.get("q") or "") + " " + (e.get("kw") or "")).lower()
        ranked = sorted(
            LINE_TERMS,
            key=lambda ln: -sum(1 for t in set(LINE_TERMS[ln].split())
                                if re.search(r"\b%s\b" % re.escape(t), text)))
        pool = []
        for ln in ranked[:3]:
            for c in line_pool.get(ln, []):
                if c not in pool:
                    pool.append(c)
        cand_of[u] = pool

    # ---- one distinct picture per result -----------------------------------
    # A first-come walk is what produced the duplicates: whichever page was
    # reached first claimed the product photo and every later page that had no
    # picture of its own inherited the same one. This is an assignment instead.
    # Kuhn's augmenting path maximises how many results get a picture drawn from
    # their own page, and it keeps re-running while any result can still be
    # improved, so the loop only stops once no two tiles can be made to differ.
    def solve(cands):
        owner = {}                       # image -> url that holds it
        got = {}                         # url -> image

        def augment(u, seen, depth):
            for c in cands.get(u, ()):
                if c in seen:
                    continue
                seen.add(c)
                holder = owner.get(c)
                if holder is None or (depth < 24 and augment(holder, seen, depth + 1)):
                    owner[c] = u
                    got[u] = c
                    return True
            return False

        # scarcest first: a page with one possible picture must choose before a
        # page that could have used any of two hundred
        for u in sorted(cands, key=lambda k: (len(cands[k]), k)):
            augment(u, set(), 0)
        return got, owner

    sys.setrecursionlimit(10000)
    assigned, owner = solve(cand_of)

    # results that could not be matched to a picture of their own draw from the
    # site-wide pool, still without repeating one another
    spare = [c for c in GLOBAL_POOL if c not in owner]
    si = 0
    borrowed = 0
    for u in sorted(cand_of):
        if u in assigned:
            ssimg[u] = assigned[u]
            continue
        if si < len(spare):
            ssimg[u] = spare[si]
            owner[spare[si]] = u
            si += 1
            borrowed += 1
        elif cand_of[u]:
            ssimg[u] = cand_of[u][0]     # supply exhausted: repeat, do not blank
        else:
            no_img.append(u)

    distinct = len(set(ssimg.values()))
    print("tile images: %d results, %d distinct (%d borrowed from the site pool, "
          "%d with no picture)" % (len(ssimg), distinct, borrowed, len(no_img)))
    if distinct < len(ssimg):
        dupes = Counter(ssimg.values())
        for pth, n in dupes.most_common(5):
            if n > 1:
                print("   still shared %dx: %s" % (n, pth))


    index.sort(key=lambda e: e["u"])
    print("index %d entries (was %d), ssdesc %d, ssimg %d, no image %d"
          % (len(index), len(old_index), len(ssdesc), len(ssimg), len(no_img)))
    for u in no_img[:10]:
        print("   no image: %s" % u)

    json.dump({"SITE_INDEX": index, "SSDESC": ssdesc, "SSIMG": ssimg},
              open(pathlib.Path(tempfile.gettempdir()) / "new-index.json", "w"))
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
