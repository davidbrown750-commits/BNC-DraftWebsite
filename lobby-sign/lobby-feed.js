/* Live staff submissions for the lobby sign.
 *
 * Only the HOSTED build loads this. The claude.ai artifact version does not, because
 * artifacts run under a strict CSP that blocks the request — so the artifact stays a
 * static snapshot and the hosted copy is the live one.
 *
 * Reads https://www.berkeleynucleonics.com/api/lobby-feed?k=... every minute and folds
 * approved posts into the slots the board already has: announcements and shout-outs
 * join the amber highlight rotation, riddles join the hourly rotation, photos take the
 * reply-pile panel when there are any.
 *
 * Everything here fails soft. If the feed is unreachable the board keeps running on
 * whatever was baked in, which is what a screen on a wall needs to do.
 */
(function () {
  "use strict";

  /* The key comes from the sign's own URL, not from this file. That way the built page
     carries no secret and can sit in the repo: the key lives only in the bookmark on the
     reception TV. Open the sign as  .../lobby-sign/?k=THEKEY  */
  function feedURL() {
    var m = /[?&]k=([^&]+)/.exec(location.search);
    if (!m) return "";
    return "/api/lobby-feed?k=" + m[1];
  }
  var FEED = feedURL();
  var POLL_MS = 60000;

  /* Two sources feed the amber slot now, so neither may clobber the other:
     the older approved-posts feed, and the notices typed in /lobby-dashboard/.
     Each keeps its own list and the board is handed the union. */
  var fromFeed = [], fromNotices = [];
  function pushSubmitted(){
    if (window.BOARD && typeof window.BOARD.setSubmitted === "function")
      window.BOARD.setSubmitted(fromNotices.concat(fromFeed));
  }

  function apply(data) {
    if (!data || !data.ok) return;

    // ---- announcements + shout-outs -> the amber highlight slot ----
    if (window.BOARD && typeof window.BOARD.setSubmitted === "function") {
      var items = [];
      (data.announcements || []).forEach(function (a) {
        items.push({ e: "📣", t: a.t, d: a.d || "", until: a.until || null });
      });
      (data.shoutouts || []).forEach(function (s) {
        items.push({
          e: "👏",
          t: s.t,
          d: (s.d || "") + (s.by ? "  — posted by " + s.by : ""),
          until: s.until || null
        });
      });
      fromFeed = items; pushSubmitted();
    }

    // ---- riddles -> the hourly rotation ----
    if (window.BOARD && typeof window.BOARD.setRiddles === "function" && (data.riddles || []).length) {
      window.BOARD.setRiddles((data.riddles || []).map(function (r) {
        return { q: r.q, a: r.a };
      }));
    }

    // ---- photos -> the panel that normally shows the reply pile ----
    if (window.BOARD && typeof window.BOARD.setPhotos === "function") {
      window.BOARD.setPhotos(data.photos || []);
    }
  }

  /* Notices from the dashboard. Authorised by the bnc_sign cookie the password login
     sets, so no key is needed in the URL. Fails soft like everything else here: a wall
     screen keeps showing whatever it already had. */
  function pollNotices() {
    fetch("/api/lobby-screens?id=lobby-sign", { cache: "no-store", credentials: "same-origin" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !j.ok || !j.screen || j.screen.enabled === false) { fromNotices = []; pushSubmitted(); return; }
        var today = new Date();
        var iso = today.getFullYear() + "-" +
          String(today.getMonth() + 1).padStart(2, "0") + "-" +
          String(today.getDate()).padStart(2, "0");
        fromNotices = (j.screen.items || [])
          .filter(function (it) { return !it.until || it.until >= iso; })
          .map(function (it) { return { e: "●", t: it.title, d: it.detail || "", until: it.until || null }; });
        pushSubmitted();
      })
      .catch(function () { /* keep what is on screen */ });
  }

  function poll() {
    if (!FEED) return;
    fetch(FEED, { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(apply)
      .catch(function () { /* offline or endpoint down: keep showing what we have */ });
  }

  poll();
  pollNotices();
  setInterval(poll, POLL_MS);
  setInterval(pollNotices, POLL_MS);
})();
