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
//   FORM_NOTIFY_TO (default website@berkeleynucleonics.com), FORM_NOTIFY_<TYPE> per-type overrides.

const crypto = require("crypto");
const N = require("../lib/nutshell");
const { verifyClerkToken } = require("../lib/clerk");
const { smtpConfigured, sendMail } = require("../lib/smtp");

// `type` comes straight off the request, so every lookup keyed by it goes through has():
// a plain `TYPES[type]` would happily return Object.prototype members for form=constructor.
function has(obj, key) { return Object.prototype.hasOwnProperty.call(obj, key); }

const TYPES = {
  contact:       "Contact Us Form",
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
  "launch-list": "Launch List Signup",
};
const DEFAULT_NOTIFY = "website@berkeleynucleonics.com";
// Per-form-type recipients (override DEFAULT_NOTIFY; a FORM_NOTIFY_<TYPE> env var still wins over this).
const TYPE_NOTIFY = {
  rma: "operations@berkeleynucleonics.com",          // RMA repair / authorization request
  "rma-status": "operations@berkeleynucleonics.com", // RMA status check
};
const RESERVED = { _gotcha: 1, _subject: 1, _next: 1, _redirect: 1, _replyto: 1, form: 1, token: 1, "cf-turnstile-response": 1, "g-recaptcha-response": 1 };

// Customer auto-acknowledgement ("we have your request"). Sent FROM the mailbox that will
// actually answer rather than the web-regs relay identity, so a reply lands with the people
// who will act on it. Set FORM_ACK_OFF=1 in Vercel to stop these without a deploy.
// Deliberately NOT acknowledged: "rma-status", "quote-index" (product index quote buttons),
// "scintiq" (detector configurator), and "launch-list" (the RFS-4220 coming-soon signup, which
// must never promise pricing and lead time on an unreleased product).
const ACK_TYPES = { rma: 1, quote: 1, contact: 1 };
// operations@ (not service@): service@ was never confirmed as a monitored mailbox, and the
// support@ mailbox it sat alongside has been archived. RMA notifications already route to
// operations@ (TYPE_NOTIFY below), so the customer's reply now lands with the same team.
const ACK_FROM = process.env.FORM_ACK_FROM || "BNC Service Department <operations@berkeleynucleonics.com>";
const ACK_REPLY_TO = process.env.FORM_ACK_REPLY_TO || "operations@berkeleynucleonics.com";
const ACK_SMS = "415-336-6074";  // after-hours / weekend emergency text line
const ACK_PHONE = "+1 (800) 234-7858";

// Blind copy on every acknowledgement so the outbound email files itself onto the contact's
// Nutshell timeline (Nutshell's email drop-box address). Comma-separated; set FORM_ACK_BCC=""
// in Vercel to turn the filing off without a deploy.
const ACK_BCC = (process.env.FORM_ACK_BCC === undefined ? "bcc@nutshell.com" : process.env.FORM_ACK_BCC)
  .split(",").map((s) => s.trim()).filter(Boolean);

// Who each acknowledgement comes from. Every one of these is a berkeleynucleonics.com sender,
// and the domain is already authenticated in SendGrid, so none of them needs new verification.
// Per-type env overrides (FORM_ACK_FROM_QUOTE / FORM_ACK_REPLY_TO_CONTACT, ...) win over these.
const ACK_IDENTITY = {
  rma:     { from: ACK_FROM, replyTo: ACK_REPLY_TO },
  quote:   { from: "Berkeley Nucleonics Sales <sales@berkeleynucleonics.com>", replyTo: "sales@berkeleynucleonics.com" },
  contact: { from: "Berkeley Nucleonics <info@berkeleynucleonics.com>", replyTo: "info@berkeleynucleonics.com" },
};

function ackIdentity(type) {
  const k = String(type).toUpperCase().replace(/[^A-Z]+/g, "_");
  const d = has(ACK_IDENTITY, type) ? ACK_IDENTITY[type] : ACK_IDENTITY.contact;
  return {
    from: process.env["FORM_ACK_FROM_" + k] || d.from,
    replyTo: process.env["FORM_ACK_REPLY_TO_" + k] || d.replyTo,
  };
}

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

function readRaw(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", () => resolve(Buffer.alloc(0)));
  });
}

