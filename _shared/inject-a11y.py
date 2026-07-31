#!/usr/bin/env python3
"""Idempotent sitewide accessibility injector for BNC-DraftWebsite.
Adds, on every standard-chrome page (has <header class="sitenav">):
  1. <link rel="stylesheet" href="/_shared/bnc-a11y.css"> before </head>
  2. <a class="skip-link" href="#main"> right after <body>
  3. a #main landmark target (id on existing <main>, else a div after </header>)
Re-run safe: skips files already carrying bnc-a11y.css.
"""
import os, re, sys
ROOT=os.path.dirname(os.path.abspath(__file__)).rsplit("/_shared",1)[0]
CHROME='<header class="sitenav">'
CSS_LINK='<link rel="stylesheet" href="/_shared/bnc-a11y.css">'
SKIP='<a class="skip-link" href="#main">Skip to main content</a>'

def process(path):
    s=open(path,encoding="utf-8",errors="surrogatepass").read()
    if CHROME not in s or "</head>" not in s or "<body" not in s:
        return None
    if "bnc-a11y.css" in s:
        return "skip"
    orig=s
    # 1. css link
    s=s.replace("</head>", CSS_LINK+"\n</head>", 1)
    # 2. skip link after <body ...>
    if "skip-link" not in s:
        s=re.sub(r'(<body[^>]*>)', lambda m: m.group(1)+"\n"+SKIP, s, count=1)
    # 3. #main target
    if 'id="main"' not in s:
        if re.search(r'<main(?![^>]*\bid=)', s):
            s=re.sub(r'<main(?![^>]*\bid=)', '<main id="main"', s, count=1)
        else:
            s=s.replace("</header>", '</header>\n<div id="main" tabindex="-1"></div>', 1)
    if s!=orig:
        open(path,"w",encoding="utf-8",errors="surrogatepass").write(s)
        return "patched"
    return "nochange"

def main():
    counts={"patched":0,"skip":0,"nochange":0,"notchrome":0}
    for dirpath,dirs,files in os.walk(ROOT):
        if "/.git" in dirpath:
            dirs[:]=[d for d in dirs if d!=".git"]; continue
        for f in files:
            if not f.endswith(".html"): continue
            r=process(os.path.join(dirpath,f))
            if r is None: counts["notchrome"]+=1
            else: counts[r]+=1
    print("a11y injector:", counts)

if __name__=="__main__":
    main()
