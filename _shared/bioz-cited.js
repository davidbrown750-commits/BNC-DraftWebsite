/* ---- Bioz "Cited in peer-reviewed research" strip (2026-08-05) -------------
 * Hydrates the full-width citation panel that sits above the footer, and
 * repoints the hero badge at it.
 *
 * The live Bioz widget is a third-party embed, so it is NOT loaded on page
 * load. The <object> is injected only when the panel scrolls into view, which
 * keeps the third-party request off every page view and out of the critical
 * path. Browsers without IntersectionObserver load it immediately.
 *
 * Counts and Bioz Stars are deliberately not duplicated in our own markup:
 * the widget is the single source of truth, so nothing can drift.
 */
(function () {
  "use strict";

  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  ready(function () {
    var panel = document.getElementById("bioz-cited");
    if (!panel) return;

    var frame = panel.querySelector(".bioz-cited-frame");
    var src = frame && frame.getAttribute("data-bioz-src");
    if (!frame || !src) return;

    var loaded = false;
    function load() {
      if (loaded) return;
      loaded = true;
      var obj = document.createElement("object");
      obj.type = "text/html";
      obj.data = src;
      obj.setAttribute(
        "title",
        "Peer-reviewed publications citing this instrument, from Bioz"
      );
      frame.innerHTML = "";
      frame.appendChild(obj);
      frame.classList.add("is-loaded");
    }

    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(
        function (entries) {
          if (entries[0] && entries[0].isIntersecting) {
            load();
            io.disconnect();
          }
        },
        { rootMargin: "400px 0px" }
      );
      io.observe(panel);
    } else {
      load();
    }

    /* The hero badge (and its sticky clone) now scroll to the panel instead of
       opening the old modal. The href stays a real Bioz link so middle-click,
       modifier-click and JS-off all still reach Bioz. pdf-configurator.js
       stands down when this panel is present. */
    function bind(a) {
      if (!a || a.getAttribute("data-bioz-bound")) return;
      a.setAttribute("data-bioz-bound", "1");
      a.addEventListener("click", function (e) {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
        e.preventDefault();
        load();
        try {
          panel.scrollIntoView({ behavior: "smooth", block: "start" });
        } catch (err) {
          panel.scrollIntoView();
        }
        if (history.replaceState) history.replaceState(null, "", "#bioz-cited");
      });
    }

    Array.prototype.forEach.call(
      document.querySelectorAll("a.bioz-badge"),
      bind
    );

    /* pdf-configurator.js clones the hero badge into the sticky holder after
       this runs, so pick the clone up once it appears. */
    if ("MutationObserver" in window) {
      var mo = new MutationObserver(function () {
        var clone = document.querySelector("a.bioz-badge-sticky");
        if (clone) {
          bind(clone);
          mo.disconnect();
        }
      });
      mo.observe(document.body, { childList: true, subtree: true });
      setTimeout(function () { mo.disconnect(); }, 8000);
    }

    /* Deep link support: /page#bioz-cited arrives with the panel already open. */
    if (window.location.hash === "#bioz-cited") load();
  });
})();
