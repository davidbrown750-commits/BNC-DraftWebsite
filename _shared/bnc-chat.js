/* ===========================================================================
   BNC Assistant — custom AI chat widget (replaces the Nutshell bot).
   Grounded in the real BNC datasheets via /api/chat (RAG + Claude). Self-
   contained: injects its own styles + launcher. Brand: navy #003D6B, sky
   #0078B6, dark #113163, Arial/Myriad, 4px radius, no emoji.
   =========================================================================== */
(function () {
  'use strict';
  if (window.__bncChatBooted) return;
  window.__bncChatBooted = true;

  var NAVY = '#003D6B', SKY = '#0078B6', DARK = '#113163';
  var SID = (function () {
    try {
      var s = sessionStorage.getItem('bncChatSid');
      if (!s) { s = 'c' + Date.now() + Math.floor(Math.random() * 1e6); sessionStorage.setItem('bncChatSid', s); }
      return s;
    } catch (e) { return 'c' + Date.now(); }
  })();
  var messages = []; // {role, content}
  var streaming = false;

  function el(tag, css, html) { var e = document.createElement(tag); if (css) e.style.cssText = css; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function render(text) {
    var h = esc(text);
    h = h.replace(/\bhttps?:\/\/[^\s)]+/g, function (u) { return '<a href="' + u + '" target="_blank" rel="noopener" style="color:' + SKY + ';">' + u.replace(/^https?:\/\/(www\.)?/, '') + '</a>'; });
    h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    h = h.replace(/\n/g, '<br>');
    return h;
  }

  var LOGO = '<svg width="26" height="26" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="30" fill="none" stroke="#fff" stroke-width="3"/><path d="M14 38 L26 38 L26 24 L38 24 L38 38 L50 38" fill="none" stroke="#fff" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/></svg>';
  var SENDICON = '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.5 21 3 13 21 11 13 3 11.5Z" fill="#fff"/></svg>';

  function injectCSS() {
    if (document.getElementById('bnc-chat-css')) return;
    var s = el('style'); s.id = 'bnc-chat-css';
    s.textContent =
      '#bncChatLauncher{position:fixed;right:22px;bottom:22px;z-index:9000;display:flex;align-items:center;gap:9px;' +
      'background:' + NAVY + ';color:#fff;border:none;border-radius:24px;padding:11px 18px 11px 14px;cursor:pointer;' +
      'font:600 15px Arial,"Myriad Pro",sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.28);transition:background .15s,transform .15s;}' +
      '#bncChatLauncher:hover{background:' + DARK + ';transform:translateY(-1px);}' +
      '#bncChatPanel{position:fixed;right:22px;bottom:22px;z-index:9001;width:382px;max-width:calc(100vw - 28px);height:560px;' +
      'max-height:calc(100vh - 40px);background:#fff;border-radius:8px;box-shadow:0 18px 50px rgba(0,0,0,.32);display:none;' +
      'flex-direction:column;overflow:hidden;font-family:Arial,"Myriad Pro",sans-serif;}' +
      '#bncChatHead{background:' + NAVY + ';color:#fff;padding:13px 14px;display:flex;align-items:center;gap:10px;}' +
      '#bncChatHead .t{font-weight:700;font-size:15px;line-height:1.1;}#bncChatHead .s{font-size:11.5px;opacity:.8;}' +
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
      '#bncChatFoot .legal{display:none;}' +
      '@media(max-width:480px){#bncChatPanel{right:8px;bottom:8px;height:calc(100vh - 16px);}}';
    document.head.appendChild(s);
  }

  var panel, body, sendBtn, input, chips;

  function addMsg(role, text) {
    var m = el('div', null); m.className = 'bncMsg ' + (role === 'user' ? 'u' : 'a');
    var b = el('div', null, role === 'user' ? esc(text) : render(text)); b.className = 'b';
    m.appendChild(b); body.appendChild(m); body.scrollTop = body.scrollHeight;
    return b;
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
    input.value = ''; input.style.height = 'auto';
    typing();
    var bubble = null, acc = '';
    try {
      var r = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: messages, sessionId: SID }),
      });
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
      addMsg('assistant', 'Sorry, the assistant is unavailable right now. Please use Get a Quote/Demo and a BNC engineer will help.');
    }
    streaming = false; sendBtn.disabled = false; input.focus();
  }

  function buildPanel() {
    panel = el('div', null); panel.id = 'bncChatPanel';
    var head = el('div', null); head.id = 'bncChatHead';
    head.innerHTML = LOGO + '<div><div class="t">BNC Assistant</div><div class="s">Answers from our datasheets</div></div>';
    var close = el('button', null, '&times;'); close.setAttribute('aria-label', 'Close chat');
    close.onclick = function () { panel.style.display = 'none'; launcher.style.display = 'flex'; };
    head.appendChild(close);
    var person = el('div', null); person.id = 'bncChatPerson';
    person.innerHTML = '<span>Prefer to talk to someone?</span>';
    var plink = el('a', null, 'Chat with a BNC engineer'); plink.setAttribute('role', 'button');
    plink.onclick = talkToPerson; person.appendChild(plink);
    body = el('div', null); body.id = 'bncChatBody';
    chips = el('div', null); chips.id = 'bncChatChips';
    ['Help me pick a pulse generator', 'RF signal generator specs', 'What is the ICX-FieldHawk?', 'Get a quote'].forEach(function (q) {
      var c = el('button', null, esc(q)); c.onclick = function () { send(q); }; chips.appendChild(c);
    });
    var foot = el('div', null); foot.id = 'bncChatFoot';
    input = el('textarea', null); input.id = 'bncChatInput'; input.rows = 1; input.placeholder = 'Ask about a product, spec, or application...';
    input.setAttribute('aria-label', 'Message');
    input.addEventListener('input', function () { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 96) + 'px'; });
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input.value); } });
    sendBtn = el('button', null, SENDICON); sendBtn.id = 'bncChatSend'; sendBtn.setAttribute('aria-label', 'Send');
    sendBtn.onclick = function () { send(input.value); };
    foot.appendChild(input); foot.appendChild(sendBtn);
    panel.appendChild(head); panel.appendChild(person); panel.appendChild(body); panel.appendChild(chips); panel.appendChild(foot);
    document.body.appendChild(panel);
    addMsg('assistant', 'Hi, I am the BNC assistant. Ask me about any Berkeley Nucleonics instrument: specs, model selection, applications, pricing, or support. I answer from our actual datasheets.');
  }

  function talkToPerson() {
    if (window.bncOpenLiveChat) {
      if (panel) panel.style.display = 'none';
      if (launcher) launcher.style.display = 'none';
      window.bncOpenLiveChat(); // boots + opens Nutshell live chat on demand
    } else {
      window.location.href = '/contact.html';
    }
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
    launcher.setAttribute('aria-label', 'Open BNC assistant');
    launcher.onclick = open;
    document.body.appendChild(launcher);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
