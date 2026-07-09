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

  var VID = vid(), active = 0, lastResume = Date.now(), sent = false;
  // tab-aware dwell: only count time the tab is actually visible
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") { active += Date.now() - lastResume; }
    else { lastResume = Date.now(); }
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
    if (document.visibilityState !== "hidden") { active += Date.now() - lastResume; lastResume = Date.now(); }
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
