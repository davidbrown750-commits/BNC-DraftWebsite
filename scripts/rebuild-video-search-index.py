#!/usr/bin/env python3
"""Rebuild video-search-index.json so site search covers the whole YouTube channel.

WHY THIS EXISTS
The index held 33 videos. The channel has 205. The missing 172 could not be found by site
search at all, no matter what a visitor typed, and that included everything published recently:
the SpectraCore tutorial series, the ICX FieldHawk demos, the RFS-4220 announcement. Nothing in
the repo could add them, because the index was written once by the original video-search work
and never regenerated.

WHAT A VIDEO NEEDS TO BE FINDABLE
Two different things, and conflating them is what made this look expensive:

  * `title` and `kw` decide WHETHER a video matches a query. Every video gets these.
  * `seg` decides WHERE in the video to start playing. Only videos we hold a transcript for
    get these, and the client already treats `seg` as optional - a video without it simply
    opens at the beginning.

So all 205 become searchable immediately, and the 122 that have no transcript yet gain
jump-to-moment later, as the nightly Ask Pulse fetch collects them. Waiting for transcripts
before listing a video would have kept it unfindable for no reason.

PAYLOAD
This roughly doubles the file, from 594 KB to about 1.2 MB, and it will keep growing as
transcripts arrive. That is affordable because of two things, both verified rather than
assumed: the file is fetched lazily by loadVids() when someone actually uses search, not on
page load, and the host serves it Brotli-compressed (608 KB measured down to 207 KB on the
wire). Check both again before letting this grow much past 3 MB.

WHAT IT PRESERVES
Curated keywords already in the index are kept and extended, never replaced. They were written
by hand and are better than anything generated here.

  python scripts/rebuild-video-search-index.py            # report what would change
  python scripts/rebuild-video-search-index.py --write
"""
import argparse
import json
import os
import pathlib
import re
import sys
from collections import Counter

ROOT = pathlib.Path.cwd()
INDEX = ROOT / "video-search-index.json"
ASKPULSE = ROOT.parent.parent / "Ask Pulse Interface" / "askpulse-data" / "tools"
CHANNEL = ASKPULSE / "channel_videos.json"
CACHE = ASKPULSE / "_transcript_cache.json"

AUTHOR = "Berkeley Nucleonics Media"

# Videos that are PRIVATE on YouTube, so a visitor who finds them cannot watch them. They were
# in the old index and had been serving dead results to the public; a result that demands a
# login is worse than no result.
#
# Checked 2026-08-21: each returns playabilityStatus LOGIN_REQUIRED and oEmbed 403, while
# control videos from the same channel return OK and 200, so this is the videos' own status
# and not the rate limiting YouTube applies to bulk requests. Re-check with:
#
#   curl -s "https://www.youtube.com/watch?v=<id>" | grep -o '"playabilityStatus":{"status":"[A-Z_]*"'
#
# If one is made public again it does not need adding back here: it will be on the channel
# listing and this script picks it up. Delete the id from this set at that point.
PRIVATE_ON_YOUTUBE = {
    "CGNaT77so7g",   # Webinar: Achieving 490 MHz Real-Time Bandwidth Using Spectran V6
    "5831eGWwEU4",   # Webinar: Top 10 RTSA-Suite PRO Features
    "FvjOLIabjeI",   # Master RF Signal Mapping in RTSA Suite PRO
    "Y_FiUyqi9yA",   # Master Automation in RTSA Suite PRO
    "sf2_lW5jg4w",   # Webinar: The Perfect Spectrum Analyzer
}

# Words that carry no search value. Deliberately short: the client already weights title and
# keyword hits, so a stray common word costs little, while dropping a real term costs a match.
STOP = set("""a an the of to in on for and or is are was were be been being with by at as it its
this that these those from into over under how what which why when where who whom will would can
could should do does did not no yes you your we our us they them their he she his her i me my
if then than so such but about after before during while more most some any all each other new
using use used get gets got make makes made take takes very just also here there out up down
one two three video watch subscribe channel please thanks thank welcome hello""".split())

