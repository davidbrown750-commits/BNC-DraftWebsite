/* Berkeley Nucleonics — ScintIQ "Configure a Detector" CTA
 * Adds an orange sticky button that sits next to the purple PDF Configurator
 * button on every ScintIQ product page. It links to the detector configurator
 * form and passes the current page so the form can return the visitor here
 * after they submit.
 *   <script src="../_shared/scintiq-config-cta.js"></script>
 */
(function () {
  "use strict";
  function ready(fn){ if (document.readyState !== "loading") fn(); else document.addEventListener("DOMContentLoaded", fn); }

  // Configurator lives in the same /docs/ folder as the ScintIQ datasheets.
  function href(){
    return "scintiq-configurator.html?from=" + encodeURIComponent(location.href.split("#")[0]);
  }

  ready(function(){
    var css = "" +
      ".scfg-cta{display:inline-flex;align-items:center;gap:.45em;font-family:'Myriad Pro','Segoe UI',Arial,sans-serif;font-weight:700;font-size:.84rem;letter-spacing:.02em;color:#fff;background:linear-gradient(115deg,#b45309,#ea7a0c 55%,#f59e0b);border:none;border-radius:6px;padding:.55em 1.1em;cursor:pointer;text-decoration:none;box-shadow:0 5px 16px -7px rgba(180,83,9,.9);box-sizing:border-box;pointer-events:auto;}" +
      ".scfg-cta:hover{filter:brightness(1.07);text-decoration:none;}" +
      ".scfg-cta svg{width:16px;height:16px;fill:none;stroke:#fff;stroke-width:2;flex:0 0 auto;}" +
      ".scfg-cta .lbl{text-align:left;line-height:1.15;}";
    var st = document.createElement("style"); st.id = "scfg-css"; st.textContent = css;
    document.head.appendChild(st);

    var a = document.createElement("a");
    a.className = "scfg-cta";
    a.href = href();
    a.setAttribute("aria-label", "Configure a custom scintillation detector");
    // sliders / configure icon
    a.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h12M20 17h0"/>' +
      '<circle cx="15" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="18" cy="17" r="2"/></svg>' +
      '<span class="lbl">Configure a<br>Detector</span>';

    // Place it just left of the purple PDF Configurator button (same sticky holder).
    // pdf-configurator.js injects that holder on DOMContentLoaded, so poll briefly.
    var tries = 0;
    var iv = setInterval(function(){
      tries++;
      var holder = document.querySelector(".pdfcfg-holder");
      var purple = document.querySelector(".pdfcfg-trigger");
      if (holder && purple) {
        a.style.marginRight = "10px";
        holder.insertBefore(a, purple);
        clearInterval(iv);
      } else if (tries > 40) {
        clearInterval(iv);
        // Fallback: stand up our own sticky holder if this page has no PDF configurator.
        var h = document.createElement("div");
        h.style.cssText = "position:sticky;top:70px;z-index:150;max-width:1240px;margin:10px auto 0;padding:0 28px;text-align:right;pointer-events:none;";
        h.appendChild(a);
        var anchor = document.querySelector(".doc-hero") || document.querySelector(".man-hero") || document.querySelector("h1");
        if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(h, anchor.nextSibling);
        else document.body.insertBefore(h, document.body.firstChild);
      }
    }, 100);
  });
})();