async function getBody(req) {
  const ct = String(req.headers["content-type"] || "");
  let body = parseBody(req);
  // Vercel does not populate req.body for multipart/form-data — read the raw stream.
  if ((!body || Object.keys(body).length === 0) && ct.indexOf("multipart/form-data") !== -1) {
    try { body = parseMultipart(await readRaw(req), ct); } catch (_) {}
  }
  return body || {};
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

// Always cc these addresses on a given form type, no matter where the base recipients
// come from (env override, code map, or default). Lets us guarantee David is on RMA
// request + status even though those recipients are set via a Vercel env override.
const TYPE_ALWAYS_CC = {
  rma: ["david.brown@berkeleynucleonics.com"],
  "rma-status": ["david.brown@berkeleynucleonics.com"],
};

function notifyList(type) {
  const key = "FORM_NOTIFY_" + String(type || "").toUpperCase().replace(/[^A-Z]+/g, "_");
  const raw = process.env[key] || (has(TYPE_NOTIFY, type) ? TYPE_NOTIFY[type] : "") || process.env.FORM_NOTIFY_TO || DEFAULT_NOTIFY;
  const list = raw.split(",").map((s) => s.trim()).filter(Boolean);
  for (const cc of (has(TYPE_ALWAYS_CC, type) ? TYPE_ALWAYS_CC[type] : [])) {
    if (!list.some((e) => e.toLowerCase() === cc.toLowerCase())) list.push(cc);
  }
  return list;
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

// Signed token for the "Block this sender" email link. HMAC-SHA256(lowercased email, BLOCK_KEY).
// Returns "" when BLOCK_KEY is unset so the button is simply not rendered (feature stays inert).
function blockToken(email) {
  const key = process.env.BLOCK_KEY;
  if (!key || !email) return "";
  return crypto.createHmac("sha256", key).update(String(email).toLowerCase()).digest("hex");
}

// Signed token for the "Create contact" email button (routed gmail/yahoo/foreign leads
// that we deliberately did NOT auto-create). HMAC-SHA256("create:"+submissionId, BLOCK_KEY),
// namespaced so it can't be replayed as a block token. Empty when BLOCK_KEY is unset.
function createContactToken(id) {
  const key = process.env.BLOCK_KEY;
  if (!key || !id) return "";
  return crypto.createHmac("sha256", key).update("create:" + String(id)).digest("hex");
}

// Signed token for the "Flag as vendor" email button. HMAC-SHA256("vendor:"+lowercased
// email, BLOCK_KEY), namespaced so it can't be replayed as a block token. Empty if unset.
function vendorToken(email) {
  const key = process.env.BLOCK_KEY;
  if (!key || !email) return "";
  return crypto.createHmac("sha256", key).update("vendor:" + String(email).toLowerCase()).digest("hex");
}

// Signed token for the "Flag as Manufacturers Rep" buttons. kind is reseller-domestic or
// reseller-international (a rep who represents other companies, not us). Namespaced "rep:".
function repToken(email, kind) {
  const key = process.env.BLOCK_KEY;
  if (!key || !email || !kind) return "";
  return crypto.createHmac("sha256", key).update("rep:" + kind + ":" + String(email).toLowerCase()).digest("hex");
}

// Is this email on the Supabase blocklist? Best-effort: any error -> not blocked (never break real forms).
async function isBlocked(email) {
  if (!email || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return false;
  try {
    const r = await fetch(process.env.SUPABASE_URL + "/rest/v1/bnc_blocked_emails?email=eq." + encodeURIComponent(email) + "&select=email&limit=1", {
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: "Bearer " + process.env.SUPABASE_SERVICE_ROLE_KEY,
      },
    });
    if (!r.ok) return false;
    const j = await r.json();
    return Array.isArray(j) && j.length > 0;
  } catch (_) { return false; }
}

// Atomic dedup gate against the create-race that makes duplicate Nutshell contacts:
// two rapid submits of the same email (bot double-fire, or Nutshell searchByEmail
// indexing lag) both find nothing and both create. Postgres makes the first INSERT of
// a given email win; a concurrent second INSERT conflicts. Returns:
//   "claimed" — we inserted the row, so WE own creating the Nutshell contact
//   "exists"  — another (concurrent or prior) submit already claimed this email; do NOT create
//   "skip"    — Supabase/table not available -> fail open (behave as before, never break a real lead)
// Needs table: create table if not exists bnc_contact_claims (email text primary key,
//   nutshell_id text, claimed_at timestamptz not null default now());
async function claimEmail(email) {
  if (!email || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return "skip";
  try {
    const r = await fetch(process.env.SUPABASE_URL + "/rest/v1/bnc_contact_claims", {
      method: "POST",
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: "Bearer " + process.env.SUPABASE_SERVICE_ROLE_KEY,
        "Content-Type": "application/json",
        Prefer: "resolution=ignore-duplicates,return=representation",
      },
      body: JSON.stringify({ email }),
    });
    if (!r.ok && r.status !== 409) return "skip"; // table missing / error -> fail open
    let arr = [];
    try { arr = await r.json(); } catch (_) {}
    return (Array.isArray(arr) && arr.length > 0) ? "claimed" : "exists";
  } catch (_) { return "skip"; }
}

// Release a claim we took but could not turn into a Nutshell contact (create failed),
// so a later legitimate submit can retry instead of being deduped forever.
async function releaseEmailClaim(email) {
  if (!email || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  try {
    await fetch(process.env.SUPABASE_URL + "/rest/v1/bnc_contact_claims?email=eq." + encodeURIComponent(email), {
      method: "DELETE",
      headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: "Bearer " + process.env.SUPABASE_SERVICE_ROLE_KEY },
    });
  } catch (_) {}
}

// Absolute base URL for the block link. Prefer the forwarded request host; fall back to production www.
function baseUrl(req) {
  const proto = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim() || "https";
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "www.berkeleynucleonics.com").split(",")[0].trim();
  return proto + "://" + host;
}

// Readable name: if a single run-together name came in (bots + some forms send
// "JaneDoe"), split the camelCase so the inbox preview shows "Jane Doe".
function displayName(n) {
  n = String(n || "").trim();
  if (!n || /\s/.test(n)) return n;
  return n.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Za-z])(\d)/g, "$1 $2");
}

// Script/spam signals in submitted text. Cyrillic anywhere, or a Russian-domain
// (.ru / .su / .рф) link in the body, => Russian spam (this wave uses gmail/free
// senders with a Cyrillic body + a .ru link, so the sender-TLD check misses them).
// Other non-Latin scripts (CJK, Arabic, Hebrew, Thai, Devanagari, Greek, Hangul,
// Japanese kana) => foreign-language, which we route to David rather than block.
function scriptFlags(text) {
  const s = String(text || "");
  const cyrillic = /[Ѐ-ӿ]/.test(s);
  const ruLink = /[a-z0-9][a-z0-9-]*\.(ru|su)\b/i.test(s) || /xn--p1ai/i.test(s) || /рф\b/.test(s);
  const otherForeign = /[一-鿿぀-ヿ가-힯؀-ۿ֐-׿฀-๿ऀ-ॿ]/.test(s);
  return { cyrillic, ruLink, otherForeign };
}

