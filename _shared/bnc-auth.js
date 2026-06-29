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

  var FREE_PX = (CFG.freeManualPages || 7) * (CFG.pxPerPage || 1150);  // legacy, unused
  var FREE_CHARS = (CFG.freeManualChars || 10000);
  var FREE_FRACTION = (CFG.freeManualFraction || 0.34);

  var Clerk = null, sb = null, sbPublic = null;

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
  // Push the signed-in visitor to Nutshell once per session. The server verifies the
  // Clerk session token before writing, so this cannot be spoofed.
  function syncNutshell() {
    try { if (sessionStorage.getItem('bncNsSynced')) return; } catch (e) {}
    if (!Clerk || !Clerk.user || !Clerk.session) return;
    var u = Clerk.user;
    var email = (u.primaryEmailAddress && u.primaryEmailAddress.emailAddress) || null;
    if (!email) return;
    var name = u.fullName || ((u.firstName || '') + ' ' + (u.lastName || '')).trim() || null;
    var phone = (u.primaryPhoneNumber && u.primaryPhoneNumber.phoneNumber) || null;
    Clerk.session.getToken().then(function (token) {
      if (!token) return;
      fetch('/api/nutshell-sync', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token, email: email, name: name, phone: phone })
      }).then(function () { try { sessionStorage.setItem('bncNsSynced', '1'); } catch (e) {} })
        .catch(function () {});
    }).catch(function () {});
  }
  // Webmaster/internal notes ([data-webmaster]): visible ONLY to these BNC logins;
  // hidden from everyone else, including logged-out visitors.
  var WM_EMAILS = ['davidbrown750@gmail.com','david.brown@berkeleynucleonics.com','meraly.rodas@berkeleynucleonics.com'];
  // Staff-only elements ([data-bnc-staff], e.g. the Support > Employee Portal menu):
  // visible to ANY login whose email ends in @berkeleynucleonics.com.
  var STAFF_DOMAIN = '@berkeleynucleonics.com';
  function applyWebmasterGate() {
    if (!document.getElementById('bnc-wm-style')) {
      var st = document.createElement('style'); st.id = 'bnc-wm-style';
      st.textContent = '[data-webmaster]{display:none!important}body.bnc-wm-ok [data-webmaster]{display:revert!important}'
        + '[data-bnc-staff]{display:none!important}body.bnc-staff-ok [data-bnc-staff]{display:revert!important}';
      (document.head || document.documentElement).appendChild(st);
    }
    var em = (userEmail() || '').toLowerCase();
    if (document.body) {
      document.body.classList.toggle('bnc-wm-ok', WM_EMAILS.indexOf(em) !== -1);
      document.body.classList.toggle('bnc-staff-ok', em.length > STAFF_DOMAIN.length && em.slice(-STAFF_DOMAIN.length) === STAFF_DOMAIN);
    }
  }
  // Formspree return: remember the last real (non-form/non-auth) page, and on the
  // form pages set _next so a submission returns the visitor to the product page
  // they came from, not back to the form.
  function applyFormReturn() {
    var p = location.pathname.toLowerCase();
    var isForm = /(get-quote|contact|rma-form)\.html$/.test(p);
    if (!isForm) {
      if (!/(sign-in|sign-up)\.html$/.test(p)) { try { sessionStorage.setItem('bncPrevPage', location.href); } catch (e) {} }
      return;
    }
    function ok(u){ try { var x=new URL(u, location.href);
      return x.origin===location.origin && !/(get-quote|contact|rma-form|sign-in|sign-up)\.html$/.test(x.pathname.toLowerCase());
    } catch(e){ return false; } }
    var ret=''; try { ret = sessionStorage.getItem('bncPrevPage') || ''; } catch(e){}
    if (!ok(ret)) ret = ok(document.referrer) ? document.referrer : (location.origin + '/home.html');
    var forms = document.querySelectorAll('form[action*="formspree.io"]');
    Array.prototype.forEach.call(forms, function (f) {
      var i = f.querySelector('input[name="_next"]');
      if (!i) { i = document.createElement('input'); i.type='hidden'; i.name='_next'; f.appendChild(i); }
      i.value = ret;
    });
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
      Clerk.openSignIn({ afterSignInUrl: location.href, afterSignUpUrl: location.href,
        signInForceRedirectUrl: location.href, signUpForceRedirectUrl: location.href,
        fallbackRedirectUrl: location.href });
    } else {
      toast('Sign-in activates once the Clerk and Supabase keys are added to bnc-auth-config.js.');
    }
  }
  // New visitors hitting a gate (or the header button) should land on Sign Up
  // first; the Clerk modal still has a "Sign in" link for returning users.
  function triggerSignUp(resumeUrl) {
    if (resumeUrl) { try { sessionStorage.setItem('bncResume', resumeUrl); } catch (e) {} }
    if (configured && Clerk) {
      Clerk.openSignUp({ afterSignInUrl: location.href, afterSignUpUrl: location.href,
        signInForceRedirectUrl: location.href, signUpForceRedirectUrl: location.href,
        fallbackRedirectUrl: location.href });
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
      syncNutshell();
      var w = el('span', 'bnc-welcome', 'Welcome back, <b>' + escapeHtml(userName()) + '</b>');
      var btnWrap = el('span', 'bnc-userbtn');
      acct.appendChild(w); acct.appendChild(btnWrap);
      if (Clerk && Clerk.mountUserButton) {
        Clerk.mountUserButton(btnWrap, { afterSignOutUrl: location.href });
      }
    } else {
      // Not signed in => new visitors have no account yet, so open Sign Up
      // (the Clerk sign-up modal still has an "Already have an account? Sign in"
      // link for returning users).
      var b = el('button', 'bnc-signin', 'Sign up');
      b.addEventListener('click', function () { triggerSignUp(); });
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
    // Always-public pages are never gated: the FAQ, plus any page that opts out
    // with <body data-no-gate> or <main data-no-gate>.
    if (/(?:^|\/)faq\.html$/i.test(location.pathname)) return;
    if (/-datasheet\.html$/i.test(location.pathname)) return;  // datasheets are public, no sign-up gate
    if (document.body && (document.body.hasAttribute('data-no-gate') ||
        document.querySelector('main[data-no-gate]'))) return;
    // Works on both manual layouts: newer (main.man-body / section.ch) and
    // older (main.content / section[id]).
    var body = document.querySelector('main.man-body') || document.querySelector('main.content');
    if (!body) return;
    var secs = [].slice.call(body.querySelectorAll('section.ch'));
    if (!secs.length) secs = [].slice.call(body.querySelectorAll('section[id]'));
    if (!secs.length) return;

    // reset to a clean state first
    var prev = body.querySelector('.bnc-gate-card'); if (prev) prev.remove();
    secs.forEach(function (s) { s.style.display = ''; });
    unlockToc();

    if (isSignedIn()) return;   // full access for signed-in users

    // Character-count cutoff: keep whole sections visible until the running
    // body-text length passes FREE_CHARS, then gate everything after. This is
    // consistent no matter how a manual is paginated — page numbers, table of
    // contents, or chapter layout don't change where it cuts.
    var total = 0, i;
    for (i = 0; i < secs.length; i++) total += (secs[i].textContent || '').length;
    // Free preview = the smaller of FREE_CHARS and a fraction of the whole
    // manual. So long manuals get a bounded preview and short manuals still
    // gate (they reveal about a third before locking).
    var target = Math.min(FREE_CHARS, total * FREE_FRACTION);
    var acc = 0, cut = -1;
    for (i = 0; i < secs.length; i++) {
      acc += (secs[i].textContent || '').length;
      if (acc > target) { cut = i + 1; break; }
    }
    // back-loaded fallback: if the cut lands at the end, still gate the tail
    if ((cut <= 0 || cut >= secs.length) && secs.length > 1) cut = secs.length - 1;
    if (cut <= 0 || cut >= secs.length) return;   // single-section, nothing to gate

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
      'You are previewing the opening of this manual. Sign in with a free account to read the ' +
      'remaining ' + remaining + ' section' + (remaining === 1 ? '' : 's') +
      ', plus download software tools and view expanded pricing.'));
    var cta = el('button', 'cta', 'Create a free account');
    cta.addEventListener('click', function () { triggerSignUp(location.href); });
    inner.appendChild(cta);
    inner.appendChild(el('div', 'sub', 'No account yet? Creating one is free and takes a moment.'));
    card.appendChild(inner);
    return card;
  }

  function lockToc(hiddenSecs) {
    var toc = document.querySelector('.man-toc') || document.querySelector('.toc'); if (!toc) return;
    var ids = {};
    hiddenSecs.forEach(function (s) { if (s.id) ids['#' + s.id] = 1; });
    // also lock sub-anchors that live inside hidden sections
    [].slice.call(toc.querySelectorAll('a[href^="#"]')).forEach(function (a) {
      var href = a.getAttribute('href');
      var target = null; try { target = document.querySelector(href.replace(/"/g, '\\"')); } catch (e) {}
      var inHidden = ids[href] || (target && target.closest && target.closest('section') &&
        hiddenSecs.indexOf(target.closest('section')) !== -1);
      if (inHidden) {
        a.classList.add('bnc-locked');
        if (!a.querySelector('svg')) a.insertAdjacentHTML('afterbegin', LOCK_SVG);
        if (!a.__bncBound) {
          a.__bncBound = true;
          a.addEventListener('click', function (e) {
            if (!isSignedIn()) { e.preventDefault(); triggerSignUp(location.href); }
          });
        }
      }
    });
  }
  function unlockToc() {
    [].slice.call(document.querySelectorAll('.man-toc a.bnc-locked, .toc a.bnc-locked')).forEach(function (a) {
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
            triggerSignUp(a.href);
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
    if (!isSignedIn() || !sbPublic) {
      var g = el('div', 'bnc-pricing-gate');
      g.appendChild(el('h3', null, 'Expanded pricing is for registered users'));
      g.appendChild(el('p', null, 'Sign in with a free account to view the full price list.'));
      var cta = el('button', 'cta', 'Sign in to view');
      cta.addEventListener('click', function () { triggerSignUp(location.href); });
      g.appendChild(cta);
      host.appendChild(g);
      return;
    }
    host.appendChild(el('p', 'bnc-loading', 'Loading the full price list...'));
    sbPublic.from('bnc_pricing').select('model,description,price_usd,category,is_option,sort')
      .eq('tier', 'expanded').order('sort', { ascending: true })
      .then(function (res) {
        host.innerHTML = '';
        if (res && res.error) {
          host.appendChild(el('p', null, 'Pricing is temporarily unavailable. Please try again shortly.'));
          if (window.console) console.warn('[bnc-auth] pricing read error:', res.error.message);
          return;
        }
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
              : (r.model === '870A-50' ? 'Call for Quote' : '')));
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

  /* ---------- prefill contact forms from the signed-in profile ------------ */
  // Log in once, never retype: fill name/email/phone/company on every form
  // (contact, quote, RMA, configurator) from the Clerk profile when signed in.
  // Only fills empty fields, so anything the visitor typed is left alone.
  function prefillForms() {
    if (!isSignedIn()) return;
    var u = Clerk.user;
    var name = u.fullName || u.firstName || '';
    var email = (u.primaryEmailAddress && u.primaryEmailAddress.emailAddress) || '';
    var phone = (u.primaryPhoneNumber && u.primaryPhoneNumber.phoneNumber) || '';
    var company = (u.publicMetadata && (u.publicMetadata.company || u.publicMetadata.organization)) || '';
    var map = { name: name, Name: name, email: email, Email: email, _replyto: email,
                phone: phone, Phone: phone, company: company, organization: company, Organization: company };
    [].slice.call(document.querySelectorAll('form')).forEach(function (f) {
      Object.keys(map).forEach(function (k) {
        if (!map[k]) return;
        var el = f.querySelector('[name="' + k + '"]');
        if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && !el.value) {
          el.value = map[k];
          try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
        }
      });
    });
    // The PDF configurator's email box is built outside a <form> (class only),
    // so fill it directly when signed in.
    if (email) {
      var pe = document.querySelector('.pdfcfg-email');
      if (pe) {
        if (!pe.value) {
          pe.value = email;
          try { pe.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
        }
        // Signed in: hide the email box + note entirely; the value stays set so
        // the Build button still submits to their account email.
        pe.style.display = 'none';
        var pnote = document.querySelector('.pdfcfg-note');
        if (pnote) pnote.style.display = 'none';
      }
    }
  }

  /* ---------- apply everything for the current auth state ----------------- */
  function applyState() {
    renderHeader();
    applyManualGate();
    applyDownloadGate();
    applyPricingGate();
    prefillForms();
    applyWebmasterGate();
    applyFormReturn();
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
      // Plain anon client (no Clerk token) for reads governed purely by RLS
      // policy, e.g. expanded pricing. When signed in, the main client above
      // sends the Clerk JWT, which Supabase rejects unless a Clerk third-party-
      // auth bridge is configured — so we read pricing with the anon key instead.
      sbPublic = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey);
      // resume an action the user was blocked on before signing in
      if (isSignedIn()) {
        var resume = null;
        try { resume = sessionStorage.getItem('bncResume'); } catch (e) {}
        // Only re-open if it was a DIFFERENT destination (e.g. a download link);
        // for the current page we just stay put — the reload below unlocks it.
        if (resume && resume !== location.href) {
          try { sessionStorage.removeItem('bncResume'); } catch (e) {}
          window.open(resume, '_blank', 'noopener');
        } else { try { sessionStorage.removeItem('bncResume'); } catch (e) {} }
      }
      applyState();
      recordVisit();
      maybeShowContactModal();
      // react to sign-in / sign-out without a full reload
      // Reload once when the signed-in state actually flips, so gated content
      // unlocks (or re-locks) immediately without a manual refresh. Guarded on
      // the state change so it can't loop.
      var __bncSignedIn = isSignedIn();
      Clerk.addListener(function () {
        var now = isSignedIn();
        if (now !== __bncSignedIn) { __bncSignedIn = now; location.reload(); return; }
        applyState();
        if (isSignedIn()) { recordVisit(); maybeShowContactModal(); }
      });
    }).catch(function (err) {
      // network / config error: stay in the safe logged-out state
      if (window.console) console.warn('[bnc-auth]', err && err.message);
    });
  });
})();


