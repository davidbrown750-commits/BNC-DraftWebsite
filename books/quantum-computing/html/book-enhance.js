/* book-enhance.js — BNC Web Books shared interactivity layer (light touch)
 * Adds three restrained enhancements to a chapter page:
 *   1. Inline glossary hot-links: the first two occurrences of each glossary term get
 *      a faint dotted underline, a hover definition (title), and a link that opens the
 *      glossary in a new window so the reader never loses their place.
 *   2. "Going Deeper" banner — one compact footer-style banner per chapter, with a
 *      soft Higgsfield depth image (../figures/going-deeper.jpg), a "Going Deeper"
 *      kicker, and a one-line "Ask a BNC engineer" link that reveals a tight inline
 *      form (email + optional "what would help") posting to the book's Formspree endpoint.
 *   3. Topic calculators: tiny inline tools (rise time/bandwidth, PRF/period,
 *      period-overlap budget) that appear only on chapters whose text is about them.
 *
 * Requires a sibling book-enhance-data.js that sets window.BOOK_ENHANCE (config)
 * and window.GLOSSARY_TERMS (array of {t:term, d:def, a:letterAnchor}).
 * Palette is the BNC light-touch set; nothing here adds new color blocks or buttons
 * beyond a single text link and the calculators' compact input boxes.
 */
