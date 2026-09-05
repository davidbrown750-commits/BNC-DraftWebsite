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

// RFC 2047 encoded-word for a header value that is not pure ASCII (the ack subjects carry a
// middle dot). Base64 "B" words of at most 75 characters, folded with a leading space.
function hdr(v) {
  v = esc(v);
  if (!/[^\x20-\x7e]/.test(v)) return v;
  const words = [];
  let chunk = "";
  for (const ch of v) {
    if (Buffer.byteLength(chunk + ch, "utf8") > 42) { words.push(chunk); chunk = ""; }
    chunk += ch;
  }
  if (chunk) words.push(chunk);
  return words.map((w) => "=?utf-8?B?" + Buffer.from(w, "utf8").toString("base64") + "?=").join("\r\n ");
}

// Quoted-printable (RFC 2045 s6.7). Both MIME parts used to go out as one raw line of any
// length with no Content-Transfer-Encoding. SMTP caps a line at 998 bytes, so the relay folded
// the multi-kilobyte HTML wherever the cap fell, and the fold rendered as a stray space in the
// middle of a word ("Corporatio n", "berkeleynucle onics.com"). This keeps every line under 76
// characters with soft breaks the client removes, and makes non-ASCII (the middle dot in the
// signature, accented names) safe on a 7-bit path.
function qp(str) {
  const bytes = Buffer.from(String(str == null ? "" : str), "utf8");
  const lines = [];
  let line = "";
  const flush = (hard) => {
    // A space or tab may not end a hard-broken line; encode it so it survives transport.
    // (Before a soft break the "=" is the last character, so the space is not trailing.)
    if (hard && /[ \t]$/.test(line)) line = line.slice(0, -1) + (line.slice(-1) === " " ? "=20" : "=09");
    lines.push(hard ? line : line + "=");
    line = "";
  };
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b === 13 && bytes[i + 1] === 10) { flush(true); i++; continue; }
    if (b === 10 || b === 13) { flush(true); continue; }
    const tok = ((b >= 33 && b <= 126 && b !== 61) || b === 32 || b === 9)
      ? String.fromCharCode(b)
      : "=" + (b < 16 ? "0" : "") + b.toString(16).toUpperCase();
    // 73 leaves room for the soft-break "=" and for a trailing space growing to "=20".
    if (line.length + tok.length > 73) flush(false);
    line += tok;
  }
  lines.push(line);  // the remainder, or "" so a trailing newline in the input is kept
  return lines.join("\r\n");
}

// bcc: extra envelope recipients (string or array). They get the message via RCPT TO but
// never appear in a header, so the visible To line stays exactly what the reader expects.
// Used to file customer-facing mail into Nutshell's email drop-box.
async function sendMail({ to, subject, html, text, replyTo, from, bcc }) {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "465", 10);
  const user = process.env.SMTP_USER, pass = process.env.SMTP_PASS;
  from = from || process.env.SMTP_FROM || user;
  const rcpts = (Array.isArray(to) ? to : [to]).filter(Boolean);
  const seen = rcpts.map((r) => String(r).toLowerCase());
  const bccs = (Array.isArray(bcc) ? bcc : bcc ? [bcc] : [])
    .filter(Boolean)
    .filter((b) => seen.indexOf(String(b).toLowerCase()) === -1);
  if (!host || !user || !pass || !rcpts.length) throw new Error("smtp not configured");

  const boundary = "b_" + Date.now().toString(36) + "_" + Math.round(Math.random() * 1e9).toString(36);
  const bodyText = text || "This message is best viewed in an HTML-capable client.";
  const headers = [
    "From: " + esc(from),
    "To: " + rcpts.map(esc).join(", "),
    "Subject: " + hdr(subject),
    replyTo ? "Reply-To: " + esc(replyTo) : null,
    "MIME-Version: 1.0",
    // These are internal/transactional notices — turn OFF SendGrid's account-level
    // subscription tracking so no "unsubscribe" footer is appended to team emails.
    'X-SMTPAPI: {"filters":{"subscriptiontracking":{"settings":{"enable":0}}}}',
    'Content-Type: multipart/alternative; boundary="' + boundary + '"',
  ].filter(Boolean).join("\r\n");
  const message =
    headers + "\r\n\r\n" +
    "--" + boundary + "\r\n" + 'Content-Type: text/plain; charset="utf-8"\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n' + qp(bodyText) + "\r\n" +
    "--" + boundary + "\r\n" + 'Content-Type: text/html; charset="utf-8"\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n' + qp(html || bodyText) + "\r\n" +
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
        for (const r of rcpts.concat(bccs)) await say("RCPT TO:<" + esc(r) + ">", [2]);
        await say("DATA", [3]);
        await say(data + "\r\n.", [2]);
        try { await say("QUIT"); } catch (_) {}
        if (!done) { done = true; resolve({ sent_to: rcpts, bcc: bccs }); }
        try { sock.destroy(); } catch (_) {}
      } catch (e) { fail(e); }
    })();
  });
}

module.exports = { smtpConfigured, sendMail, qp, hdr };