/* ===========================================================================
   CTA auth gate. When a logged-OUT visitor clicks a quote/contact CTA (the
   header "Get a Quote/Demo" button, or any link to get-quote.html / contact.html
   such as "Talk to an Engineer"), open the Clerk sign-up/sign-in modal FIRST,
   then redirect to the original destination after auth (where the existing
   prefill fills the form). Signed-in visitors navigate normally.
   =========================================================================== */
(function () {
  'use strict';
  function ctaLink(t) {
    var a = t && t.closest ? t.closest('a') : null;
    if (!a) return null;
    if (a.classList && a.classList.contains('sitenav-cta')) return a;
    var href = a.getAttribute('href') || '';
    if (/(?:^|\/)(?:contact|get-quote)\.html(?:[#?]|$)/i.test(href)) return a;
    return null;
  }
  function signedIn() { try { return !!(window.Clerk && window.Clerk.user); } catch (e) { return false; } }
  document.addEventListener('click', function (e) {
    var a = ctaLink(e.target);
    if (!a) return;
    if (signedIn()) return;                                   // already signed in -> let it navigate
    if (!(window.Clerk && window.Clerk.openSignUp)) return;   // Clerk not ready -> let it through
    e.preventDefault();
    e.stopPropagation();
    var dest = a.href;                                        // absolute URL
    window.Clerk.openSignUp({
      afterSignInUrl: dest, afterSignUpUrl: dest,
      signInForceRedirectUrl: dest, signUpForceRedirectUrl: dest, fallbackRedirectUrl: dest
    });
  }, true);
})();
