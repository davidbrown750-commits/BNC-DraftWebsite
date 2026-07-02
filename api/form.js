// Self-hosted form handler — the single intake for EVERY website form (contact, quote,
// quote-index, rma, rma-status, scintiq, book/reading-map, pdf-config, ...). Replaces
// Formspree. Formspree-compatible fields (_gotcha honeypot, _subject, _next redirect,
// _replyto) so migrating a form is just: action="/api/form" + a hidden `form` type.
//
// On submit it (best-effort, never blocks the visitor):
//   1. honeypot + optional Cloudflare Turnstile spam check
//   2. optional Clerk token -> verified identity
//   3. Nutshell upsert-by-email (dedup) + a timeline note  (single deduped CRM path)
//   4. Supabase log to bnc_form_submissions (durable record / archive)
//   5. SendGrid SMTP notification to the right inbox
//
// Vercel env: NUTSHELL_API_USER/KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//   SMTP_HOST/PORT/USER/PASS/FROM, TURNSTILE_SECRET (optional),
//   FORM_NOTIFY_TO (default david.brown@), FORM_NOTIFY_<TYPE> per-type overrides.

const N = require("../lib/nutshell");
const { verifyClerkToken } = require("../lib/clerk");
const { smtpConfigured, sendMail } = require("../lib/smtp");

const TYPES = {
  contact:       "Contact Message",
  quote:         "Quote / Demo Request",
  "quote-index": "Quote Request (Product Index)",
  rma:           "RMA Request",
  "rma-status":  "RMA Status Check",
  scintiq:       "ScintIQ Configurator Request",
  book:          "Book / Reading-Map Request",
  "pdf-config":  "Datasheet Configurator Request",
  resource:      "Resource Request",
  quiz:          "Book Reader Quiz",
  newsletter:    "Newsletter Signup",
};
const DEFAULT_NOTIFY = "david.brown@berkeleynucleonics.com";
const RESERVED = { _gotcha: 1, _subject: 1, _next: 1, _redirect: 1, _replyto: 1, form: 1, token: 1, "cf-turnstile-response": 1, "g-recaptcha-response": 1 };

function parseMultipart(buf, ct) {
  const m = ct.match(/boundary=(?:"([^"]+)"|([^;]+))/);
  if (!m) return {};
  const boundary = "--" + (m[1] || m[2]);
  const out = {};
  for (const part of buf.toString("latin1").split(boundary)) {
    const i = part.indexOf("\r\n\r\n");
    if (i === -1) continue;
    const head = part.slice(0, i);
    if (/filename="/.test(head)) continue; // skip file uploads
    const nm = head.match(/name="([^"]+)"/);
    if (!nm) continue;
    out[nm[1]] = Buffer.from(part.slice(i + 4).replace(/\r\n$/, ""), "latin1").toString("utf8");
  }
  return out;
}

function parseBody(req) {
  let b = req.body;
  const ct = String(req.headers["content-type"] || "");
  if (b && typeof b === "object" && !Buffer.isBuffer(b)) return b;
  if (Buffer.isBuffer(b)) {
    if (ct.indexOf("multipart/form-data") !== -1) return parseMultipart(b, ct);
    b = b.toString("utf8");
  }
  if (typeof b === "string" && b.trim()) {
    const s = b.trim();
    if (s[0] === "{") { try { return JSON.parse(s); } catch (_) {} }
    try { return Object.fromEntries(new URLSearchParams(s)); } catch (_) {}
  }
  return {};
}

function notifyList(type) {
  const key = "FORM_NOTIFY_" + String(type || "").toUpperCase().replace(/[^A-Z]+/g, "_");
  const raw = process.env[key] || process.env.FORM_NOTIFY_TO || DEFAULT_NOTIFY;
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

async function turnstileOk(token, ip) {
  const secret = process.env.TURNSTILE_SECRET;
  if (!secret) return true; // not configured yet -> don't block
  if (!token) return false;
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token, remoteip: ip || "" }).toString(),
    });
    const j = await r.json();
    return !!(j && j.success);
  } catch (_) { return false; }
}

