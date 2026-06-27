#!/usr/bin/env python3
"""build-pending-actions.py — scrape every [data-webmaster] engineering/verification
note across the site into pending-actions.json, which the Employee Portal renders as a
linked checklist. Re-run after adding or clearing notes.

  python _shared/build-pending-actions.py
"""
import json, re, html, subprocess
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent      # site-bundle/

def discover():
    """Find files containing the marker, fast. Prefer ripgrep; fall back to a narrow
    glob over the page families that carry these notes (ICX / 865 / scint articles)."""
    try:
        out = subprocess.run(["rg", "-l", "-g", "*.html", "data-webmaster", str(ROOT)],
                             capture_output=True, text=True, timeout=30)
        files = [Path(p) for p in out.stdout.splitlines() if p.strip()]
        if files:
            return files
    except Exception:
        pass
    pats = ["docs/*icx*.html", "docs/*865*.html", "docs/article-scint*.html", "*.html"]
    seen, files = set(), []
    for pat in pats:
        for f in ROOT.glob(pat):
            if f not in seen:
                seen.add(f); files.append(f)
    return files

class WMExtractor(HTMLParser):
    """Collect the inner text of every element carrying the data-webmaster attribute,
    handling nested tags. Also note the nearest enclosing id for an anchor link."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.depth = 0          # >0 while inside a data-webmaster element
        self.buf = []
        self.notes = []         # list of {text, anchor}
        self.cur_anchor = None
        self.stack_ids = []     # ids seen on the path into the current note
    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        is_wm = ('data-webmaster' in d) or any(k == 'data-webmaster' for k, _ in attrs)
        if self.depth == 0 and is_wm:
            self.depth = 1
            self.buf = []
            self.cur_anchor = d.get('id') or None
            return
        if self.depth > 0:
            self.depth += 1
            if d.get('id') and not self.cur_anchor:
                self.cur_anchor = d.get('id')
    def handle_endtag(self, tag):
        if self.depth > 0:
            self.depth -= 1
            if self.depth == 0:
                text = re.sub(r'\s+', ' ', ''.join(self.buf)).strip()
                if text:
                    self.notes.append({'text': text, 'anchor': self.cur_anchor})
                self.cur_anchor = None
    def handle_data(self, data):
        if self.depth > 0:
            self.buf.append(data)

def page_title(htmltext):
    m = re.search(r'<title[^>]*>(.*?)</title>', htmltext, re.S | re.I)
    if m:
        return html.unescape(re.sub(r'\s+', ' ', m.group(1)).strip()
                             .replace(' — Berkeley Nucleonics', '')
                             .replace(' | Berkeley Nucleonics', ''))
    return None

def main():
    entries = []
    total_notes = 0
    for f in discover():
        if '_shared' in f.parts or f.name == 'employee-portal.html':
            continue
        try:
            txt = f.read_text(encoding='utf-8', errors='ignore')
        except Exception:
            continue
        if 'data-webmaster' not in txt:
            continue
        ex = WMExtractor()
        try:
            ex.feed(txt)
        except Exception:
            continue
        notes = [n for n in ex.notes if n['text']]
        if not notes:
            continue
        rel = f.relative_to(ROOT).as_posix()
        url = '/' + rel
        anchor = next((n['anchor'] for n in notes if n['anchor']), None)
        # tag each note with whether it carries an explicit (verify) flag
        for n in notes:
            n['verify'] = bool(re.search(r'\(?\bverify\b\)?', n['text'], re.I))
        total_notes += len(notes)
        entries.append({
            'file': rel,
            'url': url,
            'link': url + (('#' + anchor) if anchor else ''),
            'title': page_title(txt) or rel,
            'notes': notes,
            'verify_count': sum(1 for n in notes if n['verify']),
        })
    out = {
        'pages': len(entries),
        'total_notes': total_notes,
        'entries': sorted(entries, key=lambda e: (-e['verify_count'], e['title'])),
    }
    (ROOT / 'pending-actions.json').write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding='utf-8')
    print(f"wrote pending-actions.json: {len(entries)} pages, {total_notes} notes")

if __name__ == '__main__':
    main()
