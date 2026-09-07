/* Live content for the lobby sign.
 *
 * Only the HOSTED build loads this. The claude.ai artifact version does not, because
 * artifacts run under a strict CSP that blocks the request, so the artifact stays a
 * static snapshot and the hosted copy is the live one.
 *
 * Everything the sign shows that a person can edit comes from one record, written in
 * /lobby-dashboard/ and read here: notices, riddles, photos and upcoming shows, as a
 * flat list of typed blocks. The request is authorised by the bnc_sign cookie the
 * password login sets, so nothing secret sits in this file and it is safe to commit.
 *
 * This used to poll /api/lobby-feed against the bnc_lobby_posts table. That table was
 * never created, so the endpoint answered 503 for its whole life; it and the /lobby
 * submissions page have been retired in favour of the dashboard.
 *
 * Everything fails soft. If the feed is unreachable the sign keeps showing whatever
 * was baked in, which is what a screen on a wall needs to do.
 */
(function () {
  "use strict";

  var SOURCE = "/api/lobby-screens?id=lobby-sign";
  var POLL_MS = 60000;

  function apply(doc) {
    if (!doc || doc.enabled === false) return;
    var blocks = doc.blocks || [];
    var B = window.BOARD;
    if (!B) return;

    var today = new Date();
    var iso = today.getFullYear() + "-" +
      String(today.getMonth() + 1).padStart(2, "0") + "-" +
      String(today.getDate()).padStart(2, "0");

    function ofType(t) { return blocks.filter(function (b) { return b && b.type === t; }); }

    // Notices ride the amber slot. A dated one drops off the day after it runs, so
    // nobody has to remember to take it down.
    if (typeof B.setSubmitted === "function") {
      B.setSubmitted(ofType("notice")
        .filter(function (b) { return !b.until || b.until >= iso; })
        .map(function (b) {
          return { e: "●", t: b.title, d: b.detail || "", until: b.until || null };
        }));
    }

    if (typeof B.setRiddles === "function") {
      var riddles = ofType("riddle").map(function (b) { return { q: b.q, a: b.a }; });
      if (riddles.length) B.setRiddles(riddles);
    }

    if (typeof B.setPhotos === "function") {
      B.setPhotos(ofType("photo").map(function (b) {
        return { src: b.image, t: b.caption || "", by: "" };
      }));
    }

    if (typeof B.setEvents === "function") {
      B.setEvents(ofType("event").map(function (b) {
        return { name: b.name, place: b.place || "", start: b.start, end: b.end || b.start };
      }));
    }
  }

  /* The lobby TV follows the dashboard. If someone has switched it to the visitor or
     did-you-know sign, leave for the renderer; it sends the TV back here when the fun
     board is chosen again. Skipped when the URL pins a sign explicitly. */
  function followActive() {
    if (/[?&]pin=/.test(location.search)) return;
    fetch("/api/lobby-screens?action=active", { cache: "no-store", credentials: "same-origin" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (j && j.ok && j.active && j.active !== "fun") location.replace("/screen/");
      })
      .catch(function () { /* stay put */ });
  }

  function poll() {
    followActive();
    fetch(SOURCE, { cache: "no-store", credentials: "same-origin" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { if (j && j.ok) apply(j.screen); })
      .catch(function () { /* offline or endpoint down: keep showing what we have */ });
  }

  poll();
  setInterval(poll, POLL_MS);
})();
