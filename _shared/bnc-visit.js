/* _shared/bnc-visit.js - load on every page (after bnc-auth.js).
   Records one row per page view with tab-aware dwell, posted to /api/track on leave.
   Durable visitor id (localStorage + 2yr cookie). No external dependencies. */
(function () {
  "use strict";
  function uuid() { try { return crypto.randomUUID(); } catch (e) { return "v" + Date.now() + Math.random().toString(36).slice(2); } }
  function getCookie(n) { var m = document.cookie.match("(?:^|; )" + n + "=([^;]*)"); return m ? decodeURIComponent(m[1]) : ""; }
  function setCookie(n, v) { try { document.cookie = n + "=" + encodeURIComponent(v) + ";path=/;max-age=63072000;samesite=lax"; } catch (e) {} }
  function vid() {
    var v = ""; try { v = localStorage.getItem("bnc_vid") || ""; } catch (e) {}
    if (!v) v = getCookie("bnc_vid");
    if (!v) v = uuid();
    try { localStorage.setItem("bnc_vid", v); } catch (e) {}
    setCookie("bnc_vid", v);
    return v;
  }
  function email() {
    try { var u = window.Clerk && window.Clerk.user; if (u && u.primaryEmailAddress) return u.primaryEmailAddress.emailAddress; } catch (e) {}
    try { return localStorage.getItem("bnc_email") || ""; } catch (e) { return ""; }
  }
  function userId() { try { return (window.Clerk && window.Clerk.user && window.Clerk.user.id) || ""; } catch (e) { return ""; } }

  var VID = vid(), active = 0, lastTick = Date.now(), sent = false;
  // Idle-aware dwell: the clock only advances between interactions (mouse, keys,
  // scroll, touch), and any single quiet stretch counts for at most IDLE_MS —
  // so a tab left open on screen stops accruing "engaged" time once the visitor
  // walks away. Hidden tabs never accrue.
  var IDLE_MS = 60000;
  function tick() {
    var now = Date.now();
    if (document.visibilityState !== "hidden") active += Math.min(now - lastTick, IDLE_MS);
    lastTick = now;
  }
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") { tick(); }
    else { lastTick = Date.now(); }
  });
  var lastBump = 0;
  function onActivity() {
    var now = Date.now();
    if (now - lastBump < 1000) return; // throttle: mousemove fires constantly
    lastBump = now;
    tick();
  }
  ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"].forEach(function (ev) {
    addEventListener(ev, onActivity, { passive: true, capture: true });
  });

  function canonicalTitle() {
    // Prefer og:title: browser auto-translate rewrites document.title (and the
    // visible page) into the reader's language, but never touches meta tags,
    // so this keeps the visitor log in the site's canonical English.
    try {
      var m = document.querySelector('meta[property="og:title"]');
      if (m && m.content && m.content.trim()) return m.content.trim();
    } catch (e) {}
    return document.title;
  }
  function payload() {
    tick();
    return JSON.stringify({
      visitor_id: VID, user_id: userId(), email: email(),
      path: location.pathname, page_title: canonicalTitle(),
      referrer: document.referrer || "", dwell_seconds: Math.round(active / 1000),
    });
  }
  function send() {
    if (sent) return; sent = true;
    var data = payload();
    try { if (navigator.sendBeacon) { navigator.sendBeacon("/api/track", new Blob([data], { type: "application/json" })); return; } } catch (e) {}
    try { fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body: data, keepalive: true }); } catch (e) {}
  }
  addEventListener("pagehide", send);
  addEventListener("beforeunload", send);

  // Progressive identification: when any form is submitted, remember the email so
  // prior + future anonymous visits for this visitor attribute to that person.
  document.addEventListener("submit", function (e) {
    try {
      var em = e.target.querySelector('input[type=email],input[name=email]');
      if (em && em.value) localStorage.setItem("bnc_email", em.value.trim().toLowerCase());
    } catch (_) {}
  }, true);
})();

