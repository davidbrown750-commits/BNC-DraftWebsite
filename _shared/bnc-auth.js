/* ===========================================================================
   BNC AUTH  —  Clerk (login) + Supabase (database) gating layer.
   Loaded site-wide. Behaviour by page:
     - any page : renders the header account control + "Welcome back, NAME"
     - manuals  : soft-gates content past ~7 pages until signed in
     - downloads: blocks software-download links until signed in
     - pricing  : reveals expanded (hard-gated) price rows when signed in
   Records every signed-in return visit via the bnc_record_visit RPC.
   Degrades gracefully: with placeholder keys it still shows the locked
   (logged-out) experience so the gates can be previewed before wiring keys.
   =========================================================================== */
(function () {
  'use strict';

  var CFG = window.BNC_AUTH_CONFIG || {};
  var configured =
    CFG.clerkPublishableKey && CFG.clerkPublishableKey.indexOf('REPLACE') === -1 &&
    CFG.supabaseUrl && CFG.supabaseUrl.indexOf('REPLACE') === -1 &&
    CFG.supabaseAnonKey && CFG.supabaseAnonKey.indexOf('REPLACE') === -1;

  var FREE_PX = (CFG.freeManualPages || 7) * (CFG.pxPerPage || 1150);

  var Clerk = null, sb = null;

  var LOCK_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
    '<path d="M12 1a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-1V6a5 5 0 0 0-5-5zm-3 8V6a3 3 0 0 1 6 0v3H9z"/></svg>';

  /* ---------- tiny helpers ------------------------------------------------ */
  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function loadScript(src, attrs) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = src; s.async = true;
      if (attrs) Object.keys(attrs).forEach(function (k) { s.setAttribute(k, attrs[k]); });
      s.onload = res; s.onerror = function () { rej(new Error('failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function isSignedIn() { return !!(Clerk && Clerk.user); }
  function userName() {
    if (!Clerk || !Clerk.user) return '';
    var u = Clerk.user;
    return u.firstName || u.fullName ||
      (u.primaryEmailAddress && u.primaryEmailAddress.emailAddress) || 'there';
  }
  function userEmail() {
    return (Clerk && Clerk.user && Clerk.user.primaryEmailAddress)
      ? Clerk.user.primaryEmailAddress.emailAddress : null;
  }
  function toast(msg) {
    var t = el('div', 'bnc-toast', msg);
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('show'); });
    setTimeout(function () { t.classList.remove('show'); setTimeout(function () { t.remove(); }, 300); }, 3200);
  }

  /* ---------- sign-in trigger -------------------------------------------- */
  // Remember where the user wanted to go, so we can resume after sign-in.
  function triggerSignIn(resumeUrl) {
    if (resumeUrl) { try { sessionStorage.setItem('bncResume', resumeUrl); } catch (e) {} }
    if (configured && Clerk) {
      Clerk.openSignIn({ afterSignInUrl: location.href, afterSignUpUrl: location.href });
    } else {
      toast('Sign-in activates once the Clerk and Supabase keys are added to bnc-auth-config.js.');
    }
  }

  /* ---------- header account control -------------------------------------- */
  function renderHeader() {
    var bar = document.querySelector('.sitenav-inner');
    if (!bar) return;
    var acct = bar.querySelector('.bnc-acct');
    if (!acct) {
      acct = el('div', 'bnc-acct');
      var cta = bar.querySelector('.sitenav-cta');
      if (cta) bar.insertBefore(acct, cta); else bar.appendChild(acct);
    }
    acct.innerHTML = '';
    if (isSignedIn()) {
      var w = el('span', 'bnc-welcome', 'Welcome back, <b>' + escapeHtml(userName()) + '</b>');
      var btnWrap = el('span', 'bnc-userbtn');
      acct.appendChild(w); acct.appendChild(btnWrap);
      if (Clerk && Clerk.mountUserButton) {
        Clerk.mountUserButton(btnWrap, { afterSignOutUrl: location.href });
      }
    } else {
      var b = el('button', 'bnc-signin', 'Sign in');
      b.addEventListener('click', function () { triggerSignIn(); });
      acct.appendChild(b);
    }
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* ---------- manual page-7 gate ------------------------------------------ */
  function applyManualGate() {
    var body = document.querySelector('main.man-body');
    if (!body) return;
    var secs = [].slice.call(body.querySelectorAll('section.ch'));
    if (!secs.length) return;

    // reset to a clean state first
    var prev = body.querySelector('.bnc-gate-card'); if (prev) prev.remove();
    secs.forEach(function (s) { s.style.display = ''; });
    unlockToc();

    if (isSignedIn()) return;   // full access for signed-in users

    var bodyTop = body.getBoundingClientRect().top + window.scrollY;
    var cut = -1;
    for (var i = 0; i < secs.length; i++) {
      var top = secs[i].getBoundingClientRect().top + window.scrollY - bodyTop;
      if (top > FREE_PX) { cut = i; break; }
    }
    if (cut <= 0) return;       // whole manual is within the free allowance

    var hidden = secs.slice(cut);
    hidden.forEach(function (s) { s.style.display = 'none'; });
    lockToc(hidden);
    body.appendChild(buildGateCard(hidden.length));
  }

  function buildGateCard(remaining) {
    var card = el('div', 'bnc-gate-card');
    card.appendChild(el('div', 'accent'));
    var inner = el('div', 'inner');
    inner.appendChild(el('div', 'lockwrap', LOCK_SVG));
    inner.appendChild(el('h3', null, 'Read the full manual'));
    inner.appendChild(el('p', null,
      'You are viewing the first ' + (CFG.freeManualPages || 7) +
      ' pages. Sign in with a free account to read the remaining ' + remaining +
      ' chapter' + (remaining === 1 ? '' : 's') + ', plus download software tools and view expanded pricing.'));
    var cta = el('button', 'cta', 'Sign in to continue');
    cta.addEventListener('click', function () { triggerSignIn(location.href); });
    inner.appendChild(cta);
    inner.appendChild(el('div', 'sub', 'No account yet? Creating one is free and takes a moment.'));
    card.appendChild(inner);
    return card;
  }

  function lockToc(hiddenSecs) {
    var toc = document.querySelector('.man-toc'); if (!toc) return;
    var ids = {};
    hiddenSecs.forEach(function (s) { if (s.id) ids['#' + s.id] = 1; });
    // also lock sub-anchors that live inside hidden sections
    [].slice.call(toc.querySelectorAll('a[href^="#"]')).forEach(function (a) {
      var href = a.getAttribute('href');
      var target = document.querySelector(href.replace(/"/g, '\\"'));
      var inHidden = ids[href] || (target && target.closest && target.closest('section.ch') &&
        hiddenSecs.indexOf(target.closest('section.ch')) !== -1);
      if (inHidden) {
        a.classList.add('bnc-locked');
        if (!a.querySelector('svg')) a.insertAdjacentHTML('afterbegin', LOCK_SVG);
        if (!a.__bncBound) {
          a.__bncBound = true;
          a.addEventListener('click', function (e) {
            if (!isSignedIn()) { e.preventDefault(); triggerSignIn(location.href); }
          });
        }
      }
    });
  }
  function unlockToc() {
    [].slice.call(document.querySelectorAll('.man-toc a.bnc-locked')).forEach(function (a) {
      a.classList.remove('bnc-locked');
      var svg = a.querySelector('svg'); if (svg) svg.remove();
    });
  }

  /* ---------- software-download gate -------------------------------------- */
  function applyDownloadGate() {
    var rows = document.querySelectorAll('a.row[href*="/download/"]');
    [].slice.call(rows).forEach(function (a) {
      a.classList.toggle('bnc-locked-row', !isSignedIn());
      if (!a.__bncBound) {
        a.__bncBound = true;
        a.addEventListener('click', function (e) {
          if (!isSignedIn()) {
            e.preventDefault();
            triggerSignIn(a.href);
          }
        });
      }
    });
  }

  /* ---------- expanded pricing (hard gate via Supabase) ------------------- */
  // Collapsible categories, served from Supabase only when signed in.
  function applyPricingGate() {
    var host = document.querySelector('[data-bnc-pricing="expanded"]');
    if (!host) return;
    host.innerHTML = '';
    if (!isSignedIn() || !sb) {
      var g = el('div', 'bnc-pricing-gate');
      g.appendChild(el('h3', null, 'Expanded pricing is for registered users'));
      g.appendChild(el('p', null, 'Sign in with a free account to view the full price list.'));
      var cta = el('button', 'cta', 'Sign in to view');
      cta.addEventListener('click', function () { triggerSignIn(location.href); });
      g.appendChild(cta);
      host.appendChild(g);
      return;
    }
    host.appendChild(el('p', 'bnc-loading', 'Loading the full price list...'));
    sb.from('bnc_pricing').select('model,description,price_usd,category,is_option,sort')
      .eq('tier', 'expanded').order('sort', { ascending: true })
      .then(function (res) {
        host.innerHTML = '';
        var rows = (res && res.data) || [];
        if (!rows.length) { host.appendChild(el('p', null, 'No expanded pricing published yet.')); return; }
        var groups = [], byName = {};
        rows.forEach(function (r) {
          var c = r.category || 'Other';
          if (!byName[c]) { byName[c] = { name: c, items: [] }; groups.push(byName[c]); }
          byName[c].items.push(r);
        });
        var tools = el('div', 'bnc-pricing-tools');
        var inp = el('input'); inp.type = 'search'; inp.placeholder = 'Filter by model or description...';
        var exp = el('button', null, 'Expand all'), col = el('button', null, 'Collapse all');
        tools.appendChild(inp); tools.appendChild(exp); tools.appendChild(col);
        host.appendChild(tools);
        var wrap = el('div'); host.appendChild(wrap);
        groups.forEach(function (gp, gi) {
          var d = el('details', 'bnc-acc'); if (gi === 0) d.open = true;
          d.appendChild(el('summary', null, escapeHtml(gp.name) + ' <span class="cnt">' + gp.items.length + '</span>'));
          var t = el('table', 'spec');
          t.innerHTML = '<thead><tr><th>Model</th><th>Description</th><th>Price (USD)</th></tr></thead>';
          var tb = el('tbody');
          gp.items.forEach(function (r) {
            var tr = el('tr');
            tr.setAttribute('data-h', ((r.model || '') + ' ' + (r.description || '')).toLowerCase());
            tr.appendChild(el('td', r.is_option ? 'opt' : null, escapeHtml(r.model || '')));
            tr.appendChild(el('td', null, escapeHtml(r.description || '')));
            tr.appendChild(el('td', 'price', r.price_usd != null
              ? '$' + Number(r.price_usd).toLocaleString('en-US', { minimumFractionDigits: 2 })
              : 'Contact us'));
            tb.appendChild(tr);
          });
          t.appendChild(tb); d.appendChild(t); wrap.appendChild(d);
        });
        exp.addEventListener('click', function () { wrap.querySelectorAll('details').forEach(function (x) { x.open = true; }); });
        col.addEventListener('click', function () { wrap.querySelectorAll('details').forEach(function (x) { x.open = false; }); });
        inp.addEventListener('input', function () {
          var q = inp.value.trim().toLowerCase();
          wrap.querySelectorAll('details').forEach(function (d) {
            var any = false;
            d.querySelectorAll('tbody tr').forEach(function (tr) {
              var show = !q || tr.getAttribute('data-h').indexOf(q) !== -1;
              tr.style.display = show ? '' : 'none'; if (show) any = true;
            });
            d.style.display = any ? '' : 'none';
            if (q && any) d.open = true;
          });
        });
      });
  }

  /* ---------- post sign-in contact / SMS opt-in --------------------------- */
  // Wait 10s after sign-in, then offer a text/WhatsApp number (once per browser).
  function maybeShowContactModal() {
    if (!sb || !isSignedIn()) return;
    var asked; try { asked = localStorage.getItem('bncContactAsked'); } catch (e) {}
    if (asked || window.__bncContactScheduled) return;
    window.__bncContactScheduled = true;
    setTimeout(function () {
      if (!isSignedIn() || document.querySelector('.bnc-modal-back')) return;
      var a; try { a = localStorage.getItem('bncContactAsked'); } catch (e) {}
      if (a) return;
      showContactModal();
    }, 10000);
  }

  function showContactModal() {
    var back = el('div', 'bnc-modal-back'), m = el('div', 'bnc-modal');
    m.appendChild(el('div', 'accent'));
    var body = el('div', 'body');
    body.innerHTML =
      '<h3>Prefer to message us?</h3>' +
      '<p>To start a convenient text or WhatsApp conversation, share a cell number. This is optional.</p>' +
      '<label for="bncPhone">Cell number</label>' +
      '<input id="bncPhone" type="tel" placeholder="(415) 555-0100" autocomplete="tel">' +
      '<label class="bnc-optin"><input id="bncOptin" type="checkbox"> ' +
      '<span>Yes, you can contact me by text or WhatsApp about my inquiry. Message and data rates may apply; reply STOP to opt out.</span></label>';
    var row = el('div', 'row');
    var save = el('button', 'save', 'Save'), skip = el('button', 'skip', 'Not now');
    row.appendChild(save); row.appendChild(skip);
    body.appendChild(row); m.appendChild(body); back.appendChild(m);
    document.body.appendChild(back);
    var pref = (Clerk.user && Clerk.user.primaryPhoneNumber && Clerk.user.primaryPhoneNumber.phoneNumber) || '';
    if (pref) body.querySelector('#bncPhone').value = pref;
    function done() { try { localStorage.setItem('bncContactAsked', '1'); } catch (e) {} back.remove(); }
    skip.addEventListener('click', done);
    back.addEventListener('click', function (e) { if (e.target === back) done(); });
    save.addEventListener('click', function () {
      var phone = (body.querySelector('#bncPhone').value || '').trim();
      var optin = body.querySelector('#bncOptin').checked;
      if (phone || optin) sb.rpc('bnc_set_contact', { p_phone: phone || null, p_sms_optin: optin }).then(function () {}, function () {});
      done();
    });
  }

  /* ---------- visit tracking ---------------------------------------------- */
  function recordVisit() {
    if (!sb || !isSignedIn()) return;
    sb.rpc('bnc_record_visit', {
      p_email: userEmail(),
      p_first_name: (Clerk.user && Clerk.user.firstName) || null,
      p_path: location.pathname
    }).then(function () {}, function () {}); // best-effort, never block UI
  }

  /* ---------- apply everything for the current auth state ----------------- */
  function applyState() {
    renderHeader();
    applyManualGate();
    applyDownloadGate();
    applyPricingGate();
  }

  /* ---------- boot -------------------------------------------------------- */
  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  ready(function () {
    // Always render the logged-out experience immediately (works even before
    // keys are configured, so the gates are previewable).
    applyState();

    if (!configured) return;

    Promise.all([
      loadScript('https://' + CFG.clerkFrontendApi + '/npm/@clerk/clerk-js@5/dist/clerk.browser.js',
        { 'data-clerk-publishable-key': CFG.clerkPublishableKey, crossorigin: 'anonymous' }),
      loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2')
    ]).then(function () {
      return window.Clerk.load();
    }).then(function () {
      Clerk = window.Clerk;
      sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, {
        accessToken: function () {
          return (Clerk && Clerk.session) ? Clerk.session.getToken() : Promise.resolve(null);
        }
      });
      // resume an action the user was blocked on before signing in
      if (isSignedIn()) {
        var resume = null;
        try { resume = sessionStorage.getItem('bncResume'); } catch (e) {}
        if (resume) { try { sessionStorage.removeItem('bncResume'); } catch (e) {}
          window.open(resume, '_blank', 'noopener'); }
      }
      applyState();
      recordVisit();
      maybeShowContactModal();
      // react to sign-in / sign-out without a full reload
      Clerk.addListener(function () {
        applyState();
        if (isSignedIn()) { recordVisit(); maybeShowContactModal(); }
      });
    }).catch(function (err) {
      // network / config error: stay in the safe logged-out state
      if (window.console) console.warn('[bnc-auth]', err && err.message);
    });
  });
})();
