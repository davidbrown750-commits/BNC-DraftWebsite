/* ===========================================================================
   BNC live-chat handoff. Boots the Nutshell Engagement widget ON DEMAND (only
   when a visitor asks to talk to a person from the AI assistant), so there is a
   single front-door launcher (the AI box) and no duplicate bubble on load.
   Nutshell provides the real-time human chat + presence + offline capture +
   the reps' existing agent app; we just open it. Configure Engagement in the
   Nutshell dashboard to LIVE AGENT ONLY (turn the AI bot off) so this reaches a
   human. The authToken is the public client-side widget token (safe in page).
   =========================================================================== */
(function () {
  'use strict';
  var INSTANCE = '73885';
  var TOKEN = 'OImm1TCOwhUADtZSU9G37I3DqiQ7hHMmUNlucwls0Gg.2';
  var booted = false;

  // Open (and lazily boot) the Nutshell live chat. Safe to call repeatedly.
  window.bncOpenLiveChat = function () {
    if (!booted) {
      booted = true;
      var d = document.getElementById('nutshell-boot-' + INSTANCE);
      if (!d) { d = document.createElement('div'); d.id = 'nutshell-boot-' + INSTANCE; document.body.appendChild(d); }
      window.Nutsheller = window.Nutsheller || function () { (window.Nutsheller.q = window.Nutsheller.q || []).push(arguments); };
      window.Nutsheller('boot', { instance: INSTANCE, authToken: TOKEN, target: 'nutshell-boot-' + INSTANCE });
      var s = document.createElement('script');
      s.type = 'module';
      s.src = 'https://loader.nutshell.com/nutsheller-esm.js';
      document.head.appendChild(s);
    }
    // The widget loads async; nudge it open a few times as it initializes.
    var n = 0;
    (function openIt() {
      try { window.Nutsheller('open'); } catch (e) { /* command queued */ }
      if (++n < 12) setTimeout(openIt, 700);
    })();
  };
})();