/* Make VSG-Mini-6 datasheet + user manual searchable in site search (added 2026-07-02; idempotent - a future reindex won't duplicate). */
(function(){
  var extra=[
    {t:"VSG-Mini-6 USB Vector Signal Generator",u:"docs/bnc-vsg-mini-6-datasheet.html",c:"Berkeley Nucleonics · Data Sheet",k:"vsg-mini-6 vsg mini 6 vsgmini6 usb vector signal generator sga-60 rf microwave signal generator portable"},
    {t:"VSG-Mini-6 USB Vector Signal Generator — User Manual",u:"docs/bnc-vsg-mini-6-user-manual.html",c:"Berkeley Nucleonics · Manual",k:"vsg-mini-6 vsg mini 6 vsgmini6 usb vector signal generator user manual sga-60 rf microwave"}
  ];
  function add(){ if(!window.SITE_INDEX||typeof window.SITE_INDEX.push!=="function") return false; for(var i=0;i<extra.length;i++){ var e=extra[i]; if(!window.SITE_INDEX.some(function(o){return o&&o.u===e.u;})) window.SITE_INDEX.push(e); } return true; }
  if(!add()){ if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",add);} setTimeout(add,1200); }
})();

/* Make bare model-number searches match lettered models in site search (865 -> 865B, 855 -> 855B, 588 -> 588B, 745 -> 745T). Idempotent. Added 2026-07-02. */
(function(){
  function aug(){
    if(!window.SITE_INDEX||typeof window.SITE_INDEX.forEach!=="function") return false;
    window.SITE_INDEX.forEach(function(o){
      if(!o||!o.t) return;
      var nums=o.t.match(/\d{3,4}(?=[a-z])/gi)||[];
      nums.forEach(function(nb){
        if(!new RegExp("(^|[^0-9a-z])"+nb+"([^0-9a-z]|$)","i").test(o.k||"")) o.k=(o.k||"")+" "+nb;
      });
    });
    return true;
  }
  if(!aug()){ if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",aug);} setTimeout(aug,1300); }
})();

/* Remove discontinued Model 971 from the site nav (product retired 2026-07). Robust: runs immediately, on DOMContentLoaded, and via MutationObserver to catch late/re-rendered nav. */
(function(){
  function rm(){
    var els=document.querySelectorAll('a');
    for(var i=0;i<els.length;i++){
      var a=els[i], href=a.getAttribute('href')||'';
      if(a.textContent.trim()==='Model 971' || href.indexOf('bnc-model-971-datasheet')>-1){ if(a.parentNode) a.parentNode.removeChild(a); }
    }
  }
  rm();
  document.addEventListener('DOMContentLoaded', rm);
  try{ var mo=new MutationObserver(rm); mo.observe(document.documentElement,{childList:true,subtree:true}); setTimeout(function(){try{mo.disconnect();}catch(e){}},10000); }catch(e){}
})();


/* Nav label rename: High Power/Current Pulsers -> High Voltage/Current Pulsers (2026-07) */
(function(){
  var OLD='High Power/Current Pulsers', NEW='High Voltage/Current Pulsers';
  function rename(){
    if(!document.body) return 0;
    try{
      var tw=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,{acceptNode:function(n){return (n.parentElement&&/SCRIPT|STYLE/.test(n.parentElement.tagName))?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT;}});
      var n,c=0;
      while(n=tw.nextNode()){ if(n.nodeValue.indexOf(OLD)>-1){ n.nodeValue=n.nodeValue.split(OLD).join(NEW); c++; } }
      return c;
    }catch(e){ return 0; }
  }
  if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded',rename); } else { rename(); }
  var t=0, iv=setInterval(function(){ rename(); if(++t>=5) clearInterval(iv); },400);
})();


/* VSG-Mini-6 search cover thumbnails: title on top, product photo on bottom; datasheet = navy, manual = lighter blue. Generated client-side and injected into the search cover map (SSIMG). */
(function(){
  var tries=0;
  function build(){
    try{
      if(!window.SSIMG){ if(tries++<30) setTimeout(build,250); return; }
      if(window.__vsgCoversDone) return;
      var hero=new Image();
      hero.onload=function(){
        function cover(dark){
          var W=720,H=360,c=document.createElement('canvas');c.width=W;c.height=H;var x=c.getContext('2d');
          var g=x.createLinearGradient(0,0,0,H);
          if(dark){g.addColorStop(0,'#0a2044');g.addColorStop(1,'#103264');}else{g.addColorStop(0,'#245a9e');g.addColorStop(1,'#3a7cc0');}
          x.fillStyle=g;x.fillRect(0,0,W,H);
          var by=150,bh=H-by,bw=W,ir=hero.naturalWidth/hero.naturalHeight,br=bw/bh,sw,sh,sx,sy;
          if(ir>br){sh=hero.naturalHeight;sw=sh*br;sx=(hero.naturalWidth-sw)/2;sy=0;}else{sw=hero.naturalWidth;sh=sw/br;sx=0;sy=(hero.naturalHeight-sh)/2;}
          x.drawImage(hero,sx,sy,sw,sh,0,by,bw,bh);
          x.fillStyle='rgba(255,255,255,.18)';x.fillRect(0,by-2,W,3);
          x.fillStyle='#fff';x.font='700 60px Arial';x.fillText('VSG-Mini-6',34,76);
          x.fillStyle='#d3e2f6';x.font='600 26px Arial';x.fillText('USB Vector Signal Generator',36,116);
          var label=dark?'DATA SHEET':'USER MANUAL';x.font='700 23px Arial';
          var tw=x.measureText(label).width,pw=tw+32,ph=40,px=W-pw-26,py=24,r=20;
          x.fillStyle=dark?'#3a7cc0':'#0a2044';
          x.beginPath();x.moveTo(px+r,py);x.arcTo(px+pw,py,px+pw,py+ph,r);x.arcTo(px+pw,py+ph,px,py+ph,r);x.arcTo(px,py+ph,px,py,r);x.arcTo(px,py,px+pw,py,r);x.closePath();x.fill();
          x.fillStyle='#fff';x.fillText(label,px+16,py+27);
          return c.toDataURL('image/png');
        }
        try{
          window.SSIMG['docs/bnc-vsg-mini-6-datasheet.html']=cover(true);
          window.SSIMG['docs/bnc-vsg-mini-6-user-manual.html']=cover(false);
          window.__vsgCoversDone=true;
        }catch(e){}
      };
      hero.src='/docs/figures/vsg-mini-6-ds/vsg-mini-6-hero.png';
    }catch(e){}
  }
  if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',function(){setTimeout(build,600);});}else{setTimeout(build,600);}
})();


/* Search result badges: classify each result by its page type (data-u slug) and color it. Data Sheet = blue, Manual = purple, Video = green, Application Note (appnote-/brief-) = yellow, Technical Brief (article-) = orange. Only real data sheets keep the Data Sheet label. */
(function(){
  var COL={
    ds:['rgba(56,132,208,0.18)','#6fb0ec'],
    video:['rgba(47,158,107,0.18)','#4fbf8a'],
    manual:['rgba(124,58,237,0.14)','#a78bfa'],
    faq:['rgba(255,255,255,0.16)','#ffffff'],
    appnote:['rgba(240,199,60,0.16)','#f2c94c'],
    tech:['rgba(242,153,74,0.18)','#f2994a']
  };
  function slug(t){return (t.getAttribute('data-u')||'').split('/').pop().toLowerCase();}
  function colorize(){
    var tiles=document.querySelectorAll('.ss-gtile');
    for(var i=0;i<tiles.length;i++){
      var tile=tiles[i], b=tile.querySelector('.ss-gbadge'); if(!b||b.__typed) continue;
      var u=slug(tile), set=null;
      if(u.indexOf('appnote-')===0||u.indexOf('brief-')===0){ set=COL.appnote; b.textContent='Application Note'; }
      else if(u.indexOf('article-')===0){ set=COL.tech; b.textContent='Technical Brief'; }
      else {
        var t=(b.textContent||'').trim().toLowerCase();
        set=t.indexOf('data')===0?COL.ds:(t.indexOf('video')===0?COL.video:(t.indexOf('manual')===0?COL.manual:(t.indexOf('faq')===0?COL.faq:null)));
      }
      if(set){ b.style.background=set[0]; b.style.color=set[1]; b.__typed=true; }
    }
  }
  function start(){ try{ colorize(); new MutationObserver(function(){colorize();}).observe(document.body,{childList:true,subtree:true}); }catch(e){} }
  if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',start);}else{start();}
})();


/* Search: put a product's Data Sheet (then its User Manual) first in results, so number/model/product searches lead with the primary pages. */
(function(){
  function u(t){return (t.getAttribute('data-u')||'').toLowerCase();}
  function reorder(){
    var wrap=document.querySelector('.ss-gwrap'); if(!wrap) return;
    var kids=[].filter.call(wrap.children,function(c){return c.classList&&c.classList.contains('ss-gtile');});
    if(kids.length<2) return;
    var ds=null,man=null;
    for(var i=0;i<kids.length;i++){ var s=u(kids[i]); if(!ds && /-datasheet\.html$/.test(s)) ds=kids[i]; if(!man && /-user-manual\.html$/.test(s)) man=kids[i]; }
    var front=[]; if(ds) front.push(ds); if(man) front.push(man);
    if(!front.length) return;
    var already=true;
    for(var j=0;j<front.length;j++){ if(kids[j]!==front[j]){ already=false; break; } }
    if(already) return;
    var anchor=kids[0];
    for(var k=front.length-1;k>=0;k--){ if(front[k]!==anchor) wrap.insertBefore(front[k], anchor); }
  }
  function start(){ try{ reorder(); new MutationObserver(function(){reorder();}).observe(document.body,{childList:true,subtree:true}); }catch(e){} }
  if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',start);}else{start();}
})();


/* Add existing DEI user manuals to site search + fix the PVP series user-manual category. */
(function(){
  var tries=0;
  function run(){
    if(!window.SITE_INDEX){ if(tries++<30) setTimeout(run,250); return; }
    if(window.__deiIdxDone) return; window.__deiIdxDone=true;
    try{
      var add=[
        {t:'PVX-4110 High-Voltage Pulse Generator \u2014 User Manual', u:'docs/bnc-dei-pvx-4110-user-manual.html', c:'Berkeley Nucleonics \u00b7 Manual', k:'pvx-4110 pvx4110 4110 dei pulse generator high voltage user manual'},{t:'PVX-4130 High-Voltage Pulse Generator \u2014 User Manual', u:'docs/bnc-dei-pvx-4130-user-manual.html', c:'Berkeley Nucleonics \u00b7 Manual', k:'pvx-4130 pvx4130 4130 dei pulse generator high voltage user manual'},{t:'PVX-4000-2kV Pulsed Voltage Source \u2014 User Manual', u:'docs/bnc-dei-pvx-4000-user-manual.html', c:'Berkeley Nucleonics \u00b7 Manual', k:'pvx-4000 pvx4000 4000 dei pulse generator high voltage pulsed voltage user manual'},{t:'PVM-4210 Pulse Generator Module \u2014 User Manual', u:'docs/bnc-dei-pvm-4210-user-manual.html', c:'Berkeley Nucleonics \u00b7 Manual', k:'pvm-4210 pvm4210 4210 dei pulse generator module dual output high voltage user manual'},{t:'PVM-1001 Pulsed Voltage Module \u2014 User Manual', u:'docs/bnc-dei-pvm-1001-user-manual.html', c:'Berkeley Nucleonics \u00b7 Manual', k:'pvm-1001 pvm1001 1001 dei pulsed voltage module high voltage user manual'},{t:'PVX-2506 Pulsed I-V Test Pulser \u2014 User Manual', u:'docs/bnc-dei-pvx-2506-user-manual.html', c:'Berkeley Nucleonics \u00b7 Manual', k:'pvx-2506 pvx2506 2506 dei pulsed iv test pulser semiconductor user manual'},{t:'PCX-7500 Pulsed Current Source \u2014 User Manual', u:'docs/bnc-dei-pcx-7500-user-manual.html', c:'Berkeley Nucleonics \u00b7 Manual', k:'pcx-7500 pcx7500 7500 dei laser diode driver pulsed current source user manual'},{t:'PCO-7121 Laser Diode Driver Module \u2014 User Manual', u:'docs/bnc-dei-pco-7121-user-manual.html', c:'Berkeley Nucleonics \u00b7 Manual', k:'pco-7121 pco7121 7121 dei laser diode driver module user manual'},{t:'PCM-7700 Pulsed Current Source \u2014 User Manual', u:'docs/bnc-dei-pcm-7700-user-manual.html', c:'Berkeley Nucleonics \u00b7 Manual', k:'pcm-7700 pcm7700 7700 dei laser diode driver pulsed current source high current user manual'},{t:'PCX-7401 Pulsed Current Source \u2014 User Manual', u:'docs/bnc-dei-pcx-7401-user-manual.html', c:'Berkeley Nucleonics \u00b7 Manual', k:'pcx-7401 pcx7401 7401 dei laser diode driver pulsed current source user manual'},{t:'PCX-7421 Pulsed Current Source \u2014 User Manual', u:'docs/bnc-dei-pcx-7421-user-manual.html', c:'Berkeley Nucleonics \u00b7 Manual', k:'pcx-7421 pcx7421 7421 dei laser diode driver pulsed current source user manual'},
        {t:'PVX-4140/4141 High-Voltage Pulse Generator \u2014 User Manual', u:'docs/bnc-dei-pvx-4141-user-manual.html', c:'Berkeley Nucleonics \u00b7 Manual', k:'pvx-4141 pvx4141 4141 pvx-4140 pvx4140 4140 dei pulse generator high voltage user manual'},
        {t:'PVX-4150 High-Voltage Pulse Generator \u2014 User Manual', u:'docs/bnc-dei-pvx-4150-user-manual.html', c:'Berkeley Nucleonics \u00b7 Manual', k:'pvx-4150 pvx4150 4150 dei pulse generator high voltage user manual'},
        {t:'PVX-4151 High-Voltage Pulse Generator \u2014 User Manual', u:'docs/bnc-dei-pvx-4151-user-manual.html', c:'Berkeley Nucleonics \u00b7 Manual', k:'pvx-4151 pvx4151 4151 dei pulse generator high voltage user manual'},
        {t:'PCO-6131 Laser Diode Driver Module \u2014 User Manual', u:'docs/bnc-dei-pco-6131-user-manual.html', c:'Berkeley Nucleonics \u00b7 Manual', k:'pco-6131 pco6131 6131 dei laser diode driver module user manual'},
        {t:'PCO-6141 60 A CW/QCW Laser Diode Driver \u2014 User Manual', u:'docs/bnc-dei-pco-6141-user-manual.html', c:'Berkeley Nucleonics \u00b7 Manual', k:'pco-6141 pco6141 6141 dei laser diode driver cw qcw user manual'},
        {t:'PIM-Mini-200 Pulsed Current Source \u2014 User Manual', u:'docs/bnc-dei-pim-mini-200-user-manual.html', c:'Berkeley Nucleonics \u00b7 Manual', k:'pim-mini-200 pim mini 200 dei pulsed current source user manual'}
      ];
      var have={}; for(var i=0;i<window.SITE_INDEX.length;i++){ if(window.SITE_INDEX[i]&&window.SITE_INDEX[i].u) have[window.SITE_INDEX[i].u]=1; }
      for(var j=0;j<add.length;j++){ if(!have[add[j].u]) window.SITE_INDEX.push(add[j]); }
      for(var m=0;m<window.SITE_INDEX.length;m++){ var e=window.SITE_INDEX[m]; if(e&&e.u&&e.u.indexOf('bnc-pvp-series-user-manual.html')>-1){ e.c='PVP-Series \u00b7 Manual'; } }
    }catch(err){}
  }
  run();
})();


/* Share product images across datasheet / user-manual / product search tiles: if one has an image, use it for the others. */
(function(){
  if(window.__ssimgPairDone) return; window.__ssimgPairDone=true;
  function base(u){return String(u).replace(/^\/?(docs\/)?/,'').replace(/\.html.*$/,'').replace(/-(datasheet|user-manual|manual|product|index)$/,'');}
  function fill(){
    try{
      var S=window.SSIMG, SI=window.SITE_INDEX;
      if(!S||!SI) return;
      var byBase={};
      Object.keys(S).forEach(function(k){var b=base(k); if(S[k]&&!byBase[b]) byBase[b]=S[k];});
      SI.forEach(function(e){ if(e&&e.u&&!S[e.u]){ var b=base(e.u); if(byBase[b]) S[e.u]=byBase[b]; } });
    }catch(_){}
  }
  fill();
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',fill);
  setTimeout(fill,1500);
})();


/* Add RFS-4220 to the RF Signal Generators nav submenu, last item. */
(function(){
  if(window.__rfs4220NavDone) return; window.__rfs4220NavDone=true;
  function wire(){
    try{
      var links=document.querySelectorAll('.sitenav-menu a, nav a');
      var anchor=null;
      links.forEach(function(a){ if(/bnc-rfs-1000-datasheet/.test(a.getAttribute('href')||'')) anchor=a; });
      if(!anchor) return;
      if(anchor.parentNode.querySelector('a[data-rfs4220]')) return;
      var na=anchor.cloneNode(true);
      na.setAttribute('data-rfs4220','1');
      na.textContent='RFS-4220';
      na.setAttribute('href', anchor.getAttribute('href').replace('bnc-rfs-1000-datasheet','bnc-rfs-4220-datasheet'));
      anchor.parentNode.insertBefore(na, anchor.nextSibling);
    }catch(_){}
  }
  wire();
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',wire);
  setTimeout(wire,1200);
})();


/* Add RFS-4220 to on-site search: index entry, tile image, description. */
(function(){
  if(window.__rfs4220SearchDone) return; window.__rfs4220SearchDone=true;
  function wire(){
    try{
      var u='docs/bnc-rfs-4220-datasheet.html';
      if(window.SITE_INDEX && !window.SITE_INDEX.some(function(e){return e&&e.u===u;})){
        window.SITE_INDEX.push({t:'RFS-4220 RF Signal Generator 22 GHz - Coming Soon - Berkeley Nucleonics', u:u, c:'Berkeley Nucleonics \u00b7 Data Sheet', k:'rfs-4220 rfs 4220 rf signal generator 22 ghz coming soon microwave berkeley nucleonics'});
      }
      if(window.SSIMG && !window.SSIMG[u]) window.SSIMG[u]='/docs/figures/rfs-4220-og.png';
      if(window.SSDESC && !window.SSDESC[u]) window.SSDESC[u]='The RFS-4220 RF signal generator reaches 22 GHz. Coming soon from Berkeley Nucleonics. Join the launch list to get the datasheet first.';
    }catch(_){}
  }
  wire();
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',wire);
  setTimeout(wire,1000);
})();

;(function(){
  function evoAlias(){
    try{
      var SI=window.SITE_INDEX; if(!SI||!SI.length) return;
      for(var i=0;i<SI.length;i++){
        var e=SI[i]; if(!e) continue;
        var hay=((e.t||'')+' '+(e.u||'')+' '+(e.k||'')).toLowerCase();
        if(hay.indexOf('pvp')>-1 && hay.indexOf('evo')<0){
          e.k=((e.k||'')+' evo evo-series evo series evo1500 evo1400 heinzinger evo').replace(/\s+/g,' ').trim();
        }
      }
    }catch(err){}
  }
  window.__evoPvpAliasDone=true;
  evoAlias();
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', evoAlias);
  setTimeout(evoAlias, 800);
})();