# Phrases worth attaching when the topic is obviously present. The client joins kw into one
# string and matches on word starts, so a multi-word phrase still answers a single-word query.
# Matched against the TITLE only. Every needle here has to be specific enough that its presence
# in a title settles the topic on its own. Generic words were tried and removed: "trigger" put
# an arbitrary waveform video at the top of a "pulse generator" search, and "gamma" tagged a
# soil bulk density webinar as an isotope identifier. A keyword list that describes everything
# describes nothing.
TOPIC_PHRASES = [
    (("spectrum analyz", "rtsa", "real-time spectrum", "real time spectrum", "spectracore",
      "fieldhawk", "spectran"), ["spectrum analyzer", "real-time spectrum", "rtsa"]),
    (("arbitrary waveform", "awg", "waveform generat", "true-arb"),
     ["arbitrary waveform generator", "awg", "waveform"]),
    (("pulse generator", "delay generator", "digital delay", "pulse/delay"),
     ["pulse generator", "delay generator", "timing"]),
    (("scintillat", "cebr3", "labr3", "nai(tl)", "photomultiplier", "sipm"),
     ["scintillator", "scintillation detector"]),
    (("isotope", "riid", "radiation detect", "sam 9", "sprd", "radioisotope"),
     ["isotope identifier", "radiation detection", "riid"]),
    (("signal generator", "phase noise", "synthesizer", "microwave source", "microwave signal"),
     ["signal generator", "rf microwave", "phase noise"]),
    (("pulser", "high voltage", "pvx", "pulsed power", "avalanche"),
     ["high voltage pulser", "pulsed power", "high voltage"]),
    (("webinar",), ["webinar"]),
    (("tutorial", "training", "demo", "unboxing", "walkthrough"), ["tutorial", "demonstration"]),
]

# Model numbers as they appear on the line card: a 3-4 digit number, optionally suffixed, or a
# lettered family code. Anchored on a word boundary so a year or a frequency cannot pose as one.
MODEL_RE = re.compile(
    r"\b(?:model\s+)?((?:pvx|pcx|pco|pcm|icx|rfs|sam|rd|pb|db|ap|tb|hvx|gtc)[- ]?\d{2,4}[a-z0-9-]*"
    r"|\d{3,4}[a-z]{0,2}(?:-[a-z0-9]+)?)\b",
    re.I,
)
TOKEN_RE = re.compile(r"[a-z0-9]+(?:[.+-][a-z0-9]+)*")


def mmss(seconds):
    seconds = int(seconds)
    h, rem = divmod(seconds, 3600)
    m, s = divmod(rem, 60)
    return "%d:%02d:%02d" % (h, m, s) if h else "%d:%02d" % (m, s)


def transcript_text(seg, limit=40000):
    return " ".join(str(s[1]) for s in seg if len(s) > 1)[:limit]


