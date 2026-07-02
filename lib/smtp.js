// Zero-dep SMTP sender for Vercel Node functions. Mirrors the Daily Brief's send_smtp.py
// (Bluehost). Implicit TLS on 465 (default) or STARTTLS on 587. No npm deps.
// Env: SMTP_HOST, SMTP_PORT (465), SMTP_USER, SMTP_PASS, SMTP_FROM (optional display From).
const net = require("net");
const tls = require("tls");

function smtpConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

// Reads complete SMTP replies (final line looks like "250 text", not "250-text").
function makeReader(sock) {
  let buf = "";
  let want = null;
  const flush = () => {
    if (!want) return;
    const lines = buf.split(/\r?\n/);
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i] === "") continue;
      if (/^\d{3} /.test(lines[i])) {
        const code = parseInt(lines[i].slice(0, 3), 10);
        const w = want; want = null; const all = buf; buf = "";
        w({ code, text: all });
      }
      break;
    }
  };
  sock.on("data", (d) => { buf += d.toString("utf8"); flush(); });
  return () => new Promise((res) => { want = res; flush(); });
}

function esc(h) { return String(h == null ? "" : h).replace(/[\r\n]+/g, " ").trim(); }

async function sendMail({ to, subject, html, text, replyTo, from }) {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "465", 10);
  const user = process.env.SMTP_USER, pass = process.env.SMTP_PASS;
  from = from || process.env.SMTP_FROM || user;
  const rcpts = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (!host || !user || !pass || !rcpts.length) throw new Error("smtp not configured");

  const boundary = "b_" + Date.now().toString(36) + "_" + Math.round(Math.random() * 1e9).toString(36);
  const bodyText = text || "This message is best viewed in an HTML-capable client.";
  const headers = [
    "From: " + esc(from),
    "To: " + rcpts.map(esc).join(", "),
    "Subject: " + esc(subject),
    replyTo ? "Reply-To: " + esc(replyTo) : null,
    "MIME-Version: 1.0",
    'Content-Type: multipart/alternative; boundary="' + boundary + '"',
  ].filter(Boolean).join("\r\n");
  const message =
    headers + "\r\n\r\n" +
    "--" + boundary + "\r\n" + 'Content-Type: text/plain; charset="utf-8"\r\n\r\n' + bodyText + "\r\n" +
    "--" + boundary + "\r\n" + 'Content-Type: text/html; charset="utf-8"\r\n\r\n' + (html || bodyText) + "\r\n" +
    "--" + boundary + "--\r\n";
  const data = message.replace(/\r?\n/g, "\r\n").replace(/\r\n\./g, "\r\n..");

  return new Promise((resolve, reject) => {
    let done = false;
    const fail = (e) => { if (!done) { done = true; try { sock.destroy(); } catch (_) {} reject(e instanceof Error ? e : new Error(String(e))); } };
    let sock = port === 465
      ? tls.connect({ host, port, servername: host, rejectUnauthorized: false }, () => {})
      : net.connect({ host, port }, () => {});
    sock.setTimeout(30000, () => fail(new Error("smtp timeout")));
    sock.on("error", fail);

    (async () => {
      try {
        let read = makeReader(sock);
        const say = async (cmd, ok) => {
          sock.write(cmd + "\r\n");
          const r = await read();
          if (ok && !ok.includes(Math.floor(r.code / 100))) throw new Error("smtp " + r.code + ": " + r.text.trim().slice(0, 200));
          return r;
        };
        await read();                                   // 220 greeting
        await say("EHLO berkeleynucleonics.com", [2]);
        if (port !== 465) {                             // STARTTLS upgrade
          await say("STARTTLS", [2]);
          sock = tls.connect({ socket: sock, servername: host, rejectUnauthorized: false });
          await new Promise((res, rej) => { sock.once("secureConnect", res); sock.once("error", rej); });
          sock.setTimeout(30000, () => fail(new Error("smtp timeout")));
          read = makeReader(sock);
          await say("EHLO berkeleynucleonics.com", [2]);
        }
        await say("AUTH LOGIN", [3]);
        await say(Buffer.from(user).toString("base64"), [3]);
        await say(Buffer.from(pass).toString("base64"), [2]);
        await say("MAIL FROM:<" + (process.env.SMTP_USER) + ">", [2]);
        for (const r of rcpts) await say("RCPT TO:<" + r + ">", [2]);
        await say("DATA", [3]);
        await say(data + "\r\n.", [2]);
        try { await say("QUIT"); } catch (_) {}
        if (!done) { done = true; resolve({ sent_to: rcpts }); }
        try { sock.destroy(); } catch (_) {}
      } catch (e) { fail(e); }
    })();
  });
}

module.exports = { smtpConfigured, sendMail };
