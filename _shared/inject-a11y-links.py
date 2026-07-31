#!/usr/bin/env python3
"""Add an 'Accessibility' footer link sitewide (prefix-aware), link the
Accessibility Statement from the compliance page, and add it to sitemap.xml.
Idempotent."""
import os, re
ROOT=os.path.dirname(os.path.abspath(__file__)).rsplit("/_shared",1)[0]

FOOT_RE=re.compile(r'<a href="([^"]*)privacy\.html">Privacy</a>')
def foot(s):
    if re.search(r'accessibility\.html">Accessibility<', s): return s
    return FOOT_RE.sub(lambda m: m.group(0)+f'<a href="{m.group(1)}accessibility.html">Accessibility</a>', s, count=1)

def main():
    footc=0
    for dp,dirs,files in os.walk(ROOT):
        if "/.git" in dp: dirs[:]=[d for d in dirs if d!=".git"]; continue
        for f in files:
            if not f.endswith(".html"): continue
            p=os.path.join(dp,f); s=open(p,encoding="utf-8",errors="surrogatepass").read()
            if '<a href="' not in s or 'privacy.html">Privacy</a>' not in s: continue
            ns=foot(s)
            if ns!=s: open(p,"w",encoding="utf-8",errors="surrogatepass").write(ns); footc+=1
    print("footer Accessibility link added on", footc, "pages")

    # compliance page row -> link the statement
    cp=os.path.join(ROOT,"compliance-and-legal-notices.html")
    if os.path.exists(cp):
        s=open(cp).read()
        old='<tr><td>Accessibility Compliance</td><td>Our commitment to making digital content usable for people of all abilities.</td></tr>'
        new='<tr><td><a href="accessibility.html">Accessibility Statement</a></td><td>Our commitment to WCAG 2.1 AA digital accessibility, and how to report a barrier.</td></tr>'
        if old in s:
            open(cp,"w").write(s.replace(old,new,1)); print("compliance page: linked Accessibility Statement")
        elif 'accessibility.html">Accessibility Statement' in s:
            print("compliance page: already linked")
        else:
            print("compliance page: accessibility row not found (skipped)")

    # sitemap
    sm=os.path.join(ROOT,"sitemap.xml")
    if os.path.exists(sm):
        s=open(sm).read()
        loc="https://www.berkeleynucleonics.com/accessibility.html"
        if loc not in s and "</urlset>" in s:
            entry=f"  <url><loc>{loc}</loc><changefreq>yearly</changefreq></url>\n"
            open(sm,"w").write(s.replace("</urlset>", entry+"</urlset>",1)); print("sitemap: added accessibility.html")
        else:
            print("sitemap: present or no urlset")
    else:
        print("sitemap.xml not found")

if __name__=="__main__": main()