def make_keywords(title, seg, existing):
    """Keywords for a video, keeping anything already curated by hand.

    Generated terms are appended after the curated ones rather than replacing them: a person
    who wrote 'receiver stitching' on an entry knew something the transcript frequency count
    does not.
    """
    kw, seen = [], set()

    def add(term):
        term = term.strip().lower()
        if term and term not in seen and len(term) > 1:
            seen.add(term)
            kw.append(term)

    for term in existing or []:
        add(str(term))

    low_title = (title or "").lower()
    body = transcript_text(seg) if seg else ""

    for token in TOKEN_RE.findall(low_title):
        if token not in STOP and not token.isdigit():
            add(token)

    # Model numbers are the highest-value terms here: they are exactly what a customer types.
    for m in MODEL_RE.finditer(low_title):
        add(m.group(1))
    for m in list(MODEL_RE.finditer(body))[:40]:
        add(m.group(1))

    # Topic phrases come from the TITLE alone. Deriving them from the transcript was tried
    # twice and abandoned both times: on a single mention it tagged a soil bulk density webinar
    # as an "isotope identifier" because gamma came up once (1 result became 50), and even
    # requiring five mentions still put an arbitrary waveform video top of "pulse generator".
    # BNC titles its videos descriptively, so the title is the honest signal.
    for needles, phrases in TOPIC_PHRASES:
        if any(n in low_title for n in needles):
            for phrase in phrases:
                add(phrase)

    # A few terms the video genuinely leans on, so a query can land on a video whose title does
    # not happen to contain the word. The threshold is deliberately high: at three occurrences
    # in a transcript of several thousand words, almost any word qualifies and the keyword list
    # stops describing the video.
    if body:
        counts = Counter(t for t in TOKEN_RE.findall(body)
                         if t not in STOP and len(t) > 3 and not t.isdigit())
        floor = max(8, int(len(body.split()) / 220))
        for term, n in counts.most_common(10):
            if n >= floor:
                add(term)
    return kw


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    for path in (INDEX, CHANNEL):
        if not path.exists():
            print("missing %s (run from the repo root)" % path, file=sys.stderr)
            return 1

    doc = json.load(open(INDEX, encoding="utf-8"))
    current = {v["id"]: v for v in doc.get("videos", []) if v.get("id")}
    channel = json.load(open(CHANNEL, encoding="utf-8"))
    cache = json.load(open(CACHE, encoding="utf-8")) if CACHE.exists() else {}

    videos, added, gained_seg, kept, dropped = [], [], [], 0, []
    for item in channel:
        vid, title = item.get("id"), (item.get("title") or "").strip()
        if not vid:
            continue
        if vid in PRIVATE_ON_YOUTUBE:
            dropped.append(title or vid)
            continue
        old = current.get(vid, {})
        # An existing transcript on the site wins: it came from the original pipeline and has
        # already been serving searches. The cache only fills gaps.
        seg = old.get("seg") or cache.get(vid) or []
        seg = [[int(float(s[0])), str(s[1])] for s in seg if len(s) > 1]

        if not old:
            added.append(title or vid)
        elif seg and not old.get("seg"):
            gained_seg.append(title or vid)
        else:
            kept += 1

        entry = {
            "id": vid,
            "title": title or old.get("title", ""),
            "author": old.get("author") or AUTHOR,
            "dur": old.get("dur") or (mmss(seg[-1][0]) if seg else ""),
            "kw": make_keywords(title or old.get("title", ""), seg, old.get("kw")),
        }
        if seg:
            entry["seg"] = seg
        videos.append(entry)

    # Anything already in the index that the channel listing did not return is kept rather than
    # dropped. The lister covers the Videos tab only, so a Shorts or Live entry that someone
    # added by hand would otherwise disappear from search without anyone deciding that.
    listed = {v["id"] for v in videos}
    for vid, old in current.items():
        if vid in listed:
            continue
        if vid in PRIVATE_ON_YOUTUBE:
            dropped.append(old.get("title", vid))
            continue
        videos.append(old)
        print("  kept an entry not on the channel Videos tab: %s"
              % old.get("title", vid).encode("ascii", "replace").decode()[:70])

    with_seg = sum(1 for v in videos if v.get("seg"))
    doc["videos"] = videos
    doc["channel"] = doc.get("channel", "@BerkeleyNucleonicsMedia")
    doc["generated_note"] = (
        "v4: every public video on the channel is listed and searchable by title and keywords. "
        "Videos carrying `seg` also support jump-to-moment; the rest gain it as transcripts are "
        "collected. Rebuild with scripts/rebuild-video-search-index.py."
    )

    payload = json.dumps(doc, ensure_ascii=False, separators=(",", ":"))
    print("videos in index : %d  (was %d)" % (len(videos), len(current)))
    print("  newly listed  : %d" % len(added))
    for t in added[:8]:
        print("      + %s" % t.encode("ascii", "replace").decode()[:68])
    if len(added) > 8:
        print("      ... and %d more" % (len(added) - 8))
    print("  gained jump-to-moment : %d" % len(gained_seg))
    print("  unchanged             : %d" % kept)
    print("with a transcript: %d of %d  (the rest are findable, they just start at 0:00)"
          % (with_seg, len(videos)))
    if dropped:
        print("  NOT listed, private on YouTube so a visitor cannot watch them (%d):"
              % len(dropped))
        for t in dropped:
            print("      - %s" % t.encode("ascii", "replace").decode()[:68])
    print("file size: %.2f MB uncompressed (host serves brotli, roughly a third of that)"
          % (len(payload.encode("utf-8")) / 1024 / 1024))

    if args.write:
        with open(INDEX, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(payload)
        print("\nwrote %s" % INDEX)
    else:
        print("\nDry run. Re-run with --write.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
