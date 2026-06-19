/* ===========================================================================
   BNC Nutshell Engagement widget (live chat + AI chatbot).
   Self-contained: Nutshell renders its own floating launcher + chat window and
   pushes conversations/leads into Nutshell CRM. Avatar, colors, and greeting
   are configured in the Nutshell dashboard (Engagement settings) — that is also
   where you A/B the agent photo (swap it and compare the Engagement report).
   The authToken below is a public client-side widget token, safe in the page.
   =========================================================================== */
(function () {
  'use strict';
  if (window.__bncNutshellBooted) return;
  window.__bncNutshellBooted = true;

  var INSTANCE = '73885';
  var TOKEN = 'OImm1TCOwhUADtZSU9G37I3DqiQ7hHMmUNlucwls0Gg.2';

  function boot() {
    if (!document.getElementById('nutshell-boot-' + INSTANCE)) {
      var d = document.createElement('div');
      d.id = 'nutshell-boot-' + INSTANCE;
      document.body.appendChild(d);
    }
    window.Nutsheller = window.Nutsheller || function () {
      (window.Nutsheller.q = window.Nutsheller.q || []).push(arguments);
    };
    window.Nutsheller('boot', { instance: INSTANCE, authToken: TOKEN, target: 'nutshell-boot-' + INSTANCE });
    var s = document.createElement('script');
    s.type = 'module';
    s.src = 'https://loader.nutshell.com/nutsheller-esm.js';
    document.head.appendChild(s);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
