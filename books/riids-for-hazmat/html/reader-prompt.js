/* _reader-prompt.js  (BNC Web Books - canonical reading-path popup)
 *
 * This is the SERIES-STANDARD reader-path banner + 30s modal, copied from the
 * Scintillator book so every book looks identical. Drops a sticky "Reader Path /
 * Free Print Copy" banner at the top of any chapter and shows a modal 30 seconds
 * after load inviting the reader to take the routing quiz. Skip dismisses 30 days.
 *
 * Usage: add  <script defer src="reader-prompt.js"></script>  to each page.
 *
 * PER-BOOK CONFIG (edit the three values below only):
 *   QUIZ_URL       - relative path from the page to this book's reader-quiz.html
 *   BOOK_KEY       - unique slug (scintillator/rtsa/hppg/rfpower/riid/radar/rf)
 *   PATHS_SENTENCE - one sentence describing this book's three reading paths
 */
(function () {
  // --- config (edit per book) ---------------------------------------------
  var QUIZ_URL = "../web/reader-quiz.html";
  var BOOK_KEY = "riid";
  var PATHS_SENTENCE = "This handbook has three reading paths, one for the frontline operator who carries the instrument, one for the program lead who builds the capability, and one for the reachback specialist who makes the hard calls, and six quick questions point you to yours.";
  var DELAY_MS = 30 * 1000;
  var SKIP_DAYS = 30;
  // ------------------------------------------------------------------------
  var SKIP_KEY = BOOK_KEY + "-reader-prompt-skip-until";
  var TAKEN_KEY = BOOK_KEY + "-reader-prompt-taken";

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function isDismissed() {
    if (lsGet(TAKEN_KEY) === "1") return true;
    var until = parseInt(lsGet(SKIP_KEY) || "0", 10);
    if (until && Date.now() < until) return true;
    return false;
  }

  function injectStyles() {
    if (document.getElementById("__bnc-rp-style")) return;
    var css = '\
      .bnc-top-banner{font-family:Helvetica,Arial,sans-serif;background:linear-gradient(90deg,#003D6B 0%,#0078B6 60%,#00b4ff 100%);color:#fff;padding:10px 20px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;border-bottom:2px solid #C77E00;position:sticky;top:0;z-index:90;font-size:10pt;letter-spacing:.5px;}\
      .bnc-top-banner .left{display:flex;align-items:center;gap:10px;}\
      .bnc-top-banner .mark{display:inline-flex;align-items:center;justify-content:center;height:26px;}\
      .bnc-top-banner .mark svg{height:26px;width:auto;display:block;}\
      .bnc-top-banner .series{text-transform:uppercase;letter-spacing:2.5px;font-size:9pt;color:#7fdbff;}\
      .bnc-top-banner .label{font-style:italic;font-family:Georgia,serif;color:#cfdfee;font-size:10.5pt;}\
      .bnc-top-banner .spacer{flex:1;}\
      .bnc-top-banner a.cta{font-family:Helvetica,Arial,sans-serif;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;font-size:9.5pt;padding:7px 16px;background:#C77E00;color:#fff;text-decoration:none;border:none;border-radius:3px;border-bottom:none;transition:all .15s;}\
      .bnc-top-banner a.cta:hover{background:#fff;color:#003D6B;}\
      .bnc-top-banner a.cta::after{content:" →";}\
      @media(max-width:600px){.bnc-top-banner{padding:8px 14px;font-size:9pt;}.bnc-top-banner .label{display:none;}}\
      \
      .bnc-rp-overlay{position:fixed;inset:0;background:rgba(0,31,56,.55);backdrop-filter:blur(2px);z-index:9990;display:flex;align-items:center;justify-content:center;padding:24px;opacity:0;transition:opacity .35s;pointer-events:none;}\
      .bnc-rp-overlay.show{opacity:1;pointer-events:auto;}\
      .bnc-rp-modal{background:#fff;max-width:540px;width:100%;border-radius:6px;border-left:6px solid #C77E00;box-shadow:0 14px 40px rgba(0,31,56,.35);overflow:hidden;transform:translateY(14px);transition:transform .35s;}\
      .bnc-rp-overlay.show .bnc-rp-modal{transform:translateY(0);}\
      .bnc-rp-head{padding:22px 28px 14px;background:linear-gradient(135deg,#003D6B,#001f38);color:#fff;}\
      .bnc-rp-head .crumb{font-family:Helvetica,Arial,sans-serif;font-size:9pt;letter-spacing:3px;text-transform:uppercase;color:#7fdbff;margin:0 0 4px;}\
      .bnc-rp-head h2{font-family:Helvetica,"Arial Black",sans-serif;font-size:18pt;margin:0;line-height:1.2;color:#fff !important;border:none !important;box-shadow:none !important;padding:0;}\
      .bnc-rp-body{padding:18px 28px 8px;font-family:Georgia,serif;font-size:11pt;color:#2C3E50;line-height:1.55;}\
      .bnc-rp-body p{margin:8px 0;}\
      .bnc-rp-body .perks{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px;}\
      .bnc-rp-body .perks span{font-family:Helvetica,Arial,sans-serif;font-size:9pt;letter-spacing:.5px;background:#f5f0fa;color:#4B2A6B;padding:4px 10px;border-radius:3px;font-weight:700;text-transform:uppercase;}\
      .bnc-rp-actions{padding:14px 28px 22px;display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;}\
      .bnc-rp-actions button{font-family:Helvetica,Arial,sans-serif;font-weight:700;letter-spacing:1px;text-transform:uppercase;font-size:9.5pt;padding:10px 18px;border-radius:3px;cursor:pointer;border:2px solid #003D6B;transition:all .15s;}\
      .bnc-rp-actions .skip{background:#fff;color:#003D6B;}\
      .bnc-rp-actions .skip:hover{background:#ECEFF1;}\
      .bnc-rp-actions .take{background:#003D6B;color:#fff;}\
      .bnc-rp-actions .take:hover{background:#C77E00;border-color:#C77E00;}\
      .bnc-rp-close{position:absolute;top:10px;right:14px;background:transparent;border:none;color:#fff;font-size:18pt;line-height:1;cursor:pointer;font-family:Helvetica,Arial,sans-serif;opacity:.7;}\
      .bnc-rp-close:hover{opacity:1;}\
    ';
    var s = document.createElement("style");
    s.id = "__bnc-rp-style";
    s.textContent = css;
    document.head.appendChild(s);
  }

  function injectBanner() {
    if (document.querySelector(".bnc-top-banner")) return;
    var b = document.createElement("div");
    b.className = "bnc-top-banner";
    b.innerHTML =
      '<div class="left">' +
        '<span class="mark"><svg viewBox="150 70 450 340" xmlns="http://www.w3.org/2000/svg" fill="#fff" role="img" aria-label="Berkeley Nucleonics"><path d="M326.86,400.29c-88.04,0-159.67-71.63-159.67-159.67s71.63-159.67,159.67-159.67,159.67,71.63,159.67,159.67-71.63,159.67-159.67,159.67ZM326.86,99.21c-77.97,0-141.4,63.43-141.4,141.41s63.43,141.4,141.4,141.4,141.4-63.43,141.4-141.4-63.43-141.41-141.4-141.41Z"/><polygon points="882.15 284.93 383 284.93 383 204.02 268.17 204.02 268.17 284.93 90.53 284.93 90.53 274.49 257.73 274.49 257.73 193.58 393.44 193.58 393.44 274.49 882.15 274.49 882.15 284.93"/></svg></span>' +
        '<span class="series">Berkeley Nucleonics</span>' +
      '</div>' +
      '<span class="label">Interactive Reference Guide</span>' +
      '<span class="spacer"></span>' +
      '<a class="cta" href="' + QUIZ_URL + '">Reader Path / Free Print Copy</a>';
    document.body.insertBefore(b, document.body.firstChild);
  }

  function injectModal() {
    if (document.querySelector(".bnc-rp-overlay")) return;
    var ov = document.createElement("div");
    ov.className = "bnc-rp-overlay";
    ov.setAttribute("role", "dialog");
    ov.setAttribute("aria-modal", "true");
    ov.setAttribute("aria-labelledby", "bnc-rp-title");
    ov.innerHTML =
      '<div class="bnc-rp-modal" style="position:relative;">' +
        '<button class="bnc-rp-close" aria-label="Close">×</button>' +
        '<div class="bnc-rp-head">' +
          '<p class="crumb">Interactive Reference Guide</p>' +
          '<h2 id="bnc-rp-title">Find your reading path in 60 seconds.</h2>' +
        '</div>' +
        '<div class="bnc-rp-body">' +
          '<p>' + PATHS_SENTENCE + '</p>' +
          '<div class="perks">' +
            '<span>✓ Personalized roadmap</span>' +
            '<span>✓ Free print copy</span>' +
            '<span>✓ Free Academy course pass</span>' +
          '</div>' +
        '</div>' +
        '<div class="bnc-rp-actions">' +
          '<button class="skip" type="button">Skip for now</button>' +
          '<button class="take" type="button">Take the quiz →</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);

    function close() {
      ov.classList.remove("show");
      lsSet(SKIP_KEY, String(Date.now() + SKIP_DAYS * 24 * 60 * 60 * 1000));
    }
    function take() {
      lsSet(TAKEN_KEY, "1");
      window.location.href = QUIZ_URL;
    }
    ov.querySelector(".bnc-rp-close").addEventListener("click", close);
    ov.querySelector(".skip").addEventListener("click", close);
    ov.querySelector(".take").addEventListener("click", take);
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && ov.classList.contains("show")) close();
    });
    return ov;
  }

  function maybeShowAfterDelay() {
    if (isDismissed()) return;
    setTimeout(function () {
      if (isDismissed()) return;
      var ov = document.querySelector(".bnc-rp-overlay") || injectModal();
      ov.classList.add("show");
    }, DELAY_MS);
  }

  function boot() { injectStyles(); injectBanner(); maybeShowAfterDelay(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