function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST") { res.status(405).end(); return; }

  const body = parseBody(req);
  const accept = String(req.headers.accept || "");
  const wantsJson = accept.indexOf("application/json") !== -1;
  const next = body._next || body._redirect || "";
  const respondOk = (extra) => {
    if (wantsJson) { res.status(200).json(Object.assign({ ok: true }, extra || {})); return; }
    if (next) { res.writeHead(303, { Location: next }); res.end(); return; }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Thank you — Berkeley Nucleonics</title>' +
      '<body style="font-family:Arial,Helvetica,sans-serif;max-width:540px;margin:14vh auto;padding:0 20px;text-align:center;color:#113163">' +
      '<h1 style="color:#0655a3">Thank you</h1><p style="font-size:16px;line-height:1.6">Your submission was received. A Berkeley Nucleonics specialist will follow up shortly.</p>' +
      '<p style="margin-top:24px"><a href="javascript:history.back()" style="color:#0655a3;font-weight:bold">&larr; Back</a></p></body>');
  };

  // 1. Honeypot: bots fill _gotcha. Pretend success, drop silently.
  if (body._gotcha) { respondOk({ dropped: "honeypot" }); return; }

  // 2. Spam: Turnstile (only enforced once TURNSTILE_SECRET is set)
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  if (!(await turnstileOk(body["cf-turnstile-response"], ip))) {
    res.status(400).json({ ok: false, error: "spam check failed" }); return;
  }

  const type = (body.form || (req.query && req.query.form) || "contact").toString().toLowerCase();
  const label = TYPES[type] || "Website Form";
  // Case-insensitive field pick (forms vary: ScintIQ uses Email/Organization/Mobile phone,
  // quizzes use first_name, etc.). Track consumed keys so they don't repeat in `extra`.
  const lc = {}; for (const k of Object.keys(body)) lc[k.toLowerCase()] = body[k];
  const consumed = new Set();
  const pick = (...keys) => {
    for (const k of keys) { consumed.add(k); const v = lc[k]; if (v != null && String(v).trim() !== "") return String(v).trim(); }
    return "";
  };
  let email = pick("email", "_replyto", "e-mail").toLowerCase();
  let name = pick("name", "first_name", "fname", "full_name");
  const company = pick("company", "organization", "organisation", "org");
  const phone = pick("phone", "mobile phone", "mobile", "tel");

  // 3. Clerk (optional): a verified session lets us trust the identity.
  let verified = false;
  if (body.token) {
    const claims = await verifyClerkToken(body.token);
    if (claims) verified = true;
  }

  // Collect the "extra" fields (everything not reserved / not the standard four) for the note + email + log.
  const extra = {};
  for (const k of Object.keys(body)) {
    if (RESERVED[k] || consumed.has(k.toLowerCase())) continue;
    const v = body[k];
    if (v != null && String(v).trim() !== "") extra[k] = String(v).slice(0, 4000);
  }

  // 3b. Nutshell upsert-by-email + note (best-effort; single deduped CRM path)
  let nutshell = null;
  if (email && email.indexOf("@") > 0 && N.hasCreds()) {
    try {
      const { contact, created } = await N.upsertContact({ email, name: name || null, phone: phone || null, company: company || null });
      const lines = [label + " via website" + (verified ? " (signed in)" : "") + ".", "Email: " + email];
      if (company) lines.push("Company: " + company);
      if (phone) lines.push("Phone: " + phone);
      if (body.message) lines.push("Message: " + String(body.message).slice(0, 2000));
      for (const k of Object.keys(extra)) lines.push(k + ": " + extra[k]);
      try { await N.addNote(contact.id, lines.join("\n")); } catch (_) {}
      nutshell = { contactId: contact.id, created };
    } catch (e) { nutshell = { error: e.rpc || e.message }; }
  }

  // 4. Supabase durable log (best-effort)
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      await fetch(process.env.SUPABASE_URL + "/rest/v1/bnc_form_submissions", {
        method: "POST",
        headers: {
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: "Bearer " + process.env.SUPABASE_SERVICE_ROLE_KEY,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          form_type: type, email: email || null, name: name || null, company: company || null,
          phone: phone || null, message: body.message ? String(body.message).slice(0, 8000) : null,
          fields: extra, page: (req.headers.referer || "").slice(0, 500),
          verified, user_agent: String(req.headers["user-agent"] || "").slice(0, 300),
        }),
      });
    } catch (_) {}
  }

  // 5. SendGrid notification (best-effort; the lead is already saved above either way)
  if (smtpConfigured()) {
    try {
      const rows = [["Type", label], ["Email", email], ["Name", name], ["Company", company], ["Phone", phone]]
        .concat(body.message ? [["Message", body.message]] : [])
        .concat(Object.keys(extra).map((k) => [k, extra[k]]))
        .filter((r) => r[1])
        .map((r) => '<tr><td style="padding:4px 10px;border:1px solid #dde;background:#f6f8fb;font-weight:bold">' + esc(r[0]) + '</td><td style="padding:4px 10px;border:1px solid #dde">' + esc(r[1]).replace(/\n/g, "<br>") + "</td></tr>").join("");
      const html = '<div style="font-family:Arial,sans-serif;color:#113163"><h2 style="color:#0655a3">' + esc(label) + "</h2>" +
        '<table style="border-collapse:collapse;font-size:14px">' + rows + "</table>" +
        (nutshell && nutshell.contactId ? '<p style="color:#6b7a90;font-size:12px">Nutshell: ' + esc(nutshell.contactId) + (nutshell.created ? " (new)" : " (updated)") + "</p>" : "") +
        '<p style="color:#6b7a90;font-size:12px">Page: ' + esc(req.headers.referer || "") + "</p></div>";
      await sendMail({
        to: notifyList(type),
        subject: (body._subject || ("[BNC] " + label)) + (name || email ? " — " + (name || email) : ""),
        html, text: label + " from " + (name || email),
        replyTo: email || undefined,
      });
    } catch (_) {}
  }

  respondOk({ nutshell });
};
