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

  function payload() {
    if (document.visibilityState !== "hidden") { active += Date.now() - lastResume; lastResume = Date.now(); }
    return JSON.stringify({
      visitor_id: VID, user_id: userId(), email: email(),
      path: location.pathname, page_title: document.title,
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
