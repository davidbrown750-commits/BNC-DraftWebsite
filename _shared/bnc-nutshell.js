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

  var SCALE = 0.8; // shrink the Nutshell widget a bit

  function boot() {
    if (!document.getElementById('nutshell-boot-' + INSTANCE)) {
      var d = document.createElement('div');
      d.id = 'nutshell-boot-' + INSTANCE;
      document.body.appendChild(d);
    }
    if (!document.getElementById('bnc-ns-scale')) {
      var st = document.createElement('style');
      st.id = 'bnc-ns-scale';
      st.textContent = '#nutshell-boot-' + INSTANCE +
        '{position:fixed;right:0;bottom:0;z-index:9000;transform:scale(' + SCALE +
        ');transform-origin:100% 100%;}';
      document.head.appendChild(st);
    }
    // Dismiss control: let the visitor hide the chat for this page view only.
    // No persistence -> it returns on the next page load, per spec.
    if (!document.getElementById('bnc-ns-close')) {
      var xbtn = document.createElement('button');
      xbtn.id = 'bnc-ns-close';
      xbtn.type = 'button';
      xbtn.setAttribute('aria-label', 'Hide chat');
      xbtn.innerHTML = '&times;';
      xbtn.style.cssText = 'position:fixed;right:26px;bottom:92px;z-index:9001;width:20px;height:20px;'
        + 'padding:0;border:none;border-radius:50%;background:#113163;color:#fff;'
        + 'font:700 14px/20px Arial,sans-serif;text-align:center;cursor:pointer;'
        + 'box-shadow:0 2px 6px rgba(0,0,0,.3);opacity:.85;';
      xbtn.addEventListener('mouseenter', function () { xbtn.style.opacity = '1'; });
      xbtn.addEventListener('mouseleave', function () { xbtn.style.opacity = '.85'; });
      xbtn.addEventListener('click', function () {
        var c = document.getElementById('nutshell-boot-' + INSTANCE);
        if (c) c.style.display = 'none';
        xbtn.style.display = 'none';
      });
      document.body.appendChild(xbtn);
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
