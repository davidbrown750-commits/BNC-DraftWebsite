/* Berkeley Nucleonics — PDF Configurator (first pass)
 * Self-contained. Drop into any long document with:
 *   <script src="../_shared/pdf-configurator.js"
 *           data-doc="SAM 940+ User Manual"
 *           data-file="BNC-SAM-940-Plus-Manual"
 *           data-desc='{"1":"Overview and evolution", ...}'></script>
 * Auto-detects chapters from the page's H2 headings, lets the reader pick the
 * chapters they want (with a short description per section), gates the download
 * behind an email (Formspree), then builds a print-ready custom PDF of only those
 * chapters with a slim BNC header and a logo footer. Figures included.
 */
(function () {
  "use strict";
  var FORMSPREE = "https://formspree.io/f/xeewaglw";
  var BRAND_BLUE = "#0655a3", BRAND_DARK = "#113163";
  var COMPANY = "Berkeley Nucleonics";
  var LOGO = '<svg viewBox="0 0 972.3 485.93" xmlns="http://www.w3.org/2000/svg"><g fill="' + BRAND_DARK + '"><path d="M326.86,400.29c-88.04,0-159.67-71.63-159.67-159.67s71.63-159.67,159.67-159.67,159.67,71.63,159.67,159.67-71.63,159.67-159.67,159.67ZM326.86,99.21c-77.97,0-141.4,63.43-141.4,141.41s63.43,141.4,141.4,141.4,141.4-63.43,141.4-141.4-63.43-141.41-141.4-141.41Z"/><polygon points="882.15 284.93 383 284.93 383 204.02 268.17 204.02 268.17 284.93 90.53 284.93 90.53 274.49 257.73 274.49 257.73 193.58 393.44 193.58 393.44 274.49 882.15 274.49 882.15 284.93"/></g><g fill="' + BRAND_BLUE + '" fill-rule="evenodd"><path d="M540.98,231.52l6.4-30.06h18.94c11.43,0,18.83,2.03,16.06,15.03-2.77,13-11.02,15.03-22.46,15.03h-18.95ZM551.37,182.66l5.66-26.62h18.94c10.18,0,14.92,4.23,12.99,13.31-1.93,9.08-8.47,13.31-18.64,13.31h-18.95ZM555.47,250.31c17.11,1.25,47.03-6.89,51.79-29.29,3.53-16.6-5.02-26.46-18.64-29.44l.07-.31c12.07-3.76,22.52-12.37,25.15-24.74,4.69-22.08-14.18-30.53-34.64-29.28h-42.43l-24.03,113.06h42.75Z"/><polygon points="720.52 250.31 744.56 137.25 721.85 137.25 703.01 225.88 702.63 226.19 678.48 137.25 642.46 137.25 618.43 250.31 641.13 250.31 661.04 156.67 661.42 156.35 686.07 250.31 720.52 250.31"/><path d="M847.93,173.89c4.93-28.34-13.17-38.99-39.16-38.99-32.73,0-52.94,25.84-59.96,58.87-7.02,33.04,2.2,58.88,34.93,58.88,25.99,0,48.61-10.65,55.74-38.99h-25.84c-2.37,11.9-11.61,21.45-26.17,21.45-17.23,0-16.18-25.52-12.82-41.34,3.36-15.81,13.18-41.34,30.4-41.34,14.56,0,19.73,9.55,17.05,21.45h25.84Z"/></g></svg>';

  var script = document.currentScript;
  var DOC_TITLE = (script && script.getAttribute("data-doc")) ||
    (document.querySelector("h1") ? document.querySelector("h1").textContent.trim() : document.title);
  var DESC_MAP = {};
  try { if (script && script.getAttribute("data-desc")) DESC_MAP = JSON.parse(script.getAttribute("data-desc")); } catch (e) {}

  function ready(fn){ if (document.readyState !== "loading") fn(); else document.addEventListener("DOMContentLoaded", fn); }
  function el(tag, attrs, html){ var e=document.createElement(tag); if(attrs) for(var k in attrs) e.setAttribute(k, attrs[k]); if(html!=null) e.innerHTML=html; return e; }
  function esc(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
  // If signed in via the Clerk/Supabase auth layer, use the account email.
  function userEmail(){ try { var u = window.Clerk && window.Clerk.user; return (u && u.primaryEmailAddress && u.primaryEmailAddress.emailAddress) || null; } catch(e){ return null; } }

  function deriveDesc(nodes){
    var i, t;
    for (i = 0; i < nodes.length; i++) if (nodes[i].tagName === "H3") {
      t = nodes[i].textContent.replace(/^\s*[\d.]+\s*/, "").replace(/\s+/g, " ").trim();
      if (t) return t.split(" ").slice(0, 4).join(" ");
    }
    for (i = 0; i < nodes.length; i++) if (nodes[i].tagName === "P") {
      t = nodes[i].textContent.replace(/\s+/g, " ").trim();
      if (t) return t.split(" ").slice(0, 4).join(" ");
    }
    return "";
  }

  function getChapters(){
    var skip = "nav,header,footer,.toc,.sitenav,.gfoot,.doc-hero";
    var h2s = Array.prototype.slice.call(document.querySelectorAll("h2")).filter(function(h){ return !h.closest(skip); });
    var set = new Set(h2s);
    return h2s.map(function(h, i){
      var nodes = [h], n = h.nextElementSibling;
      while (n && !set.has(n)) { nodes.push(n); n = n.nextElementSibling; }
      var raw = h.textContent.replace(/\s+/g, " ").trim();
      var nm = raw.match(/^(\d{1,3})\b[.\s]*(.*)$/);
      var title = nm ? (nm[1] + ". " + nm[2]) : raw;
      var num = (title.match(/^\s*(\d+)\./) || [])[1];
      var desc = DESC_MAP[num] || DESC_MAP[title] || deriveDesc(nodes);
      return { i: i, title: title, desc: desc, nodes: nodes };
    });
  }

  function injectCSS(){
    var css = "" +
    ".pdfcfg-trigger{display:inline-flex;align-items:center;gap:.45em;font-family:'Myriad Pro','Segoe UI',Arial,sans-serif;font-weight:700;font-size:.84rem;letter-spacing:.02em;color:#fff;background:linear-gradient(115deg,#2e1065,#6d28d9 58%,#7c3aed);border:none;border-radius:6px;padding:.55em 1.1em;cursor:pointer;text-decoration:none;box-shadow:0 5px 16px -7px rgba(46,16,101,.85);}" +
    ".pdfcfg-trigger:hover{filter:brightness(1.09);}" +
    ".pdfcfg-trigger svg{width:16px;height:16px;fill:none;stroke:#fff;stroke-width:2;flex:0 0 auto;}" +
    ".pdfcfg-trigger .lbl{text-align:left;line-height:1.15;}" +
    ".pdfcfg-overlay{position:fixed;inset:0;background:rgba(17,49,99,.55);backdrop-filter:blur(3px);z-index:9998;display:none;align-items:center;justify-content:center;padding:20px;}" +
    ".pdfcfg-overlay.open{display:flex;}" +
    ".pdfcfg-panel{background:#fff;color:#16233a;width:100%;max-width:560px;max-height:88vh;overflow:auto;border-radius:8px;box-shadow:0 30px 70px -20px rgba(0,0,0,.5);font-family:Arial,Helvetica,sans-serif;}" +
    ".pdfcfg-head{position:sticky;top:0;background:"+BRAND_DARK+";color:#fff;padding:15px 20px;display:flex;align-items:center;gap:12px;}" +
    ".pdfcfg-head .co{font-family:'Myriad Pro','Segoe UI',Arial,sans-serif;font-weight:700;font-size:1.02rem;}" +
    ".pdfcfg-head .ttl{margin-left:auto;font-size:.74rem;letter-spacing:.12em;text-transform:uppercase;color:#9cc0e8;font-weight:700;}" +
    ".pdfcfg-head .x{background:none;border:none;color:#bcd0ea;font-size:1.4rem;cursor:pointer;line-height:1;padding:0 2px;}" +
    ".pdfcfg-body{padding:18px 22px;}" +
    ".pdfcfg-body p.lead{margin:0 0 12px;color:#566;font-size:.92rem;}" +
    ".pdfcfg-tools{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px;}" +
    ".pdfcfg-tools button{font-size:.78rem;font-weight:600;color:"+BRAND_BLUE+";background:#eef4fb;border:1px solid #d6e3f2;border-radius:4px;padding:5px 10px;cursor:pointer;}" +
    ".pdfcfg-tools button:hover{background:#e0ecfa;}" +
    ".pdfcfg-list{border:1px solid #e3e9f1;border-radius:6px;overflow:hidden;margin-bottom:14px;}" +
    ".pdfcfg-row{display:flex;align-items:flex-start;gap:11px;padding:10px 12px;border-bottom:1px solid #eef2f7;cursor:pointer;}" +
    ".pdfcfg-row:last-child{border-bottom:none;}" +
    ".pdfcfg-row:hover{background:#f6f9fd;}" +
    ".pdfcfg-row input{width:16px;height:16px;margin-top:2px;accent-color:"+BRAND_BLUE+";flex:0 0 auto;}" +
    ".pdfcfg-row .ct{display:flex;flex-direction:column;line-height:1.3;}" +
    ".pdfcfg-row .cl{font-size:.93rem;color:#16233a;}" +
    ".pdfcfg-row .cd{font-size:.76rem;color:#8593a6;margin-top:1px;}" +
    ".pdfcfg-est{font-size:.82rem;color:#667;margin-bottom:14px;}" +
    ".pdfcfg-est b{color:"+BRAND_DARK+";}" +
    ".pdfcfg-email{width:100%;padding:10px 12px;border:1px solid #cfd8e6;border-radius:5px;font-size:.95rem;margin-bottom:6px;}" +
    ".pdfcfg-note{font-size:.76rem;color:#889;margin:0 0 14px;}" +
    ".pdfcfg-go{width:100%;background:"+BRAND_BLUE+";color:#fff;border:none;border-radius:5px;padding:12px;font-size:.98rem;font-weight:700;cursor:pointer;font-family:'Myriad Pro','Segoe UI',Arial,sans-serif;}" +
    ".pdfcfg-go:hover{background:"+BRAND_DARK+";}" +
    ".pdfcfg-go:disabled{opacity:.55;cursor:default;}" +
    ".pdfcfg-msg{font-size:.85rem;margin-top:10px;min-height:1em;}";
    var st = document.createElement("style"); st.id = "pdfcfg-css"; st.textContent = css;
    document.head.appendChild(st);
  }

  ready(function(){
    var chapters = getChapters();
    if (!chapters.length) return;
    injectCSS();

    var trigger = el("button", {"class":"pdfcfg-trigger","type":"button"},
      '<svg viewBox="0 0 24 24"><path d="M14 3v5h5"/><path d="M6 3h8l5 5v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M9 13h6M9 16h4"/></svg> <span class="lbl">PDF Download<br>Configurator</span>');
    // Place the button consistently: just below the hero's blue divider, at the
    // top of the body, right-justified to the content column. Anchor to the hero
    // SECTION on both layouts (older .doc-hero, newer .man-hero) so it always
    // lands after the divider rather than inside the header.
    var anchor = document.querySelector(".doc-hero") || document.querySelector(".man-hero") || document.querySelector("h1");
    // Sticky, pinned just under the 62px nav, right-aligned to the content column
    // (max-width matches .sitenav-inner so it lines up under "Get a Quote/Demo").
    // pointer-events:none on the bar so it never blocks the content scrolling
    // beneath it; only the button itself is clickable.
    var holder = el("div", {"class":"pdfcfg-holder","style":
      "position:sticky;top:70px;z-index:150;max-width:1240px;margin:10px auto 0;padding:0 28px;text-align:right;pointer-events:none;"});
    trigger.style.pointerEvents = "auto";
    trigger.style.boxSizing = "border-box";
    trigger.style.boxShadow = "0 5px 16px -7px rgba(46,16,101,.85)";
    holder.appendChild(trigger);
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(holder, anchor.nextSibling);
    else document.body.insertBefore(holder, document.body.firstChild);
    // Match the nav "Get a Quote/Demo" button width AND align our right edge to
    // its right edge, so it stacks directly under it (not under the search box).
    function alignToCta(){
      try {
        var navcta = document.querySelector(".sitenav-cta");
        if (navcta && navcta.offsetWidth) {
          trigger.style.minWidth = navcta.offsetWidth + "px";
          trigger.style.marginRight = "0px";
          var off = trigger.getBoundingClientRect().right - navcta.getBoundingClientRect().right;
          trigger.style.marginRight = Math.max(0, off) + "px";
        }
      } catch (e) {}
    }
    alignToCta();
    setTimeout(alignToCta, 700);   // re-align after the auth nav (Sign up / Welcome) settles
    window.addEventListener("resize", alignToCta);

    var overlay = el("div", {"class":"pdfcfg-overlay"});
    var rows = chapters.map(function(c){
      return '<label class="pdfcfg-row"><input type="checkbox" checked data-ch="'+c.i+'">' +
        '<span class="ct"><span class="cl">'+esc(c.title)+'</span>' +
        (c.desc ? '<span class="cd">'+esc(c.desc)+'</span>' : '') + '</span></label>';
    }).join("");
    overlay.innerHTML =
      '<div class="pdfcfg-panel" role="dialog" aria-label="PDF Configurator">' +
        '<div class="pdfcfg-head"><span class="co">'+COMPANY+'</span><span class="ttl">PDF Configurator</span>' +
          '<button class="x" type="button" aria-label="Close">&times;</button></div>' +
        '<div class="pdfcfg-body">' +
          '<p class="lead">Pick the chapters you want from <b>'+esc(DOC_TITLE)+'</b>. We will build a PDF of just those, with the figures included.</p>' +
          '<div class="pdfcfg-tools"><button data-all="1" type="button">Select all</button><button data-all="0" type="button">Clear all</button></div>' +
          '<div class="pdfcfg-list">'+rows+'</div>' +
          '<div class="pdfcfg-est">Selected: <b class="pdfcfg-n">'+chapters.length+'</b> of '+chapters.length+' chapters &middot; approx <b class="pdfcfg-p">--</b> pages</div>' +
          '<input class="pdfcfg-email" type="email" placeholder="Your email (required to download)" autocomplete="email">' +
          '<p class="pdfcfg-note">Your custom PDF opens as soon as you submit. We use your email only to follow up on your request.</p>' +
          '<button class="pdfcfg-go" type="button">Build &amp; download my PDF</button>' +
          '<div class="pdfcfg-msg" role="status"></div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    var boxes = overlay.querySelectorAll('input[data-ch]');
    var nEl = overlay.querySelector(".pdfcfg-n"), pEl = overlay.querySelector(".pdfcfg-p");
    var emailEl = overlay.querySelector(".pdfcfg-email"), msg = overlay.querySelector(".pdfcfg-msg");
    var noteEl = overlay.querySelector(".pdfcfg-note");
    function applyAuth(){
      var ue = userEmail();
      if (ue) {
        emailEl.value = ue; emailEl.style.display = "none";
        noteEl.innerHTML = 'Signed in as <b>' + esc(ue) + '</b>. Your custom PDF opens as soon as you click below.';
      } else {
        emailEl.style.display = "";
        noteEl.innerHTML = 'Your custom PDF opens as soon as you submit. We use your email only to follow up on your request.';
      }
    }

    function selected(){ return chapters.filter(function(c){ return overlay.querySelector('input[data-ch="'+c.i+'"]').checked; }); }
    function estimate(){
      var sel = selected(); nEl.textContent = sel.length;
      var nodes = sel.reduce(function(a,c){ return a + c.nodes.length; }, 0);
      pEl.textContent = Math.max(1, Math.round(nodes / 6));
    }
    function open(){ overlay.classList.add("open"); applyAuth(); estimate(); }
    function close(){ overlay.classList.remove("open"); }

    trigger.addEventListener("click", open);
    overlay.querySelector(".x").addEventListener("click", close);
    overlay.addEventListener("click", function(e){ if (e.target === overlay) close(); });
    Array.prototype.forEach.call(boxes, function(b){ b.addEventListener("change", estimate); });
    overlay.querySelectorAll(".pdfcfg-tools button").forEach(function(btn){
      btn.addEventListener("click", function(){ var v = btn.getAttribute("data-all") === "1"; Array.prototype.forEach.call(boxes, function(b){ b.checked = v; }); estimate(); });
    });

    overlay.querySelector(".pdfcfg-go").addEventListener("click", function(){
      var go = this, sel = selected();
      var email = userEmail() || (emailEl.value || "").trim();
      if (!userEmail() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { msg.style.color = "#c0392b"; msg.textContent = "Please enter a valid email address."; emailEl.focus(); return; }
      if (!sel.length) { msg.style.color = "#c0392b"; msg.textContent = "Pick at least one chapter."; return; }
      go.disabled = true; msg.style.color = "#0a7"; msg.textContent = "Preparing your PDF…";

      try {
        fetch(FORMSPREE, { method:"POST", headers:{ "Accept":"application/json","Content-Type":"application/json" },
          body: JSON.stringify({ email: email, _subject: "PDF Configurator: " + DOC_TITLE,
            document: DOC_TITLE, chapters: sel.map(function(c){ return c.title; }).join("; ") }) });
      } catch (e) {}

      // Open the print window inside the click handler (needed for pop-up allowance).
      var w = window.open("", "_blank");
      if (!w) { msg.style.color = "#c0392b"; msg.textContent = "Please allow pop-ups so we can open your PDF."; go.disabled = false; return; }
      // Paint a visible loading state at once so the new tab is never a blank white screen
      // (the previous build handed the page to an external paginator that could leave it blank).
      try {
        w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Preparing your PDF…</title>' +
          '<style>@keyframes pdfspin{to{transform:rotate(360deg)}}</style></head>' +
          '<body style="font-family:Arial,Helvetica,sans-serif;margin:0;display:flex;height:100vh;align-items:center;justify-content:center;background:#f4f7fb;color:#113163">' +
          '<div style="text-align:center"><div style="width:34px;height:34px;border:4px solid #cfe0f2;border-top-color:#0655a3;border-radius:50%;margin:0 auto 14px;animation:pdfspin 1s linear infinite"></div>Building your custom PDF…</div>' +
          '</body></html>');
      } catch (e) {}

      // Inherit the page's own styles so tables, figures and callouts render correctly,
      // but skip this widget's own UI styles.
      var heads = "";
      Array.prototype.forEach.call(document.querySelectorAll('style, link[rel="stylesheet"]'), function(n){
        if (n.id === "pdfcfg-css") return;
        heads += n.outerHTML;
      });
      var content = "";
      sel.forEach(function(c){ c.nodes.forEach(function(n){ content += n.outerHTML; }); });

      // Native print pipeline: the browser's own "Save as PDF" handles pagination, so there is
      // no external script that can blank the page. A fixed-position footer repeats on every
      // printed page; per-chapter page breaks come from break-before. The content is visible
      // the instant it renders, and a Save-as-PDF button stays available if auto-print is blocked.
      var pcss = "@page{size:letter;margin:16mm 14mm 22mm 14mm;}" +
        "html,body{margin:0;background:#fff;font-family:Arial,Helvetica,sans-serif;color:#16233a;-webkit-print-color-adjust:exact;print-color-adjust:exact;}" +
        "img{max-width:100%!important;height:auto!important;}" +
        "table{max-width:100%!important;}" +
        ".pdfcfg-cover{border-bottom:2px solid " + BRAND_BLUE + ";padding-bottom:4mm;margin:0 0 8mm;display:flex;justify-content:space-between;align-items:flex-end;}" +
        ".pdfcfg-cover .b{font-family:'Myriad Pro','Segoe UI',Arial,sans-serif;font-weight:700;color:" + BRAND_DARK + ";font-size:15pt;letter-spacing:.03em;}" +
        ".pdfcfg-cover .t{font-size:9pt;color:#667;text-align:right;line-height:1.45;}" +
        "h2{break-before:page;page-break-before:always;} h2:first-of-type{break-before:avoid;page-break-before:avoid;}" +
        "h2,h3,h4{break-after:avoid;page-break-after:avoid;}" +
        "figure,img,table,tr,.note{break-inside:avoid;page-break-inside:avoid;}" +
        ".pdfcfg-bar{position:sticky;top:0;z-index:10;display:flex;align-items:center;gap:12px;flex-wrap:wrap;background:" + BRAND_DARK + ";color:#fff;padding:11px 16px;}" +
        ".pdfcfg-bar button{font-family:'Myriad Pro','Segoe UI',Arial,sans-serif;font-weight:700;font-size:.9rem;background:" + BRAND_BLUE + ";color:#fff;border:none;border-radius:5px;padding:8px 16px;cursor:pointer;}" +
        ".pdfcfg-bar button:hover{background:#fff;color:" + BRAND_DARK + ";}" +
        ".pdfcfg-bar span{font-size:.8rem;color:#cfe0f5;}" +
        ".pdfcfg-main{padding:14mm 14mm 0;max-width:210mm;margin:0 auto;}" +
        ".pdffoot{display:none;}" +
        ".sitenav,.gfoot,nav,header,footer,.toc,.doc-hero,.pdfcfg-holder,.pdfcfg-overlay,.pdfcfg-trigger{display:none!important;}" +
        "@media print{" +
          ".pdfcfg-bar{display:none!important;}" +
          ".pdfcfg-main{padding:0;max-width:none;}" +
          ".pdffoot{display:flex;position:fixed;left:14mm;right:14mm;bottom:8mm;align-items:center;gap:6px;}" +
          ".pdffoot svg{height:5mm;width:auto;display:block;}" +
          ".pdffoot .s{font-size:7.5pt;color:#8593a6;font-family:Arial,Helvetica,sans-serif;}" +
        "}";

      var fname = (DOC_TITLE + " - custom excerpt").replace(/[\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
      var foot = '<div class="pdffoot">' + LOGO + '<span class="s">Berkeley Nucleonics Corp &middot; 2955 Kerner Blvd, San Rafael, CA 94901 &middot; berkeleynucleonics.com</span></div>';
      var bar = '<div class="pdfcfg-bar"><button type="button" onclick="window.focus();window.print();">Save as PDF / Print</button>' +
        '<span>Choose &ldquo;Save as PDF&rdquo; as the destination in the print dialog.</span></div>';
      var cover = '<div class="pdfcfg-cover"><span class="b">BERKELEY NUCLEONICS</span>' +
        '<span class="t">' + esc(DOC_TITLE) + '<br>Custom excerpt</span></div>';
      var doc = '<!DOCTYPE html><html><head><meta charset="utf-8"><base href="' + location.href + '">' +
        '<title>' + esc(fname) + '</title>' + heads + '<style>' + pcss + '</style></head>' +
        '<body>' + bar + foot + '<div class="pdfcfg-main content">' + cover + content + '</div>' +
        '<script>window.addEventListener("load",function(){setTimeout(function(){try{window.focus();window.print();}catch(e){}},450);});<\/script>' +
        '</body></html>';
      w.document.open(); w.document.write(doc); w.document.close();
      msg.style.color = "#0a7"; msg.textContent = "Your custom PDF opened in a new tab. Use “Save as PDF” in the print dialog.";
      setTimeout(function(){ go.disabled = false; }, 1500);
    });
  });
})();
