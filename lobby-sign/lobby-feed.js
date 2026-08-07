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
  if (!FEED) return;
  var POLL_MS = 60000;

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
      window.BOARD.setSubmitted(items);
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

  function poll() {
    fetch(FEED, { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(apply)
      .catch(function () { /* offline or endpoint down: keep showing what we have */ });
  }

  poll();
  setInterval(poll, POLL_MS);
})();
