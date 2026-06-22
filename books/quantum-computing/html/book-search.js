/* book-search.js — BNC Web Books shared in-book search (light touch)
 * Adds one orange "SEARCH" button (top-right, same color/shape as the
 * reader-path / free-print CTA). Clicking opens a compact panel pinned to
 * the right edge, about half the page wide, that searches the ENTIRE book
 * and lists matching pages as links with a short snippet. No new page load.
 *
 * Requires a sibling book-search-data.js that sets:
 *   window.BOOK_SEARCH_INDEX = [
 *     { file:"03-key-specifications.html", title:"Key Specifications",
 *       headings:[{id:"sample-rate", t:"Sample Rate"}, ...],
 *       text:"plain lowercased body text ..." }, ...
 *   ];
 * Self-contained: injects its own styles. Works offline (file://) — no fetch.
 */
(function () {
  var IDX = window.BOOK_SEARCH_INDEX || [];

  function ready(fn){ if(document.readyState!=="loading") fn(); else document.addEventListener("DOMContentLoaded", fn); }

  function injectStyles(){
    if(document.getElementById("__bnc-search-style")) return;
    var css = [
      '.bnc-search-btn{position:fixed;top:14px;right:16px;z-index:9998;',
        'font-family:Helvetica,Arial,sans-serif;font-weight:700;letter-spacing:1px;text-transform:uppercase;',
        'font-size:10pt;padding:8px 16px;border-radius:3px;border:none;cursor:pointer;',
        'background:#C77E00;color:#fff;box-shadow:0 1px 4px rgba(0,31,56,.25);',
        'display:inline-flex;align-items:center;gap:7px;}',
      '.bnc-search-btn:hover{background:#a96a00}',
      '.bnc-search-btn svg{width:14px;height:14px;fill:none;stroke:#fff;stroke-width:2.2;stroke-linecap:round}',
      '.bnc-search-overlay{position:fixed;inset:0;z-index:9999;display:none;}',
      '.bnc-search-overlay.open{display:block}',
      '.bnc-search-overlay .scrim{position:absolute;inset:0;background:rgba(0,31,56,.18)}',
      '.bnc-search-panel{position:absolute;top:12px;right:16px;width:50%;max-width:520px;min-width:300px;',
        'max-height:calc(100vh - 28px);display:flex;flex-direction:column;',
        'background:#fff;border:1px solid #cdd9e2;border-top:4px solid #C77E00;border-radius:6px;',
        'box-shadow:0 12px 40px rgba(0,31,56,.28);overflow:hidden;}',
      '@media(max-width:600px){.bnc-search-panel{width:auto;left:12px;right:12px;max-width:none}}',
      '.bnc-search-head{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid #e4eaef;}',
      '.bnc-search-head input{flex:1 1 auto;font:inherit;font-family:Georgia,serif;font-size:16px;',
        'padding:9px 12px;border:1px solid #c3ced6;border-radius:5px;outline:none;}',
      '.bnc-search-head input:focus{border-color:#0078B6;box-shadow:0 0 0 2px rgba(0,120,182,.15)}',
      '.bnc-search-head .x{flex:0 0 auto;background:none;border:none;cursor:pointer;font-size:22px;',
        'line-height:1;color:#5b6b78;padding:4px 6px;border-radius:4px;}',
      '.bnc-search-head .x:hover{background:#eef3f7;color:#003D6B}',
      '.bnc-search-meta{font-family:Helvetica,Arial,sans-serif;font-size:11px;color:#5b6b78;',
        'padding:7px 16px;border-bottom:1px solid #eef3f7;background:#fafcfe;}',
      '.bnc-search-results{overflow-y:auto;padding:4px 0 8px;}',
      '.bnc-sr{display:block;text-decoration:none;color:inherit;padding:11px 16px;border-bottom:1px solid #f0f4f7;}',
      '.bnc-sr:hover{background:#f4f9fd}',
      '.bnc-sr .t{font-family:Helvetica,Arial,sans-serif;font-weight:700;font-size:14px;color:#003D6B;margin:0 0 1px}',
      '.bnc-sr .sec{font-family:Helvetica,Arial,sans-serif;font-size:11px;color:#0078B6;margin:0 0 3px}',
      '.bnc-sr .snip{font-family:Georgia,serif;font-size:12.5px;line-height:1.45;color:#5b6b78;margin:0}',
      '.bnc-sr .snip mark{background:#fde8c2;color:#5a3a00;padding:0 1px;border-radius:2px}',
      '.bnc-search-empty{font-family:Georgia,serif;font-size:14px;color:#5b6b78;padding:22px 16px;text-align:center}',
      '@media print{.bnc-search-btn,.bnc-search-overlay{display:none !important}}'
    ].join("");
    var s=document.createElement("style"); s.id="__bnc-search-style"; s.textContent=css; document.head.appendChild(s);
  }

  function esc(s){ return String(s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];}); }
  function rxEsc(s){ return s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"); }
  // path back to the html/ folder from the current page (handles web/ pages, root, etc.)
  function base(){
    var p=location.pathname, i=p.lastIndexOf("/html/");
    if(i>=0) return p.slice(0,i+6);            // ".../html/"
    return p.replace(/[^\/]*$/,"");            // already in html/
  }

  function tokens(q){
    return (q.toLowerCase().match(/[a-z0-9][a-z0-9.\-]*/g)||[]).filter(function(t){return t.length>=2;});
  }

  function search(q){
    var toks=tokens(q);
    if(!toks.length) return [];
    var out=[];
    for(var i=0;i<IDX.length;i++){
      var e=IDX[i], hay=(e.text||""), ttl=(e.title||"").toLowerCase();
      var score=0, allHit=true;
      for(var k=0;k<toks.length;k++){
        var t=toks[k], n=0, from=0, idx;
        while((idx=hay.indexOf(t,from))!==-1){ n++; from=idx+t.length; if(n>50)break; }
        var inTitle=ttl.indexOf(t)>=0;
        if(n===0 && !inTitle){ allHit=false; }
        score += n + (inTitle?12:0);
      }
      if(!allHit || score===0) continue;
      // best matching heading -> deep link
      var anchor="", secHead="";
      if(e.headings){
        for(var h=0;h<e.headings.length;h++){
          var ht=(e.headings[h].t||"").toLowerCase(), hitAll=true;
          for(var z=0;z<toks.length;z++){ if(ht.indexOf(toks[z])<0){hitAll=false;break;} }
          if(hitAll){ anchor=e.headings[h].id||""; secHead=e.headings[h].t||""; score+=8; break; }
        }
      }
      out.push({e:e, score:score, anchor:anchor, sec:secHead, snip:snippet(e.text, toks)});
    }
    out.sort(function(a,b){return b.score-a.score;});
    return out.slice(0,18);
  }

  function snippet(text, toks){
    if(!text) return "";
    var low=text, pos=-1;
    for(var i=0;i<toks.length;i++){ var p=low.indexOf(toks[i]); if(p>=0 && (pos<0||p<pos)) pos=p; }
    if(pos<0) pos=0;
    var start=Math.max(0,pos-50), end=Math.min(text.length,pos+130);
    var frag=(start>0?"…":"")+text.slice(start,end)+(end<text.length?"…":"");
    frag=esc(frag);
    toks.forEach(function(t){
      frag=frag.replace(new RegExp("("+rxEsc(t)+")","ig"),"<mark>$1</mark>");
    });
    return frag;
  }

  function build(){
    injectStyles();
    var btn=document.createElement("button");
    btn.type="button"; btn.className="bnc-search-btn"; btn.setAttribute("aria-label","Search this book");
    btn.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></svg>Search';

    var ov=document.createElement("div"); ov.className="bnc-search-overlay";
    ov.innerHTML=
      '<div class="scrim"></div>'+
      '<div class="bnc-search-panel" role="dialog" aria-label="Search this book">'+
        '<div class="bnc-search-head">'+
          '<input type="search" placeholder="Search this book…" aria-label="Search this book" autocomplete="off">'+
          '<button class="x" type="button" aria-label="Close search">&times;</button>'+
        '</div>'+
        '<div class="bnc-search-meta"></div>'+
        '<div class="bnc-search-results"></div>'+
      '</div>';

    document.body.appendChild(btn);
    document.body.appendChild(ov);

    var input=ov.querySelector("input"),
        meta=ov.querySelector(".bnc-search-meta"),
        list=ov.querySelector(".bnc-search-results"),
        scrim=ov.querySelector(".scrim"),
        xbtn=ov.querySelector(".x"),
        B=base();

    function open(){ ov.classList.add("open"); input.focus(); input.select(); if(input.value) run(); }
    function close(){ ov.classList.remove("open"); }
    function run(){
      var q=input.value.trim();
      if(q.length<2){ meta.textContent=IDX.length?("Type at least two characters to search "+IDX.length+" pages."):"Search index unavailable."; list.innerHTML=""; return; }
      var res=search(q);
      meta.textContent=res.length?(res.length+(res.length===18?"+":"")+" page"+(res.length===1?"":"s")+" match “"+q+"”"):"";
      if(!res.length){ list.innerHTML='<p class="bnc-search-empty">No matches for “'+esc(q)+'”.</p>'; return; }
      var html="";
      res.forEach(function(r){
        var href=B+r.e.file+(r.anchor?("#"+r.anchor):"");
        html+='<a class="bnc-sr" href="'+esc(href)+'">'+
          '<p class="t">'+esc(r.e.title||r.e.file)+'</p>'+
          (r.sec?('<p class="sec">'+esc(r.sec)+'</p>'):'')+
          '<p class="snip">'+r.snip+'</p></a>';
      });
      list.innerHTML=html;
    }

    btn.addEventListener("click", open);
    xbtn.addEventListener("click", close);
    scrim.addEventListener("click", close);
    var tmr; input.addEventListener("input", function(){ clearTimeout(tmr); tmr=setTimeout(run,120); });
    input.addEventListener("keydown", function(e){
      if(e.key==="Escape") close();
      if(e.key==="Enter"){ var f=list.querySelector("a.bnc-sr"); if(f) window.location.href=f.getAttribute("href"); }
    });
    document.addEventListener("keydown", function(e){
      if((e.ctrlKey||e.metaKey) && (e.key==="k"||e.key==="K")){ e.preventDefault(); ov.classList.contains("open")?close():open(); }
    });
  }

  ready(function(){ try{ build(); }catch(e){ if(window.console) console.warn("book-search:", e); } });
})();