// Best-effort model number for the preview: a product/model field, else a token
// parsed from the page URL (e.g. bnc-845-datasheet.html -> 845, 7000-series -> 7000).
function guessModel(fromField, pageUrl) {
  if (fromField) return String(fromField).trim().slice(0, 40);
  const m = String(pageUrl || "").match(/bnc-([a-z]?\d{3,4}[a-z0-9-]*)-|\/(\d{3,4})-series/i);
  return m ? (m[1] || m[2]).toUpperCase() : "";
}

// Serial numbers to echo back in the acknowledgement. Customers routinely put "See Description"
// in the serial field and list the real ones in the problem text ("SN: 100200"), so scan both
// and prefer whatever is most specific. Capped so a pasted service history can't flood the email.
function ackSerials(serialField, description) {
  const placeholder = /^(see|n\/?a|none|tbd|unknown|various|multiple|below|attached)\b/i;
  const given = String(serialField || "").trim().slice(0, 200);
  if (given && !placeholder.test(given)) return [given];
  const found = [];
  // The lookahead demands a digit in the token, so "SN are below" doesn't turn "are" into a serial.
  const re = /\b(?:S\/?N|serials?(?:\s*(?:numbers?|nos?\.?|#))?)\s*[:#]?\s*(?=[A-Za-z0-9-]*\d)([A-Za-z0-9][A-Za-z0-9-]{2,19})/gi;
  let m;
  while ((m = re.exec(String(description || ""))) !== null && found.length < 12) {
    if (!found.some((v) => v.toLowerCase() === m[1].toLowerCase())) found.push(m[1]);
  }
  // Nothing real to echo beats echoing "See Description" back at the customer.
  return found.length ? found : (given && !placeholder.test(given) ? [given] : []);
}

// The acknowledgement shell, shared by every form type. Brand shell (BNC blue, Myriad Pro
// headings with an Arial fallback), table layout so Outlook renders it, and the customer's own
// details repeated back so they can see we captured the right thing. Returns { html, text }.
function ackShell({ preheader, heading, hello, intro, rows, callout, signName, replyTo }) {
  // Trim and cap every echoed value. A whitespace-only field would otherwise render an empty
  // bolded row, and an oversized one would let a scripted post stuff the email we send out.
  rows = (rows || []).map((r) => [r[0], String(r[1] == null ? "" : r[1]).trim().slice(0, 300)]).filter((r) => r[1]);
  const sig = "Berkeley Nucleonics Corporation" + "\nTest, Measurement and Nuclear Instrumentation since 1963" + "\n2955 Kerner Blvd, San Rafael, CA 94901  ·  " + ACK_PHONE;

  const rowsHtml = rows.map((r) =>
    '<tr><td style="padding:7px 14px 7px 0;font-size:13px;color:#6b7a90;vertical-align:top;white-space:nowrap">' + esc(r[0]) +
    '</td><td style="padding:7px 0;font-size:14px;color:#113163;font-weight:bold">' + esc(r[1]).replace(/\n/g, "<br>") + "</td></tr>").join("");

  const html =
    '<div style="margin:0;padding:24px 12px;background:#eef3f9;font-family:Arial,Helvetica,sans-serif">' +
    '<span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;max-height:0;max-width:0;overflow:hidden;mso-hide:all">' +
      esc(preheader) + "</span>" +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center">' +
    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e1e8f2;border-radius:4px">' +
      '<tr><td style="height:6px;line-height:6px;font-size:0;background:#0655a3">&nbsp;</td></tr>' +
      '<tr><td style="padding:24px 32px 8px">' +
        '<p style="margin:0;font-size:11px;font-weight:bold;letter-spacing:.16em;text-transform:uppercase;color:#0655a3">Berkeley Nucleonics</p>' +
        '<h1 style="margin:8px 0 16px;font-family:\'Myriad Pro\',Arial,Helvetica,sans-serif;font-size:22px;font-weight:bold;color:#113163">' + esc(heading) + "</h1>" +
        '<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#37475f">' + esc(hello) + "</p>" +
        '<p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#37475f">' + esc(intro) + "</p>" +
      "</td></tr>" +
      (rowsHtml ? '<tr><td style="padding:0 32px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-top:1px solid #e1e8f2;border-bottom:1px solid #e1e8f2;padding:4px 0">' + rowsHtml + "</table></td></tr>" : "") +
      '<tr><td style="padding:20px 32px 0">' +
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f6f8fb;border-left:4px solid #0655a3;border-radius:0 4px 4px 0">' +
          '<tr><td style="padding:14px 16px;font-size:14px;line-height:1.6;color:#37475f">' + esc(callout) + "</td></tr>" +
        "</table>" +
      "</td></tr>" +
      '<tr><td style="padding:22px 32px 26px">' +
        '<p style="margin:0;font-size:15px;line-height:1.6;color:#37475f">Thank you,<br>' +
        '<span style="font-weight:bold;color:#113163">' + esc(signName) + "</span><br>" +
        '<a href="mailto:' + esc(replyTo) + '" style="color:#0655a3;text-decoration:none">' + esc(replyTo) + "</a></p>" +
      "</td></tr>" +
      '<tr><td style="padding:16px 32px;background:#113163;border-radius:0 0 4px 4px;font-size:11.5px;line-height:1.7;color:#c7d5ea">' +
        "Berkeley Nucleonics Corporation<br>Test, Measurement and Nuclear Instrumentation since 1963<br>" +
        "2955 Kerner Blvd, San Rafael, CA 94901 &middot; " + ACK_PHONE +
      "</td></tr>" +
    "</table></td></tr></table></div>";

  const text = [hello, "", intro, ""]
    .concat(rows.map((r) => r[0] + ": " + r[1]))
    .concat(["", callout, "", "Thank you,", signName, replyTo, "", sig])
    .join("\n");

  return { html, text };
}

// RMA: repeat the model and serials back so the customer can see we captured the right
// instruments, and give them the after-hours route for a detection emergency.
function ackRma({ hello, replyTo, model, serials, reason, company }) {
  model = String(model == null ? "" : model).trim();
  const shell = ackShell({
    preheader: "We have your RMA request. A service specialist replies within about two hours, 6am to 6pm Pacific, Monday through Friday.",
    heading: "We have your RMA request",
    hello,
    intro: "Thank you for your RMA request. We have your information, and a member of the BNC Service Department will respond as quickly as possible, usually within two hours, Monday through Friday, 6am to 6pm Pacific.",
    rows: [
      ["Model", model],
      [serials.length > 1 ? "Serial numbers" : "Serial number", serials.join(", ")],
      ["Return reason", reason],
      ["Company", company],
    ],
    callout: "If you have an emergency after hours or on the weekend, particularly with one of our nuclear detection instruments, please also send a text to " + ACK_SMS + " and we will try to have a spectroscopist follow up right away.",
    signName: "BNC Service Department",
    replyTo,
  });
  return Object.assign({ subject: "We have your RMA request" + (model ? " · " + String(model).slice(0, 60) : "") + " · Berkeley Nucleonics Service" }, shell);
}

// Quote / demo request: confirm what they asked us to price, and invite the specification,
// contract vehicle, or delivery date that usually decides how the quote gets written.
// Only short structured fields are echoed. The free-text application is deliberately left out:
// this endpoint is unauthenticated, so anything echoed here is text an attacker could have
// delivered to a third party over a DKIM-signed berkeleynucleonics.com sender.
function ackQuote({ hello, replyTo, model, quantity, country, company }) {
  model = String(model == null ? "" : model).trim();
  const shell = ackShell({
    preheader: "We have your quote request. An applications engineer follows up with pricing and lead time, usually within two hours.",
    heading: "We have your quote request",
    hello,
    intro: "Thank you for your request. Your details are with our applications engineers, and one of them will send pricing and lead time, usually within two hours, Monday through Friday, 6am to 6pm Pacific. If the configuration needs a closer look, they will come back to you with a question or two first.",
    rows: [
      ["Model or product", model],
      ["Quantity", quantity],
      ["Country", country],
      ["Company", company],
    ],
    callout: "If this has to meet a specific specification, contract vehicle, or delivery date, reply to this email and we will build that into the quote. We are flexible, and we listen to the application.",
    signName: "Berkeley Nucleonics Sales",
    replyTo,
  });
  return Object.assign({ subject: "We have your quote request" + (model ? " · " + String(model).slice(0, 60) : "") + " · Berkeley Nucleonics" }, shell);
}

// Does a contact submission look like a real lead, or like the junk that lands on the
// broadest, least-defended form on the site?
//
// This gates the CUSTOMER acknowledgement only. Whatever this returns, the lead is still
// saved, still logged, and still notifies a human. The worst case here is that a real
// person does not get an instant auto-reply and hears from a rep instead, which is the
// safer failure: an acknowledgement is a DKIM-signed berkeleynucleonics.com email sent to
// an address the sender chose, so answering junk means mailing strangers on their behalf.
//
// Scored rather than a hard rule, so a professor writing a genuine question from a gmail
// address still gets an answer while a templated pitch from a corporate domain does not.
// Set FORM_ACK_CONTACT_ALL=1 to acknowledge every contact submission again.
const PITCH_RE = new RegExp([
  "seo", "backlink", "guest post", "link building", "digital marketing",
  "web design", "website design", "app development", "mobile app",
  "lead generation", "increase your (traffic|sales|ranking)", "first page of google",
  "outsourc", "offshore", "dedicated developer", "crypto", "bitcoin", "forex",
  "loan offer", "investment opportunity", "b2b (data|list)", "email list",
].join("|"), "i");

const TECH_RE = /\b(\d{3,4}[a-z]?\b|pulse|delay|generator|signal|rf|microwave|phase noise|detector|scintillat|isotope|riid|spectrum|analyz|pulser|laser|diode|driver|calibrat|jitter|trigger|waveform|awg|neutron|gamma|quote|lead time|datasheet|spec)/i;

function contactLeadScore({ email, name, company, phone, message, freeMbox, foreign }) {
  const msg = String(message || "").trim();
  const reasons = [];
  let score = 0;

  if (email && email.indexOf("@") > 0 && !freeMbox) { score += 2; reasons.push("+2 corporate email"); }
  // National labs, universities and defense are the core of this customer base. Someone
  // writing from one of those domains gets the benefit of the doubt even if they submitted
  // the form without typing a message.
  if (/\.(gov|mil|edu)$|\.(ac|edu|gov)\.[a-z]{2}$/i.test(String(email || ""))) {
    score += 1; reasons.push("+1 institutional domain");
  }
  // Word count, not character count. "Do you ship to the UK?" is a short but perfectly
  // real question; "hi" is not. Counting characters treated both the same.
  const words = msg ? msg.split(/\s+/).filter(Boolean).length : 0;
  if (words >= 12) { score += 2; reasons.push("+2 substantive message"); }
  else if (words < 4) { score -= 1; reasons.push("-1 barely any message"); }
  if (String(company || "").trim().length > 1) { score += 1; reasons.push("+1 company given"); }
  if (String(phone || "").trim().length > 5) { score += 1; reasons.push("+1 phone given"); }
  if (TECH_RE.test(msg)) { score += 1; reasons.push("+1 mentions a product or spec"); }
  if (PITCH_RE.test(msg)) { score -= 3; reasons.push("-3 reads as an outbound pitch"); }
  if (foreign) { score -= 2; reasons.push("-2 foreign or strange characters"); }
  // A message that is mostly links, from someone who would not say who they work for.
  if (/https?:\/\//i.test(msg) && !String(company || "").trim()) {
    score -= 2; reasons.push("-2 links but no company");
  }
  if (!String(name || "").trim() && !String(company || "").trim()) {
    score -= 1; reasons.push("-1 no name and no company");
  }

  return { ok: score >= 3, score, why: reasons.join(", ") };
}

// Contact form: the broadest inbound, and the default type when none is given, so treat it as
// the most exposed. Short structured fields only (see the note on ackQuote), then the phone
// route for anything urgent so nobody waits on email when a bench is down.
function ackContact({ hello, replyTo, company, phone, source }) {
  const shell = ackShell({
    preheader: "We have your message. The right specialist at Berkeley Nucleonics follows up, usually within two hours.",
    heading: "Thank you for contacting us",
    hello,
    intro: "Thank you for reaching out. Your message is with the Berkeley Nucleonics team, and the person best suited to answer it will follow up, usually within two hours, Monday through Friday, 6am to 6pm Pacific.",
    rows: [
      ["Company", company],
      ["Phone", phone],
      ["How you found us", source],
    ],
    callout: "If it is urgent, please call us at " + ACK_PHONE + ", 6am to 6pm Pacific, Monday through Friday. Our engineers are glad to talk an application through on the phone.",
    signName: "Berkeley Nucleonics",
    replyTo,
  });
  return Object.assign({ subject: "Thank you for contacting Berkeley Nucleonics" }, shell);
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST") { res.status(405).end(); return; }

  const body = await getBody(req);
  const accept = String(req.headers.accept || "");
  const wantsJson = accept.indexOf("application/json") !== -1;
  const next = body._next || body._redirect || "";
  const type = (body.form || (req.query && req.query.form) || "contact").toString().toLowerCase();
  const respondOk = (extra) => {
    if (wantsJson) { res.status(200).json(Object.assign({ ok: true }, extra || {})); return; }
    if (next) { res.writeHead(303, { Location: next }); res.end(); return; }
    // Redirect to the real /thank-you.html rather than rendering an inline page. That page
    // carries the site's tag stack (GTM / Bing UET) and pushes a `form_submission_complete`
    // dataLayer event, so a submit is measurable. The inline page this replaced had no
    // analytics on it at all, which silently killed conversion tracking for every form at
    // the July 2026 cutover off WordPress.
    res.writeHead(303, { Location: "/thank-you.html?form=" + encodeURIComponent(type) });
    res.end();
  };

  // 1. Honeypot: bots fill _gotcha. Pretend success, drop silently.
  if (body._gotcha) { respondOk({ dropped: "honeypot" }); return; }

  // 2. Spam: Turnstile (only enforced once TURNSTILE_SECRET is set)
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  if (!(await turnstileOk(body["cf-turnstile-response"], ip))) {
    res.status(400).json({ ok: false, error: "spam check failed" }); return;
  }

  const label = has(TYPES, type) ? TYPES[type] : "Website Form";
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
  const modelField = pick("model", "product", "product_model", "model_number", "interested_in", "product_of_interest", "sku");

  // 2a. Hard block: Russian-TLD senders (.ru / .su / .рф). This wave is casino/pharma
  // bots and we do no business in Russia. Drop silently (bot sees the normal thank-you,
  // nothing goes to Nutshell / Supabase / notify).
  if (email && /@[^@]*\.(ru|su|xn--p1ai|рф)$/i.test(email)) { respondOk({ dropped: "ru" }); return; }

  // 2b. Blocklist: a previously blocked sender gets the normal thank-you but nothing downstream
  // (no Nutshell, no Supabase log, no notify). Best-effort — a lookup error just proceeds normally.
  if (email && email.indexOf("@") > 0 && (await isBlocked(email))) { respondOk({ dropped: "blocked" }); return; }

  // 2c. Russian-language content: Cyrillic anywhere in the submission, or a .ru/.su link in
  // the body. The .ru-TLD sender check above misses the current wave (gmail senders, Cyrillic
  // body, .ru link in the message), so scan the text. Drop silently like the sender block.
  const _vals = Object.keys(body).map((k) => (typeof body[k] === "string" ? body[k] : "")).join(" \n ");
  const _blob = (name || "") + " \n " + _vals;
  const _scr = scriptFlags(_blob);
  if (_scr.cyrillic || _scr.ruLink) { respondOk({ dropped: "ru-content" }); return; }

  // 2d. Triage-routing signals (keep the lead, just send the notice to a triager, not a rep):
  //   - foreign-language / strange-character body (non-Latin script or many non-ASCII chars) -> David
  //   - free consumer mailbox (gmail / yahoo / aol / ...) — B2B buyers use corporate email -> Meraly
  //     (she flags spam / vendor, or creates the contact if it is a real lead)
  const _nonAscii = (_blob.match(/[^\x00-\x7F]/g) || []).length;
  const _freeMbox = /@(gmail|googlemail|yahoo|ymail|rocketmail|aol|hotmail|outlook|live|icloud|proton|protonmail|gmx)\.[a-z.]+$/i.test(email);
  const routeToTriage = _scr.otherForeign || _nonAscii >= 8 || _freeMbox;
  const routeReason = _scr.otherForeign || _nonAscii >= 8 ? "foreign/strange" : (_freeMbox ? "consumer-mailbox" : "");
  const TRIAGE_TO = { "foreign/strange": ["david.brown@berkeleynucleonics.com"], "consumer-mailbox": ["meraly.rodas@berkeleynucleonics.com"] };

  // 2e. Contact is the most spam-prone form on the site, so its customer acknowledgement
  // is held back unless the submission reads like a real lead. Scored below; the result
  // is attached to the internal notice and the Supabase row so a held one is visible
  // rather than silent. RMA and quote are not gated: both require enough specific detail
  // that junk barely reaches them.
  const _leadCheck = contactLeadScore({
    email, name, company, phone,
    message: body.message || lc["message"] || "",
    freeMbox: _freeMbox,
    foreign: _scr.otherForeign || _nonAscii >= 8,
  });

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

  // Record when a contact acknowledgement was withheld, and why. This rides the normal
  // extra-fields path, so it shows in the internal notice, the Nutshell note and the
  // Supabase row. Without it, a held acknowledgement is invisible and looks like a bug.
  if (type === "contact" && !_leadCheck.ok && !process.env.FORM_ACK_CONTACT_ALL) {
    extra["Acknowledgement"] = "Held back, did not read as a lead (score " +
      _leadCheck.score + ": " + (_leadCheck.why || "no signals") + "). " +
      "The lead is still saved and this notice still went out.";
  }

  // 3b. Nutshell find-or-create + note (best-effort; single deduped CRM path).
  // Guarded by an atomic Supabase claim so two racing submits of the same email can't
  // both create a contact (the root cause of the duplicate pairs).
  let nutshell = null;
  if (email && email.indexOf("@") > 0 && N.hasCreds()) {
    try {
      let contact = await N.findContactByEmail(email);
      let created = false;
      if (!contact && routeToTriage) {
        // gmail/yahoo/consumer + foreign submissions: do NOT auto-create a contact.
        // The triage email (Meraly for consumer mailboxes, David for foreign/strange)
        // gets a "Create contact" button so the triager decides, then routes to a rep.
        // (An already-existing contact still gets the note below.)
        nutshell = { skippedCreate: true };
      } else if (!contact) {
        const claim = await claimEmail(email);
        if (claim === "exists") {
          // A concurrent (or prior) submit already owns creating this email. Re-check once
          // in case it just landed; otherwise skip the create so we don't duplicate.
          contact = await N.findContactByEmail(email);
          if (!contact) nutshell = { deduped: true };
        } else {
          try {
            contact = await N.createContact({ name: name || company || String(email).split("@")[0], email, phone });
            created = true;
          } catch (ce) {
            if (claim === "claimed") await releaseEmailClaim(email); // let a later real submit retry
            throw ce;
          }
        }
      }
      if (contact) {
      const lines = [label + " via website" + (verified ? " (signed in)" : "") + ".", "Email: " + email];
      if (company) lines.push("Company: " + company);
      if (phone) lines.push("Phone: " + phone);
      if (body.message) lines.push("Message: " + String(body.message).slice(0, 2000));
      for (const k of Object.keys(extra)) lines.push(k + ": " + extra[k]);
      try { await N.addNote(contact.id, lines.join("\n")); } catch (_) {}
      nutshell = { contactId: contact.id, created };
      }
    } catch (e) { nutshell = { error: e.rpc || e.message }; }
  }

  // 4. Supabase durable log (best-effort). Capture the row id so a routed submission's
  // "Create contact" button can point back to this exact record.
  let submissionId = "";
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const r = await fetch(process.env.SUPABASE_URL + "/rest/v1/bnc_form_submissions", {
        method: "POST",
        headers: {
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: "Bearer " + process.env.SUPABASE_SERVICE_ROLE_KEY,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          form_type: type, email: email || null, name: name || null, company: company || null,
          phone: phone || null, message: body.message ? String(body.message).slice(0, 8000) : null,
          fields: extra, page: (req.headers.referer || "").slice(0, 500),
          verified, user_agent: String(req.headers["user-agent"] || "").slice(0, 300),
        }),
      });
      try { const j = await r.json(); if (Array.isArray(j) && j[0] && j[0].id != null) submissionId = String(j[0].id); } catch (_) {}
    } catch (_) {}
  }

  // 5. SendGrid notification (best-effort; the lead is already saved above either way).
  // Skip the datasheet CONFIGURATOR (pdf-config) and the Book Reader QUIZ: both are
  // guaranteed to reach the daily Web Visitor Battle Card via bnc_form_submissions
  // (quiz cards go to Meraly), so the real-time email is redundant.
  // (They are still logged to Supabase + noted in Nutshell above.)
  if (smtpConfigured() && type !== "pdf-config" && type !== "quiz") {
    try {
      // Preview-friendly fields: spaced name, best-effort model, and New vs Repeat
      // (from whether Nutshell just created the contact). These lead the email so the
      // inbox snippet reads "Jane Doe · jane@acme.com · Contact Us Form · Model 845 · New".
      const nm = displayName(name);
      const model = guessModel(modelField, req.headers.referer);
      const newRepeat = nutshell && typeof nutshell.created === "boolean" ? (nutshell.created ? "New" : "Repeat") : "";
      // "Repeat" means a Nutshell contact with this email already existed (usually from a
      // website registration/sign-in or an earlier form). Pull that contact's name +
      // primary email so the Status row shows WHO we matched, not just "Repeat".
      let existingWho = "";
      if (newRepeat === "Repeat" && nutshell && nutshell.contactId) {
        try {
          const cid = parseInt(String(nutshell.contactId).split("-")[0], 10);
          const full = await N.rpc("getContact", { contactId: cid });
          const pe = full && full.email && (full.email["--primary"] || full.email["0"] || full.email[0]);
          const fn = full && full.name && (full.name.displayName || full.name);
          const prevEmail = typeof pe === "string" ? pe : "";
          existingWho = " (previously registered as " + (prevEmail || email) + (fn ? ", " + fn : "") + ")";
        } catch (_) {}
      }
      const statusCell = newRepeat + existingWho;
      const previewParts = [];
      if (nm) { previewParts.push(nm); if (email) previewParts.push(email); }
      else if (email) previewParts.push(email);
      previewParts.push(label);
      if (model) previewParts.push("Model " + model);
      if (newRepeat) previewParts.push(newRepeat);
      const preview = previewParts.join("  ·  ");

      // Table leads with Name/Email; "Type" is dropped (the heading already says it).
      const rows = [["Name", nm || name], ["Email", email], ["Company", company], ["Phone", phone], ["Model", model], ["Status", statusCell]]
        .concat(body.message ? [["Message", body.message]] : [])
        .concat(Object.keys(extra).map((k) => [k, extra[k]]))
        .filter((r) => r[1])
        .map((r) => '<tr><td style="padding:4px 10px;border:1px solid #dde;background:#f6f8fb;font-weight:bold">' + esc(r[0]) + '</td><td style="padding:4px 10px;border:1px solid #dde">' + esc(r[1]).replace(/\n/g, "<br>") + "</td></tr>").join("");
      // "Block this sender" button (only when there is an email AND BLOCK_KEY is configured).
      // "Flag as vendor" button (amber) - softer than block: keeps the Nutshell record but
      // tags it Vendor and stops future submissions. Shows when there is an email + BLOCK_KEY.
      const vtok = vendorToken(email);
      const vendorBtn = (email && vtok)
        ? '<p style="margin-top:14px">' +
            '<a href="' + esc(baseUrl(req)) + "/api/vendor?email=" + encodeURIComponent(email) + "&t=" + vtok + '" ' +
            'style="display:inline-block;background:#c77e00;color:#ffffff;text-decoration:none;font-family:Arial,sans-serif;font-size:12px;font-weight:bold;padding:5px 12px;border-radius:4px">Flag as vendor</a>' +
            '<br><span style="color:#6b7a90;font-size:11px">Not spam, but not a lead: tags the Nutshell record Vendor and blocks future submissions.</span>' +
          "</p>"
        : "";
      // "Flag as Manufacturers Rep" buttons - a rep who represents OTHER companies (not us) and
      // is not a customer. Tags Contact Type = Reseller (Domestic/International); does NOT block
      // (a channel partner may follow up). BNC-Rep is reserved for reps who represent us.
      const rTokD = repToken(email, "reseller-domestic");
      const rTokI = repToken(email, "reseller-international");
      const repBtn = "display:inline-block;background:#0a7d6b;color:#ffffff;text-decoration:none;font-family:Arial,sans-serif;font-size:12px;font-weight:bold;padding:5px 12px;border-radius:4px;margin:6px 6px 0 0";
      const repBtns = (email && rTokD && rTokI)
        ? '<p style="margin-top:14px">' +
            '<span style="color:#113163;font-size:12px;font-weight:bold">Flag as Manufacturers Rep (reps other companies, not us):</span><br>' +
            '<a href="' + esc(baseUrl(req)) + "/api/rep?email=" + encodeURIComponent(email) + "&kind=reseller-domestic&t=" + rTokD + '" style="' + repBtn + '">Reseller &mdash; Domestic</a>' +
            '<a href="' + esc(baseUrl(req)) + "/api/rep?email=" + encodeURIComponent(email) + "&kind=reseller-international&t=" + rTokI + '" style="' + repBtn + '">Reseller &mdash; International</a>' +
            '<br><span style="color:#6b7a90;font-size:11px">Tags the Nutshell record as a reseller (a rep for other manufacturers, not a customer). Not blocked.</span>' +
          "</p>"
        : "";
      const tok = blockToken(email);
      // Pass the Nutshell contact id so Block can delete by id if searchByEmail hasn't
      // indexed this fresh contact yet (block.js re-verifies the id carries this email).
      const cidParam = (nutshell && nutshell.contactId) ? "&cid=" + encodeURIComponent(nutshell.contactId) : "";
      const blockBtn = (email && tok)
        ? '<p style="margin-top:18px">' +
            '<a href="' + esc(baseUrl(req)) + "/api/block?email=" + encodeURIComponent(email) + "&t=" + tok + cidParam + '" ' +
            'style="display:inline-block;background:#b0242a;color:#ffffff;text-decoration:none;font-family:Arial,sans-serif;font-size:11px;font-weight:bold;padding:4px 10px;border-radius:4px">Block this sender</a>' +
            '<br><span style="color:#6b7a90;font-size:11px">Blocks future submissions from this address and removes the Nutshell record.</span>' +
          "</p>"
        : "";
      // "Create contact" button — only for routed (gmail/yahoo/foreign) leads we did NOT
      // auto-create, when we have the submission id + BLOCK_KEY. Lets the triager add them
      // to Nutshell on demand and then route to a rep.
      const ctok = createContactToken(submissionId);
      const createBtn = (nutshell && nutshell.skippedCreate && submissionId && ctok)
        ? '<p style="margin-top:18px">' +
            '<a href="' + esc(baseUrl(req)) + "/api/create-contact?id=" + encodeURIComponent(submissionId) + "&t=" + ctok + '" ' +
            'style="display:inline-block;background:#1a8a5a;color:#ffffff;text-decoration:none;font-family:Arial,sans-serif;font-size:12px;font-weight:bold;padding:6px 14px;border-radius:4px">Create contact in Nutshell</a>' +
            '<br><span style="color:#6b7a90;font-size:11px">Not added automatically (consumer/foreign sender). Click to add them, then route to a rep in Nutshell.</span>' +
          "</p>"
        : "";
      const html = '<div style="font-family:Arial,sans-serif;color:#113163">' +
        // hidden preheader: controls the inbox preview snippet in most clients
        '<span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;max-height:0;max-width:0;overflow:hidden;mso-hide:all">' + esc(preview) + "</span>" +
        '<h2 style="color:#0655a3;margin:0 0 10px">' + esc(label) + "</h2>" +
        '<table style="border-collapse:collapse;font-size:14px">' + rows + "</table>" +
        (nutshell && nutshell.contactId ? '<p style="color:#6b7a90;font-size:12px">Nutshell: <a href="https://app.nutshell.com/person/' + encodeURIComponent(String(nutshell.contactId).split("-")[0]) + '" style="color:#0655a3">' + esc(nutshell.contactId) + "</a>" + (nutshell.created ? " (new)" : " (updated)") + "</p>" : "") +
        '<p style="color:#6b7a90;font-size:12px">Page: ' + esc(req.headers.referer || "") + "</p>" + createBtn + vendorBtn + repBtns + blockBtn + "</div>";
      // Route triage submissions to their triager (consumer-mailbox -> Meraly, who flags
      // spam / vendor or creates the contact; foreign/strange -> David), everyone else to
      // the normal per-type inbox. Tag the subject so it's obvious why.
      const to = routeToTriage ? (TRIAGE_TO[routeReason] || ["david.brown@berkeleynucleonics.com"]) : notifyList(type);
      const routeTag = routeToTriage ? (routeReason === "consumer-mailbox" ? " · Consumer email" : " · Foreign/strange") : "";
      await sendMail({
        to,
        subject: "[BNC Site] " + label + (nm || email ? " — " + (nm || email) : "") + (model ? " · Model " + model : "") + (newRepeat ? " · " + newRepeat : "") + routeTag,
        html, text: preview,
        replyTo: email || undefined,
      });
    } catch (_) {}
  }

  // 6. Customer acknowledgement (RMA, quote, contact). Separate try/catch from the internal
  // notify so a failure on either side never costs us the other, and never blocks the visitor.
  // Skipped for our own domain so a staff test or an internal forward can't start a mail loop.
  // Every acknowledgement is blind-copied to Nutshell so it files onto the contact's timeline.
  const ackAllowed = has(ACK_TYPES, type) &&
    (type !== "contact" || _leadCheck.ok || !!process.env.FORM_ACK_CONTACT_ALL);

  if (smtpConfigured() && ackAllowed && !process.env.FORM_ACK_OFF &&
      email && email.indexOf("@") > 0 && !/@berkeleynucleonics\.com$/i.test(email)) {
    try {
      const id = ackIdentity(type);
      const hello = (() => {
        const f = displayName(name).split(/\s+/)[0] || "";
        return f ? "Hello " + f + "," : "Hello,";
      })();
      // Triage submissions (consumer mailbox / foreign script) are deliberately kept out of
      // Nutshell above until a human says otherwise, so filing their acknowledgement into the
      // drop box would put them in the CRM through a side door the claim table cannot see.
      // They still get the acknowledgement, just not the CRM copy. FORM_ACK_BCC_TRIAGE=1 to file
      // them anyway.
      const bcc = (routeToTriage && !process.env.FORM_ACK_BCC_TRIAGE) ? [] : ACK_BCC;
      let ack;
      if (type === "quote") {
        ack = ackQuote({
          hello, replyTo: id.replyTo, company,
          model: modelField || lc["product_or_model"] || guessModel(modelField, req.headers.referer),
          quantity: lc["quantity"] || "",
          country: lc["country"] || "",
        });
      } else if (type === "contact") {
        ack = ackContact({
          hello, replyTo: id.replyTo, company, phone,
          source: lc["source"] || "",
        });
      } else {
        ack = ackRma({
          hello, replyTo: id.replyTo, company,
          model: modelField || guessModel(modelField, req.headers.referer),
          serials: ackSerials(lc["serial_number"], lc["problem_description"] || body.message),
          reason: lc["return_reason"] || "",
        });
      }
      await sendMail({
        to: email,
        bcc,
        from: id.from,
        replyTo: id.replyTo,
        subject: ack.subject,
        html: ack.html,
        text: ack.text,
      });
    } catch (_) {}
  }

  respondOk({ nutshell });
};

// Exported so scripts/ack-preview.js can render the real acknowledgements without sending mail.
// Vercel only ever calls the default export above.
module.exports.ackRma = ackRma;
module.exports.ackQuote = ackQuote;
module.exports.ackContact = ackContact;
module.exports.ackIdentity = ackIdentity;
module.exports.ACK_BCC = ACK_BCC;
