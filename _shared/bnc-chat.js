/* ===========================================================================
   BNC Assistant — custom AI chat widget (replaces the Nutshell bot).
   Grounded in the real BNC datasheets via /api/chat (RAG + Claude). The
   "Talk to a human" path is handled here (instant call/email + callback
   capture) and does NOT route through Nutshell's AI bot.
   Brand: navy #003D6B, sky #0078B6, dark #113163, Arial, 4px radius, no emoji.
   =========================================================================== */
(function () {
  'use strict';
  if (window.__bncChatBooted) return;
  window.__bncChatBooted = true;

  var NAVY = '#003D6B', SKY = '#0078B6', DARK = '#113163';
  var TEL = '+18002347858', TEL_DISP = '1-800-234-7858';
  var TEL2 = '+14154539955', TEL2_DISP = '+1 (415) 453-9955';
  var MAILTO = 'info@berkeleynucleonics.com';

  var SID = (function () {
    try {
      var s = sessionStorage.getItem('bncChatSid');
      if (!s) { s = 'c' + Date.now() + Math.floor(Math.random() * 1e6); sessionStorage.setItem('bncChatSid', s); }
      return s;
    } catch (e) { return 'c' + Date.now(); }
  })();
  var messages = [], streaming = false;

  function el(tag, css, html) { var e = document.createElement(tag); if (css) e.style.cssText = css; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function render(text) {
    var h = esc(text);
    h = h.replace(/\bhttps?:\/\/[^\s)]+/g, function (u) { return '<a href="' + u + '" target="_blank" rel="noopener" style="color:' + SKY + ';">' + u.replace(/^https?:\/\/(www\.)?/, '') + '</a>'; });
    h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    return h.replace(/\n/g, '<br>');
  }

  // Real Berkeley Nucleonics logo (white), sized via CSS .bncLogo.
  var LOGO = '<svg class="bncLogo" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 972.3 485.93" role="img" aria-label="Berkeley Nucleonics"><g fill="#ffffff"><path d="M326.86,400.29c-88.04,0-159.67-71.63-159.67-159.67s71.63-159.67,159.67-159.67,159.67,71.63,159.67,159.67-71.63,159.67-159.67,159.67ZM326.86,99.21c-77.97,0-141.4,63.43-141.4,141.41s63.43,141.4,141.4,141.4,141.4-63.43,141.4-141.4-63.43-141.41-141.4-141.41Z"/><polygon points="882.15 284.93 383 284.93 383 204.02 268.17 204.02 268.17 284.93 90.53 284.93 90.53 274.49 257.73 274.49 257.73 193.58 393.44 193.58 393.44 274.49 882.15 274.49 882.15 284.93"/></g><g fill="#ffffff" fill-rule="evenodd"><path d="M540.98,231.52l6.4-30.06h18.94c11.43,0,18.83,2.03,16.06,15.03-2.77,13-11.02,15.03-22.46,15.03h-18.95ZM551.37,182.66l5.66-26.62h18.94c10.18,0,14.92,4.23,12.99,13.31-1.93,9.08-8.47,13.31-18.64,13.31h-18.95ZM555.47,250.31c17.11,1.25,47.03-6.89,51.79-29.29,3.53-16.6-5.02-26.46-18.64-29.44l.07-.31c12.07-3.76,22.52-12.37,25.15-24.74,4.69-22.08-14.18-30.53-34.64-29.28h-42.43l-24.03,113.06h42.75Z"/><polygon points="720.52 250.31 744.56 137.25 721.85 137.25 703.01 225.88 702.63 226.19 678.48 137.25 642.46 137.25 618.43 250.31 641.13 250.31 661.04 156.67 661.42 156.35 686.07 250.31 720.52 250.31"/><path d="M847.93,173.89c4.93-28.34-13.17-38.99-39.16-38.99-32.73,0-52.94,25.84-59.96,58.87-7.02,33.04,2.2,58.88,34.93,58.88,25.99,0,48.61-10.65,55.74-38.99h-25.84c-2.37,11.9-11.61,21.45-26.17,21.45-17.23,0-16.18-25.52-12.82-41.34,3.36-15.81,13.18-41.34,30.4-41.34,14.56,0,19.73,9.55,17.05,21.45h25.84Z"/></g></svg>';
  var SENDICON = '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.5 21 3 13 21 11 13 3 11.5Z" fill="#fff"/></svg>';

  function injectCSS() {
    if (document.getElementById('bnc-chat-css')) return;
    var s = el('style'); s.id = 'bnc-chat-css';
    s.textContent =
      '.bncLogo{height:22px;width:auto;display:block;flex:none;}' +
      '#bncChatLauncher{position:fixed;right:22px;bottom:22px;z-index:9000;display:flex;align-items:center;gap:10px;' +
      'background:' + NAVY + ';color:#fff;border:none;border-radius:24px;padding:11px 18px 11px 15px;cursor:pointer;' +
      'font:600 15px Arial,"Myriad Pro",sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.28);transition:background .15s,transform .15s;}' +
      '#bncChatLauncher:hover{background:' + DARK + ';transform:translateY(-1px);}' +
      '#bncChatLauncher .bncLogo{height:20px;}' +
      '#bncChatPanel{position:fixed;right:22px;bottom:22px;z-index:9001;width:382px;max-width:calc(100vw - 28px);height:560px;' +
      'max-height:calc(100vh - 40px);background:#fff;border-radius:8px;box-shadow:0 18px 50px rgba(0,0,0,.32);display:none;' +
      'flex-direction:column;overflow:hidden;font-family:Arial,"Myriad Pro",sans-serif;}' +
      '#bncChatHead{background:' + NAVY + ';color:#fff;padding:13px 14px;display:flex;align-items:center;gap:11px;}' +
      '#bncChatHead .t{font-weight:700;font-size:14.5px;line-height:1.15;}#bncChatHead .s{font-size:11.5px;opacity:.82;}' +
      '#bncChatHead .htext{line-height:1.15;}' +
      '#bncChatHead button{margin-left:auto;background:transparent;border:none;color:#fff;font-size:20px;cursor:pointer;opacity:.85;line-height:1;}' +
      '#bncChatPerson{display:flex;align-items:center;gap:6px;padding:7px 14px;background:#eef3f8;border-bottom:1px solid #e3e8ee;font-size:12px;color:#42566b;}' +
      '#bncChatPerson a{color:' + NAVY + ';font-weight:700;cursor:pointer;text-decoration:none;margin-left:auto;}' +
      '#bncChatPerson a:hover{text-decoration:underline;}' +
      '#bncChatBody{flex:1;overflow-y:auto;padding:14px;background:#f4f6f9;}' +
      '.bncMsg{margin:0 0 12px;display:flex;}' +
      '.bncMsg .b{max-width:84%;padding:10px 12px;border-radius:8px;font-size:13.5px;line-height:1.5;color:#1d2733;}' +
      '.bncMsg.u{justify-content:flex-end;}.bncMsg.u .b{background:' + SKY + ';color:#fff;border-bottom-right-radius:2px;}' +
      '.bncMsg.a .b{background:#fff;border:1px solid #dfe4ea;border-bottom-left-radius:2px;}' +
      '.bncSrc{margin-top:7px;font-size:11.5px;color:#5b6b7c;}' +
      '.bncSrc a{display:inline-block;margin:2px 6px 0 0;color:' + NAVY + ';text-decoration:none;border:1px solid #d6dde5;border-radius:3px;padding:2px 7px;}' +
      '#bncChatChips{padding:0 14px 8px;background:#f4f6f9;display:flex;flex-wrap:wrap;gap:6px;}' +
      '#bncChatChips button{font:500 12px Arial,sans-serif;color:' + NAVY + ';background:#fff;border:1px solid #cfd8e2;border-radius:14px;padding:5px 11px;cursor:pointer;}' +
      '#bncChatChips button:hover{background:#eaf1f8;}' +
      '#bncChatFoot{border-top:1px solid #e3e8ee;background:#fff;padding:9px;display:flex;gap:8px;align-items:flex-end;}' +
      '#bncChatInput{flex:1;border:1px solid #cfd8e2;border-radius:6px;padding:9px 11px;font:14px Arial,sans-serif;resize:none;max-height:96px;outline:none;}' +
      '#bncChatInput:focus{border-color:' + SKY + ';}' +
      '#bncChatSend{background:' + NAVY + ';border:none;border-radius:6px;width:40px;height:40px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex:none;}' +
      '#bncChatSend:disabled{opacity:.5;cursor:default;}' +
      '.bncDot{display:inline-block;width:6px;height:6px;border-radius:50%;background:#9aa7b4;margin-right:3px;animation:bncpulse 1s infinite;}' +
      '.bncDot:nth-child(2){animation-delay:.15s;}.bncDot:nth-child(3){animation-delay:.3s;}' +
      '@keyframes bncpulse{0%,100%{opacity:.3;}50%{opacity:1;}}' +
      /* human handoff form */
      '.bncHuman{padding:14px;overflow-y:auto;flex:1;background:#fff;font-size:13.5px;color:#1d2733;}' +
      '.bncHuman h4{margin:0 0 4px;font-size:15px;color:' + NAVY + ';}' +
      '.bncHuman p{margin:0 0 12px;color:#5b6b7c;font-size:12.5px;}' +
      '.bncHuman .now{display:flex;gap:8px;margin-bottom:14px;}' +
      '.bncHuman .now a{flex:1;text-align:center;padding:9px;border-radius:6px;text-decoration:none;font-weight:700;font-size:13px;}' +
      '.bncHuman .call{background:' + NAVY + ';color:#fff;}.bncHuman .mail{background:#eef3f8;color:' + NAVY + ';border:1px solid #cfd8e2;}' +
      '.bncHuman label{display:block;font-size:11.5px;font-weight:700;color:#42566b;margin:9px 0 3px;}' +
      '.bncHuman input,.bncHuman textarea{width:100%;border:1px solid #cfd8e2;border-radius:6px;padding:8px 10px;font:13.5px Arial,sans-serif;outline:none;box-sizing:border-box;}' +
      '.bncHuman input:focus,.bncHuman textarea:focus{border-color:' + SKY + ';}' +
      '.bncHuman .submit{width:100%;margin-top:12px;background:' + NAVY + ';color:#fff;border:none;border-radius:6px;padding:11px;font:700 14px Arial,sans-serif;cursor:pointer;}' +
      '.bncHuman .submit:disabled{opacity:.5;}' +
      '.bncHuman .back{display:inline-block;margin-top:10px;color:' + SKY + ';font-size:12px;cursor:pointer;}' +
      '@media(max-width:480px){#bncChatPanel{right:8px;bottom:8px;height:calc(100vh - 16px);}}';
    document.head.appendChild(s);
  }

  var panel, body, sendBtn, input, chips, person, foot;

  function addMsg(role, text) {
    var m = el('div', null); m.className = 'bncMsg ' + (role === 'user' ? 'u' : 'a');
    var b = el('div', null, role === 'user' ? esc(text) : render(text)); b.className = 'b';
    m.appendChild(b); body.appendChild(m); body.scrollTop = body.scrollHeight; return b;
  }
  function typing() {
    var m = el('div', null); m.className = 'bncMsg a'; m.id = 'bncTyping';
    m.innerHTML = '<div class="b"><span class="bncDot"></span><span class="bncDot"></span><span class="bncDot"></span></div>';
    body.appendChild(m); body.scrollTop = body.scrollHeight;
  }

  async function send(text) {
    if (streaming || !text.trim()) return;
    if (chips) chips.style.display = 'none';
    streaming = true; sendBtn.disabled = true;
    addMsg('user', text); messages.push({ role: 'user', content: text });
    input.value = ''; input.style.height = 'auto'; typing();
    var bubble = null, acc = '';
    try {
      var r = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: messages, sessionId: SID }) });
      var t = document.getElementById('bncTyping'); if (t) t.remove();
      var reader = r.body.getReader(), dec = new TextDecoder(), buf = '';
      while (true) {
        var rd = await reader.read(); if (rd.done) break;
        buf += dec.decode(rd.value, { stream: true });
        var i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          var line = buf.slice(0, i).trim(); buf = buf.slice(i + 2);
          if (!line.startsWith('data:')) continue;
          var ev; try { ev = JSON.parse(line.slice(5).trim()); } catch (e) { continue; }
          if (ev.delta) { acc += ev.delta; if (!bubble) bubble = addMsg('assistant', ''); bubble.innerHTML = render(acc); body.scrollTop = body.scrollHeight; }
          if (ev.done) {
            if (!bubble && !acc) bubble = addMsg('assistant', 'Sorry, I did not catch that. Could you rephrase?');
            if (ev.sources && ev.sources.length && bubble) {
              var sd = el('div', null); sd.className = 'bncSrc'; sd.innerHTML = 'Sources: ' +
                ev.sources.map(function (s) { return '<a href="' + s.url + '" target="_blank" rel="noopener">' + esc((s.title || 'datasheet').slice(0, 46)) + '</a>'; }).join('');
              bubble.parentNode.appendChild(sd); body.scrollTop = body.scrollHeight;
            }
          }
        }
      }
      messages.push({ role: 'assistant', content: acc });
    } catch (e) {
      var tt = document.getElementById('bncTyping'); if (tt) tt.remove();
      addMsg('assistant', 'Sorry, the assistant is unavailable right now. You can reach a BNC engineer at ' + TEL_DISP + '.');
    }
    streaming = false; sendBtn.disabled = false; input.focus();
  }

  // ---- talk to a human (no Nutshell) ----
  function talkToPerson() {
    if (document.getElementById('bncHumanView')) return;
    var lastQ = '';
    for (var i = messages.length - 1; i >= 0; i--) { if (messages[i].role === 'user') { lastQ = messages[i].content; break; } }
    body.style.display = 'none'; if (chips) chips.style.display = 'none'; foot.style.display = 'none'; person.style.display = 'none';
    var v = el('div', null); v.id = 'bncHumanView'; v.className = 'bncHuman';
    v.innerHTML =
      '<h4>Talk to a BNC engineer</h4>' +
      '<p>Reach us right now, or leave your details and we will get back to you quickly.</p>' +
      '<div class="now"><a class="call" href="tel:' + TEL + '">Call ' + TEL_DISP + '</a>' +
      '<a class="mail" href="mailto:' + MAILTO + '?subject=Website%20inquiry">Email us</a></div>' +
      '<label>Name</label><input id="bncHName" autocomplete="name">' +
      '<label>Email</label><input id="bncHEmail" type="email" autocomplete="email">' +
      '<label>Phone (optional)</label><input id="bncHPhone" type="tel" autocomplete="tel">' +
      '<label>How can we help?</label><textarea id="bncHMsg" rows="3"></textarea>' +
      '<button class="submit" id="bncHSubmit">Request a callback</button>' +
      '<span class="back" id="bncHBack">Back to the assistant</span>';
    panel.insertBefore(v, foot);
    document.getElementById('bncHMsg').value = lastQ || '';
    document.getElementById('bncHBack').onclick = closeHuman;
    document.getElementById('bncHSubmit').onclick = submitHuman;
  }
  function closeHuman() {
    var v = document.getElementById('bncHumanView'); if (v) v.remove();
    body.style.display = ''; foot.style.display = ''; person.style.display = '';
  }
  async function submitHuman() {
    var name = document.getElementById('bncHName').value.trim();
    var email = document.getElementById('bncHEmail').value.trim();
    var phone = document.getElementById('bncHPhone').value.trim();
    var msg = document.getElementById('bncHMsg').value.trim();
    if (!email && !phone) { alert('Please add an email or phone so we can reach you.'); return; }
    var btn = document.getElementById('bncHSubmit'); btn.disabled = true; btn.textContent = 'Sending...';
    try {
      await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'human', sessionId: SID, name: name, email: email, phone: phone, message: msg, transcript: messages.slice(-20) }) });
    } catch (e) { }
    var v = document.getElementById('bncHumanView');
    v.innerHTML = '<h4>Thank you' + (name ? ', ' + esc(name) : '') + '.</h4>' +
      '<p>A BNC engineer will reach out shortly. Need an answer now? Call ' +
      '<a href="tel:' + TEL + '" style="color:' + SKY + ';font-weight:700;">' + TEL_DISP + '</a>.</p>' +
      '<span class="back" id="bncHBack2">Back to the assistant</span>';
    document.getElementById('bncHBack2').onclick = closeHuman;
  }

  function buildPanel() {
    panel = el('div', null); panel.id = 'bncChatPanel';
    var head = el('div', null); head.id = 'bncChatHead';
    head.innerHTML = LOGO + '<div class="htext"><div class="t">BNC Assistant</div><div class="s">Answers from our datasheets</div></div>';
    var close = el('button', null, '&times;'); close.setAttribute('aria-label', 'Close chat');
    close.onclick = function () { panel.style.display = 'none'; launcher.style.display = 'flex'; };
    head.appendChild(close);
    person = el('div', null); person.id = 'bncChatPerson';
    person.innerHTML = '<span>Prefer to talk to someone?</span>';
    var plink = el('a', null, 'Talk to a human'); plink.setAttribute('role', 'button'); plink.onclick = talkToPerson; person.appendChild(plink);
    body = el('div', null); body.id = 'bncChatBody';
    chips = el('div', null); chips.id = 'bncChatChips';
    ['Help me pick a pulse generator', 'RF signal generator specs', 'What is the ICX-FieldHawk?', 'Talk to a human'].forEach(function (q) {
      var c = el('button', null, esc(q)); c.onclick = function () { if (q === 'Talk to a human') talkToPerson(); else send(q); }; chips.appendChild(c);
    });
    foot = el('div', null); foot.id = 'bncChatFoot';
    input = el('textarea', null); input.id = 'bncChatInput'; input.rows = 1; input.placeholder = 'Ask about a product, spec, or application...';
    input.setAttribute('aria-label', 'Message');
    input.addEventListener('input', function () { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 96) + 'px'; });
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input.value); } });
    sendBtn = el('button', null, SENDICON); sendBtn.id = 'bncChatSend'; sendBtn.setAttribute('aria-label', 'Send');
    sendBtn.onclick = function () { send(input.value); };
    foot.appendChild(input); foot.appendChild(sendBtn);
    panel.appendChild(head); panel.appendChild(person); panel.appendChild(body); panel.appendChild(chips); panel.appendChild(foot);
    document.body.appendChild(panel);
    addMsg('assistant', 'Hi, I am the BNC assistant. Ask me about any Berkeley Nucleonics instrument: specs, model selection, applications, pricing, or support. I answer from our actual datasheets. Prefer a person? Use "Talk to a human" above.');
  }

  var launcher;
  function open() {
    if (!panel) buildPanel();
    panel.style.display = 'flex'; launcher.style.display = 'none';
    setTimeout(function () { input && input.focus(); }, 60);
  }
  function boot() {
    injectCSS();
    launcher = el('button', null, LOGO + '<span>Ask BNC</span>'); launcher.id = 'bncChatLauncher';
    launcher.setAttribute('aria-label', 'Open BNC assistant'); launcher.onclick = open;
    document.body.appendChild(launcher);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