(function () {
  var CFG = window.BOOK_ENHANCE || {};
  var RAW = window.GLOSSARY_TERMS || [];
  var STOP = {"to":1,"arm":1,"wait":1,"normal":1,"mode":1,"note":1,"gain":1,"band":1};
  var RKEY = (CFG.bookKey||"bnc")+"-resume";
  var PER_TERM = 2;   // hot-link up to this many occurrences of each term per chapter

  function ready(fn){ if(document.readyState!=="loading") fn(); else document.addEventListener("DOMContentLoaded", fn); }

  function injectStyles(){
    if(document.getElementById("__bnc-enh-style")) return;
    var css = [
      '.bnc-term{border-bottom:1px dotted #0078B6;text-decoration:none;color:inherit;cursor:help;}',
      '.bnc-term:hover{border-bottom-color:#C77E00;color:#003D6B;}',
      '.bnc-resume{float:right;clear:right;width:236px;max-width:46%;margin:4px 0 16px 24px;padding:11px 14px 12px;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.45;color:#3a4a57;background:#f4f9fd;border:1px solid #d6e3ee;border-left:3px solid #C77E00;border-radius:0 4px 4px 0;font-style:normal;}',
      '.bnc-resume .bnc-resume-k{display:block;font-size:8.5px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#0078B6;margin:0 0 4px;}',
      '.bnc-resume a{color:#003D6B;font-weight:700;border-bottom:1px solid #C77E00;text-decoration:none;font-style:normal;}',
      '.bnc-resume a:hover{color:#0078B6;}',
      '@media(max-width:560px){.bnc-resume{float:none;width:auto;max-width:none;margin:14px 0;}}',
      '.bnc-resource{font-family:Helvetica,Arial,sans-serif;margin:26px 0 8px;padding:0;border:1px solid #dbe3ea;border-radius:8px;background:linear-gradient(180deg,#f7fbff,#eef4fb);overflow:hidden;position:relative;}',
      '.bnc-resource::before{content:"";position:absolute;left:0;top:0;height:3px;width:100%;background:linear-gradient(90deg,#003D6B,#0078B6 45%,#00d4ff);}',
      '.bnc-gd-head{display:flex;align-items:center;gap:13px;padding:11px 15px;}',
      '.bnc-gd-img{width:58px;height:58px;border-radius:8px;object-fit:cover;flex:0 0 auto;box-shadow:0 0 0 1px #d3e1ef,0 2px 10px rgba(0,120,182,0.25);}',
      '.bnc-gd-txt{min-width:0;}',
      '.bnc-gd-kicker{display:block;font-size:8pt;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#0078B6;margin-bottom:1px;}',
      '.bnc-gd-line{margin:0;font-size:10pt;line-height:1.4;color:#2C3E50;}',
      '.bnc-resource a.ask{color:#003D6B;font-weight:700;border-bottom:1px solid #C77E00;text-decoration:none;cursor:pointer;white-space:nowrap;}',
      '.bnc-resource a.ask:hover{color:#0078B6;}',
      '.bnc-resource form{margin:0;padding:0 15px 12px;}',
      '.bnc-gd-fields{display:flex;flex-wrap:wrap;gap:8px;align-items:center;}',
      '.bnc-resource input{flex:1 1 170px;min-width:130px;padding:7px 10px;border:1px solid #c3ced6;border-radius:5px;font:inherit;font-size:10pt;background:#fff;}',
      '.bnc-resource .send{flex:0 0 auto;font-family:Helvetica,Arial,sans-serif;font-weight:700;letter-spacing:.5px;text-transform:uppercase;font-size:8.5pt;padding:8px 16px;border-radius:5px;border:1px solid #003D6B;background:#003D6B;color:#fff;cursor:pointer;}',
      '.bnc-resource .send:hover{background:#0078B6;border-color:#0078B6;}',
      '.bnc-resource .done{padding:12px 15px;margin:0;color:#1f7a42;font-weight:700;}',
      '@media (max-width:520px){.bnc-gd-img{width:46px;height:46px;}.bnc-gd-fields .send{width:100%;}}',
      '.bnc-calc{font-family:Helvetica,Arial,sans-serif;margin:22px 0;padding:16px 18px;border:1px solid #cfd9e0;border-top:3px solid #0078B6;border-radius:4px;background:#fbfdff;}',
      '.bnc-calc .ttl{font-weight:700;color:#003D6B;font-size:10.5pt;letter-spacing:.3px;margin:0 0 4px;}',
      '.bnc-calc .sub{color:#5b6b78;font-size:9.5pt;margin:0 0 12px;}',
      '.bnc-calc .row{display:flex;flex-wrap:wrap;gap:14px;align-items:flex-end;}',
      '.bnc-calc .fld{display:flex;flex-direction:column;gap:3px;}',
      '.bnc-calc .fld label{font-size:8.5pt;letter-spacing:.5px;text-transform:uppercase;color:#5b6b78;}',
      '.bnc-calc input{width:120px;padding:7px 9px;border:1px solid #c3ced6;border-radius:3px;font:inherit;font-size:11pt;}',
      '.bnc-calc .out{margin:12px 0 0;font-size:10.5pt;color:#2C3E50;}',
      '.bnc-calc .out b{color:#003D6B;}',
      '.bnc-calc .warn{color:#C0392B;font-weight:700;}',
      '.bnc-calc .ok{color:#1f7a42;font-weight:700;}',
      '.bnc-calc table{border-collapse:collapse;margin-top:6px;font-size:10pt;}',
      '.bnc-calc td,.bnc-calc th{border:1px solid #d8e0e6;padding:4px 8px;text-align:left;}',
      '/* references: demote each chapter back-matter block to a quiet, smaller note */',
      'h2#references,h3#references{font-family:Helvetica,Arial,sans-serif;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:#0078B6;border-left:none;padding:14px 0 0;margin:34px 0 6px;border-top:1px solid #d8e0e6;}',
      'h2#references ~ p,h3#references ~ p,h2#references ~ ul,h3#references ~ ul,h2#references ~ ol,h3#references ~ ol{font-size:13px;line-height:1.55;color:#5b6b78;margin:5px 0;}',
      'h2#references ~ ul li,h3#references ~ ul li,h2#references ~ ol li,h3#references ~ ol li{margin:3px 0;}'
    ].join("");
    var s=document.createElement("style"); s.id="__bnc-enh-style"; s.textContent=css; document.head.appendChild(s);
  }

  // ---------- 1. glossary hot-links ----------
  function buildTerms(){
    var list=[];
    RAW.forEach(function(e){
      if(!e || !e.t) return;
      var def=(e.d||"").replace(/\s+/g," ").trim();
      var core=e.t.replace(/\s*\(.*?\)\s*$/,"").trim();   // drop trailing "(ACRONYM)"
      pushTerm(list, core, def, e.a);
      var m=e.t.match(/\(([^)]+)\)\s*$/);                 // add acronym synonym
      if(m){ var ac=m[1].trim(); if(/^[A-Za-z0-9./-]{2,}$/.test(ac) && /[A-Z]/.test(ac)) pushTerm(list, ac, def, e.a); }
    });
    // longest first so multi-word terms win
    list.sort(function(a,b){return b.key.length-a.key.length;});
    return list;
  }
  function pushTerm(list, term, def, anchor){
    if(!term) return;
    var key=term.toLowerCase();
    if(key.length<3) return;
    if(STOP[key]) return;
    list.push({term:term, key:key, def:def, anchor:anchor||""});
  }
  function isWordChar(c){ return c && /[A-Za-z0-9]/.test(c); }

  function linkTerms(terms){
    if(!terms.length) return;
    var used={}, linked=0, MAX=160;
    var glossary=CFG.glossaryHref||"";
    var nodes=[].slice.call(document.querySelectorAll("p, li"));
    for(var n=0;n<nodes.length && linked<MAX;n++){
      var el=nodes[n];
      if(el.closest(".bnc-footer,.bnc-resource,.bnc-calc,.quiz-cta,figure,.bnc-top-banner")) continue;
      linked += scanElement(el, terms, used, glossary, MAX-linked);
    }
  }
  function scanElement(el, terms, used, glossary, budget){
    var made=0;
    var walker=document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
    var textNodes=[]; var t;
    while((t=walker.nextNode())) textNodes.push(t);
    for(var i=0;i<textNodes.length && made<budget;i++){
      var node=textNodes[i];
      if(!node.parentNode || node.parentNode.closest("a")) continue;
      var txt=node.nodeValue, low=txt.toLowerCase();
      for(var k=0;k<terms.length;k++){
        var tm=terms[k];
        if((used[tm.key]||0) >= PER_TERM) continue;
        var idx=low.indexOf(tm.key);
        while(idx!==-1){
          var before=txt.charAt(idx-1), after=txt.charAt(idx+tm.key.length);
          if(!isWordChar(before) && !isWordChar(after)) break;
          idx=low.indexOf(tm.key, idx+1);
        }
        if(idx===-1) continue;
        // wrap
        var pre=txt.slice(0,idx), match=txt.slice(idx,idx+tm.key.length), post=txt.slice(idx+tm.key.length);
        var a=document.createElement("a");
        a.className="bnc-term";
        a.href=glossary+(tm.anchor?("#"+tm.anchor):"");
        a.title=tm.def||tm.term;
        a.target="_blank";
        a.rel="noopener";
        a.textContent=match;
        var frag=document.createDocumentFragment();
        if(pre) frag.appendChild(document.createTextNode(pre));
        frag.appendChild(a);
        var tail=null;
        if(post){ tail=document.createTextNode(post); frag.appendChild(tail); }
        node.parentNode.replaceChild(frag, node);
        used[tm.key]=(used[tm.key]||0)+1; made++;
        // continue scanning the tail text for other terms
        if(tail){ node=tail; txt=post; low=post.toLowerCase(); k=-1; if(made>=budget) break; }
        else break;
      }
    }
    return made;
  }

  // ---------- 2. ask for resources ----------
  function chapterTopic(){
    var h1=document.querySelector("h1");
    var t=h1?h1.textContent:document.title;
    return t.replace(/^\s*(Chapter\s+)?\d+[.:)]?\s*/i,"").replace(/\s+/g," ").trim();
  }
  function insertResourceAsk(){
    if(document.querySelector(".bnc-resource")) return;
    var topic=chapterTopic();
    var box=document.createElement("aside");
    box.className="bnc-resource";
    var academy=CFG.academyUrl?(' &middot; <a class="ask" href="'+CFG.academyUrl+'" target="_blank" rel="noopener">BNC Academy</a>'):'';
    box.innerHTML=
       '<div class="bnc-gd-head">'
      +'<img class="bnc-gd-img" src="../figures/going-deeper.jpg" alt="" aria-hidden="true" onerror="this.style.display=\'none\'">'
      +'<div class="bnc-gd-txt">'
      +'<span class="bnc-gd-kicker">Going Deeper</span>'
      +'<p class="bnc-gd-line">Want to go deeper on <strong>'+esc(topic)+'</strong>? '
      +'<a class="ask" role="button" tabindex="0">Ask a BNC engineer &rarr;</a>'+academy+'</p>'
      +'</div></div>'
      +'<form hidden novalidate>'
      +'<div class="bnc-gd-fields">'
      +'<input type="email" name="email" required placeholder="you@lab.org" aria-label="Email">'
      +'<input type="text" name="message" placeholder="What would help? (optional)" aria-label="What would help?">'
      +'<button type="submit" class="send">Send</button>'
      +'</div></form>';
    var footer=document.querySelector(".bnc-footer");
    if(footer && footer.parentNode) footer.parentNode.insertBefore(box, footer);
    else document.body.appendChild(box);
    var link=box.querySelector("a.ask"), form=box.querySelector("form");
    function open(){ form.hidden=false; form.querySelector('input').focus(); }
    link.addEventListener("click", open);
    link.addEventListener("keydown", function(e){ if(e.key==="Enter"||e.key===" ") {e.preventDefault();open();} });
    form.addEventListener("submit", function(ev){
      ev.preventDefault();
      if(!form.checkValidity()){ form.reportValidity(); return; }
      var data=new FormData(form);
      data.append("book", CFG.bookTitle||document.title);
      data.append("topic", topic);
      data.append("page", location.pathname.split("/").pop());
      data.append("submitted_from", (CFG.bookShort||"book")+"-resource-request");
      data.append("_subject", "["+(CFG.bookShort||"BNC")+" Resource Request] "+topic);
      var ep=CFG.formEndpoint;
      if(!ep){ done(); return; }
      fetch(ep,{method:"POST",body:data,headers:{"Accept":"application/json"}})
        .then(function(r){ if(r.ok) done(); else throw 0; })
        .catch(function(){ alert("Something went wrong. Please email info@berkeleynucleonics.com."); });
      function done(){ box.innerHTML='<p class="done">Thanks. Your request about '+esc(topic)+' is on its way. A BNC engineer will follow up.</p>'; }
    });
  }

  // ---------- 3. topic calculators ----------
  function pageText(){ return (document.body.innerText||document.body.textContent||""); }
  function insertAfterPara(matchFn, node){
    var firstH2=document.querySelector("h2");
    var ps=[].slice.call(document.querySelectorAll("p"));
    for(var i=0;i<ps.length;i++){
      var p=ps[i];
      if(p.closest(".bnc-footer,.bnc-resource,.bnc-calc,.quiz-cta")) continue;
      if(p.classList.contains("lead")) continue;                 // not the intro
      if(firstH2 && (p.compareDocumentPosition(firstH2) & Node.DOCUMENT_POSITION_PRECEDING)===0) continue; // skip anything before the first section
      if(matchFn(p.textContent)){ p.parentNode.insertBefore(node, p.nextSibling); return true; }
    }
    // fallback: before footer
    var f=document.querySelector(".bnc-footer");
    if(f && f.parentNode){ f.parentNode.insertBefore(node, f); return true; }
    return false;
  }
  function calcBox(ttl, sub){
    var d=document.createElement("div"); d.className="bnc-calc";
    d.innerHTML='<p class="ttl">Try it: '+ttl+'</p><p class="sub">'+sub+'</p>';
    return d;
  }
  function num(v){ v=parseFloat(v); return isFinite(v)?v:null; }
  function fmtTime(s){
    var a=Math.abs(s);
    if(a===0) return "0";
    if(a<1e-9) return (s*1e12).toPrecision(4)+" ps";
    if(a<1e-6) return (s*1e9).toPrecision(4)+" ns";
    if(a<1e-3) return (s*1e6).toPrecision(4)+" µs";
    if(a<1)    return (s*1e3).toPrecision(4)+" ms";
    return s.toPrecision(4)+" s";
  }

  function insertCalculators(){
    var txt=pageText(), low=txt.toLowerCase();

    // (a) rise time <-> bandwidth (0.35 rule)
    if(low.indexOf("rise time")>=0 && low.indexOf("bandwidth")>=0 && !document.querySelector('[data-calc="rt-bw"]')){
      var box=calcBox("rise time and bandwidth", "The single-pole rule of thumb: rise time (10–90%) × bandwidth ≈ 0.35. Enter one, read the other.");
      box.setAttribute("data-calc","rt-bw");
      box.insertAdjacentHTML("beforeend",
        '<div class="row"><div class="fld"><label>Rise time (ns)</label><input type="number" step="any" data-f="rt"></div>'
        +'<div class="fld"><label>Bandwidth (MHz)</label><input type="number" step="any" data-f="bw"></div></div>'
        +'<p class="out"></p>');
      var rt=box.querySelector('[data-f="rt"]'), bw=box.querySelector('[data-f="bw"]'), out=box.querySelector(".out");
      function fromRt(){ var v=num(rt.value); if(v>0){ bw.value=(350/v).toPrecision(4); out.innerHTML="A <b>"+v+" ns</b> edge implies about <b>"+(350/v).toPrecision(4)+" MHz</b> of bandwidth (0.35 / t<sub>r</sub>)."; } }
      function fromBw(){ var v=num(bw.value); if(v>0){ rt.value=(350/v).toPrecision(4); out.innerHTML="A <b>"+v+" MHz</b> bandwidth implies a rise time of about <b>"+(350/v).toPrecision(4)+" ns</b> (0.35 / BW)."; } }
      rt.addEventListener("input", fromRt); bw.addEventListener("input", fromBw);
      if(insertAfterPara(function(t){ return t.indexOf("0.35")>=0; }, box) === false){}
      else if(!box.parentNode){ /* inserted */ }
    }

    // (b) PRF <-> period
    if((/\bprf\b/i.test(txt) || low.indexOf("repetition rate")>=0 || low.indexOf("repetition frequency")>=0) && !document.querySelector('[data-calc="prf"]')){
      var b2=calcBox("repetition rate and period", "Period is simply 1 / PRF. Enter the rate to read the period between pulses, or the reverse.");
      b2.setAttribute("data-calc","prf");
      b2.insertAdjacentHTML("beforeend",
        '<div class="row"><div class="fld"><label>PRF</label><input type="number" step="any" data-f="prf"></div>'
        +'<div class="fld"><label>units</label><select data-f="u" style="padding:7px 9px;border:1px solid #c3ced6;border-radius:3px;font-size:11pt;"><option value="1">Hz</option><option value="1000">kHz</option><option value="1000000">MHz</option></select></div></div>'
        +'<p class="out"></p>');
      var prf=b2.querySelector('[data-f="prf"]'), u=b2.querySelector('[data-f="u"]'), o2=b2.querySelector(".out");
      function calcPrf(){ var v=num(prf.value); var k=parseFloat(u.value); if(v>0){ var f=v*k; o2.innerHTML="A PRF of <b>"+v+" "+u.options[u.selectedIndex].text+"</b> means a period of <b>"+fmtTime(1/f)+"</b> between pulses."; } }
      prf.addEventListener("input", calcPrf); u.addEventListener("change", calcPrf);
      insertAfterPara(function(t){ return /\bPRF\b/.test(t) || t.toLowerCase().indexOf("repetition rate")>=0; }, b2);
    }

    // (c) period / overlap budget
    if(low.indexOf("overlap")>=0 && low.indexOf("period")>=0 && !document.querySelector('[data-calc="ovl"]')){
      var b3=calcBox("period budget and overlap", "Every channel's delay plus width must finish inside the period. Enter the period and a few delay/width pairs to check for an overlap.");
      b3.setAttribute("data-calc","ovl");
      b3.insertAdjacentHTML("beforeend",
        '<div class="row"><div class="fld"><label>Period (µs)</label><input type="number" step="any" data-f="per"></div></div>'
        +'<table><thead><tr><th>Ch</th><th>Delay (µs)</th><th>Width (µs)</th><th>Ends at</th></tr></thead><tbody>'
        +row(1)+row(2)+row(3)+'</tbody></table><p class="out"></p>');
      function row(i){ return '<tr><td>'+i+'</td><td><input type="number" step="any" data-d="'+i+'" style="width:90px"></td><td><input type="number" step="any" data-w="'+i+'" style="width:90px"></td><td data-e="'+i+'">—</td></tr>'; }
      var o3=b3.querySelector(".out");
      function calcOvl(){
        var per=num(b3.querySelector('[data-f="per"]').value);
        var maxEnd=0, any=false, bad=false;
        for(var i=1;i<=3;i++){
          var d=num(b3.querySelector('[data-d="'+i+'"]').value), w=num(b3.querySelector('[data-w="'+i+'"]').value);
          var cell=b3.querySelector('[data-e="'+i+'"]');
          if(d!=null && w!=null){ any=true; var end=d+w; cell.textContent=end.toPrecision(4)+" µs"; maxEnd=Math.max(maxEnd,end); if(per>0 && end>per){ cell.innerHTML='<span class="warn">'+end.toPrecision(4)+' µs</span>'; bad=true; } }
          else cell.textContent="—";
        }
        if(!any || !(per>0)){ o3.textContent=""; return; }
        if(bad) o3.innerHTML='<span class="warn">Overlap.</span> At least one channel ends after the '+per+' µs period. Raise the period (lower the rep rate) or shorten a delay or width.';
        else o3.innerHTML='<span class="ok">Fits.</span> The latest pulse ends at <b>'+maxEnd.toPrecision(4)+' µs</b>, inside the '+per+' µs period.';
      }
      b3.addEventListener("input", calcOvl);
      insertAfterPara(function(t){ var l=t.toLowerCase(); return l.indexOf("overlap")>=0 && (l.indexOf("period")>=0||l.indexOf("budget")>=0); }, b3);
    }
  }

  function esc(s){ return String(s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];}); }

  // ---------- 6. resume reading ----------
  function recordPosition(){
    try{
      var h1=document.querySelector("h1");
      var title=h1?h1.textContent.replace(/\s+/g," ").trim():document.title;
      localStorage.setItem(RKEY, JSON.stringify({href:location.pathname.split("/").pop(), title:title, ts:Date.now()}));
    }catch(e){}
  }
  function renderResume(){
    var raw; try{ raw=localStorage.getItem(RKEY); }catch(e){ return; }
    if(!raw) return;
    var o; try{ o=JSON.parse(raw); }catch(e){ return; }
    if(!o || !o.href) return;
    var cur=(location.pathname.split("/").pop()||"");
    if(o.href===cur) return;
    var p=document.createElement("p");
    p.className="bnc-resume";
    p.innerHTML='<span class="bnc-resume-k">Pick up where you left off</span><a href="'+esc(o.href)+'">'+esc(o.title||"Continue reading")+' &rarr;</a>';
    // place it top-right, right after the title so it floats beside the byline (never across an <hr>)
    var title=document.querySelector(".fm-title")||document.querySelector(".fm-titleblock h1");
    var h1s=document.querySelectorAll("h1");
    if(title && title.parentNode){ title.parentNode.insertBefore(p, title.nextSibling); }
    else if(h1s.length){ var last=h1s[h1s.length-1]; last.parentNode.insertBefore(p, last.nextSibling); }
    else { var hr=document.querySelector("hr"); if(hr && hr.parentNode){ hr.parentNode.insertBefore(p, hr); } else { document.body.insertBefore(p, document.body.firstChild); } }
  }

  ready(function(){
    try{
      injectStyles();
      var fn=(location.pathname.split("/").pop()||"").toLowerCase();
      var isFront = /front-matter/.test(fn) || /(^|\/)index\.html$/.test(fn) || !!document.querySelector("nav.toc");
      var isAux = /quiz|glossar|appendix|about|reader|contributor|answer-key/.test(fn);
      if(isFront){
        renderResume();
      } else if(!isAux){
        linkTerms(buildTerms());
        insertCalculators();
        insertResourceAsk();
        recordPosition();
      }
    }catch(e){ /* never break the page */ if(window.console) console.warn("book-enhance:", e); }
  });
})();
