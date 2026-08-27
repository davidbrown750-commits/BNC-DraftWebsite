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
  configurator:  "QuickQuote Configurator Request",
  book:          "Book / Reading-Map Request",
  "pdf-config":  "Datasheet Configurator Request",
  resource:      "Resource Request",
  quiz:          "Book Reader Quiz",
  newsletter:    "Newsletter Signup",
  // BNC Academy complimentary class passes (academy-free-access.html). One checkbox per
  // class, so the submission carries course_<CODE> keys rather than a single "course" field.
  "academy-access": "BNC Academy Complimentary Pass Request",
  "launch-list": "Launch List Signup",
  // The BNC Dispatch partner edition — one type per mail-in coupon, so each response
  // lands on the rep's own Nutshell record with a label that says which ask it answers.
  "partner-shows":       "Partner — Trade Show (next 12 months)",
  "partner-comarketing": "Partner — Co-Marketing Idea",
  "partner-region":      "Partner — What's Hot in My Region",
  "partner-website":     "Partner — Website Refresh",
};
const DEFAULT_NOTIFY = "website@berkeleynucleonics.com";
// Per-form-type recipients (override DEFAULT_NOTIFY; a FORM_NOTIFY_<TYPE> env var still wins over this).
const TYPE_NOTIFY = {
  rma: "operations@berkeleynucleonics.com",          // RMA repair / authorization request
  // Academy pass requests are handled by the Academy team, not the website inbox.
  "academy-access": "info@berkeleynucleonics.com",
  "rma-status": "operations@berkeleynucleonics.com", // RMA status check
  // Partner-edition coupons: these are channel replies, not leads, so they go to David and
  // sales rather than website@. The 2026 rep newsletter drew zero responses partly because
  // its only reply path was partners@berkeleynucleonics.com, a mailbox that never existed.
  "partner-shows":       "david.brown@berkeleynucleonics.com, sales@berkeleynucleonics.com",
  "partner-comarketing": "david.brown@berkeleynucleonics.com, sales@berkeleynucleonics.com",
  "partner-region":      "david.brown@berkeleynucleonics.com, sales@berkeleynucleonics.com",
  "partner-website":     "david.brown@berkeleynucleonics.com, sales@berkeleynucleonics.com",
};
const RESERVED = { _gotcha: 1, _subject: 1, _next: 1, _redirect: 1, _replyto: 1, form: 1, token: 1, "cf-turnstile-response": 1, "g-recaptcha-response": 1 };

// Customer auto-acknowledgement ("we have your request"). Sent FROM the mailbox that will
// actually answer rather than the web-regs relay identity, so a reply lands with the people
// who will act on it. Set FORM_ACK_OFF=1 in Vercel to stop these without a deploy.
// Deliberately NOT acknowledged: "rma-status", "quote-index" (product index quote buttons),
// "scintiq" (detector configurator), and "launch-list" (the RFS-4220 coming-soon signup, which
// must never promise pricing and lead time on an unreleased product).
const ACK_TYPES = { rma: 1, quote: 1, contact: 1, "academy-access": 1 };
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

// Who each acknowledgement comes from. Per-type env overrides (FORM_ACK_FROM_QUOTE /
// FORM_ACK_REPLY_TO_CONTACT, ...) win over these.
//
// All but one are berkeleynucleonics.com senders, and that domain is already authenticated
// in SendGrid. The exception is the Academy sender, which is on the SEPARATE domain
// berkeleynucleonicsacademy.com. That domain is already SendGrid domain-authenticated too
// (checked 2026-08-27: SPF "v=spf1 include:sendgrid.net include:amazonses.com ~all",
// DKIM s1/s2._domainkey CNAMEd to sendgrid.net, and a _dmarc record), so acknowledgements
// from it sign and align without any new setup.
//
// It has no MX record, so inbound mail falls back to the apex A record on Bluehost. If a
// reply to alec@berkeleynucleonicsacademy.com ever bounces, that mailbox is the reason, and
// FORM_ACK_REPLY_TO_ACADEMY_ACCESS repoints replies without a deploy.
const ACK_IDENTITY = {
  rma:     { from: ACK_FROM, replyTo: ACK_REPLY_TO },
  quote:   { from: "Berkeley Nucleonics Sales <sales@berkeleynucleonics.com>", replyTo: "sales@berkeleynucleonics.com" },
  contact: { from: "Berkeley Nucleonics <info@berkeleynucleonics.com>", replyTo: "info@berkeleynucleonics.com" },
  "academy-access": {
    from: "Berkeley Nucleonics Academy <alec@berkeleynucleonicsacademy.com>",
    replyTo: "alec@berkeleynucleonicsacademy.com",
  },
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

// Automated vulnerability scanners (sqlmap and friends) walk every form on the site and
// post injection payloads into whatever fields they find. On 2026-08-01 one of them put
// 257 rows into bnc_form_submissions and 257 notification emails into staff inboxes in
// about two minutes, through the identical handler on the Directed Energy deployment.
// Nothing was ever at risk — this handler talks to Supabase through PostgREST with
// JSON-encoded values, so the payloads were stored as inert text and never reached a SQL
// parser — but the alert storm is real and worth dropping at the door.
//
// These patterns do not occur in legitimate enquiries about pulse or signal generators.
// Kept narrow on purpose: a customer writing "order by 10" in prose will not match,
// because the SQL forms here all require the comment terminator, a function call, or a
// quote/paren prefix.
const PROBE_RE = [
  /\bextractvalue\s*\(/i,
  /\bupdatexml\s*\(/i,
  /\bunion\s+(all\s+)?select\b/i,
  /\bselect\b[\s\S]{0,40}\bfrom\b[\s\S]{0,40}\binformation_schema\b/i,
  /\b(sleep|benchmark|pg_sleep|waitfor\s+delay)\s*\(/i,
  /\border\s+by\s+\d+\s*--/i,
  /['")\]]\s*(and|or)\s+\d+\s*=\s*\d+/i,
  /\bELT\s*\(\s*\d+\s*=\s*\d+/i,
  /0x7e[0-9a-f]*/i,
  /\/\*![0-9]{0,5}/,          // MySQL versioned-comment evasion
  /<script\b|\bonerror\s*=|javascript:/i, // cheap XSS probes ride along in the same scans
];
// Applied ONLY to short structured fields (name, email, company, phone, model), never to
// free prose. A SQL comment terminator or a stray quote-paren is never legitimate in a
// person's name, but "-- John" is an ordinary email sign-off and "order by 10" is a
// sentence a customer might genuinely write, so neither may gate the message body.
const PROBE_RE_FIELD = [
  /--\s*[-\w]*\s*$/,          // trailing SQL comment terminator, e.g. "-- -" / "-- w7srrm"
  /^[^\w]*['"`)\]]+\s*(and|or|union|select)\b/i,
  /\border\s+by\s+\d+\b/i,
];
function looksLikeProbe(text, strict) {
  const s = String(text || "");
  if (!s) return "";
  for (const re of PROBE_RE) if (re.test(s)) return re.source.slice(0, 40);
  if (strict) for (const re of PROBE_RE_FIELD) if (re.test(s)) return re.source.slice(0, 40);
  return "";
}

// Per-IP burst brake. A Vercel function instance is reused between invocations, so this
// catches a scanner that keeps hitting the same warm instance, which is exactly what a
// 2-per-second run does. It is deliberately NOT the primary defence: instances are not
// shared, so a distributed or cold-start-heavy flood slips past it. The real ceiling is
// the Vercel Firewall rate-limit rule on POST /api/form. This is cheap insurance that
// costs no infrastructure and needs no new table.
const BURST = new Map();
const BURST_MAX = Number(process.env.FORM_BURST_MAX || 8);   // submissions...
const BURST_WINDOW_MS = Number(process.env.FORM_BURST_WINDOW_MS || 60000); // ...per minute, per IP
function burstExceeded(ip) {
  if (!ip) return false;
  const now = Date.now();
  const hits = (BURST.get(ip) || []).filter((t) => now - t < BURST_WINDOW_MS);
  hits.push(now);
  BURST.set(ip, hits);
  if (BURST.size > 500) { // keep the map from growing without bound on a long-lived instance
    for (const [k, v] of BURST) if (!v.length || now - v[v.length - 1] > BURST_WINDOW_MS) BURST.delete(k);
  }
  return hits.length > BURST_MAX;
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
// ---------------------------------------------------------------------------
// BNC Academy class catalog (academy-free-access.html).
//
// The landing page posts one checkbox per class, named course_<CODE>, because parseBody
// runs the urlencoded body through Object.fromEntries(new URLSearchParams(...)), which keeps
// only the LAST value of a repeated key. Twenty-one boxes sharing a single `course` name
// would silently collapse to one class.
//
// The submitted VALUE is deliberately ignored. This endpoint is unauthenticated, and the
// class list is echoed back in a DKIM-signed email we send to an address the poster chose,
// so the title always comes from this table and an unknown code is dropped. Keep in sync
// with the checkbox list on academy-free-access.html.
const ACADEMY_CATALOG = {
  NUC01: ["NUC 01", "Nuclear Radiation 101"],
  NUC02: ["NUC 02", "The Fascinating World of Scintillation Detector Technology"],
  NUC03: ["NUC 03", "Identifying Special Nuclear Material (SNM)"],
  NUC04: ["NUC 04", "Thermal Neutron Detectors and Detection"],
  NUC06: ["NUC 06", "The Art of Compton Suppression"],
  NUC07: ["NUC 07", "Nuclear Radiation Basics and Worker Safety"],
  UNT01: ["UNT 01", "SAM 945 / RD-120 User Training"],
  UNT02: ["UNT 02", "SAM 950 User Training"],
  MRF01: ["MRF 01", "RF Boot Camp"],
  MRF02: ["MRF 02", "Demystifying Phase Noise Measurements"],
  MRF03: ["MRF 03", "An Introduction to Radar Principles"],
  MRF04: ["MRF 04", "Introduction to RF Power Measurements"],
  MRF05: ["MRF 05", "Real-Time Spectrum Analysis in Practice"],
  MRF06: ["MRF 06", "Vector Signal Generation and Arbitrary Waveforms"],
  SDR01: ["SDR 01", "Hands-On Software-Defined Radio: SDR++ and SoapySDR"],
  TMI01: ["TMI 01", "Precision Timing Terminology and Fundamentals"],
  TMI02: ["TMI 02", "Advanced Pulse Generation and Precision Timing"],
  QC01:  ["QC 01", "The Nuts and Bolts (and Qubits) of Quantum Computing"],
  QC02:  ["QC 02", "Quantum Computing Instrumentation in Use Today"],
  HPE01: ["HPE 01", "The Nuts and Bolts of High Power Pulse Generators"],
  HPE02: ["HPE 02", "High-Voltage Amplifiers and High-Power Pulse Applications"],
};
// Catalog order, so the email reads in the same order as the page no matter how the
// browser happened to serialize the checkboxes.
const ACADEMY_ORDER = Object.keys(ACADEMY_CATALOG);

// Pull the checked classes out of the body. Marks each course_* key consumed so it does not
// also appear as its own row in the generic "extra fields" table. Returns [[code, title], ...].
function academyPicks(body, consumed) {
  const hit = {};
  for (const k of Object.keys(body)) {
    const m = /^course_([A-Za-z0-9]+)$/.exec(k);
    if (!m) continue;
    if (consumed) consumed.add(k.toLowerCase());
    const code = m[1].toUpperCase();
    if (has(ACADEMY_CATALOG, code)) hit[code] = true;
  }
  return ACADEMY_ORDER.filter((c) => hit[c]).map((c) => ACADEMY_CATALOG[c]);
}

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

// Academy complimentary pass: thank them, list the classes back so they can see we captured
// the right ones, and set the expectation that a human sends the enrollment details. Class
// titles come from ACADEMY_CATALOG, never from the request body.
function ackAcademy({ hello, replyTo, picks, company }) {
  const n = picks.length;
  const shell = ackShell({
    preheader: n
      ? "We have your request for " + n + (n === 1 ? " complimentary class pass." : " complimentary class passes.")
      : "We have your BNC Academy request.",
    heading: "Thank you for your interest in BNC Academy",
    hello,
    intro: n
      ? "Thank you for your interest in Berkeley Nucleonics Academy. We have your request for " +
        (n === 1 ? "a complimentary pass to the class below" : "complimentary passes to the " + n + " classes below") +
        ". Someone from the Academy team will send your enrollment details shortly. There is nothing to pay and nothing else you need to do."
      : "Thank you for your interest in Berkeley Nucleonics Academy. We have your request and someone from the Academy team will follow up shortly.",
    rows: picks.map((p) => [p[0], p[1]]).concat(company ? [["Company", company]] : []),
    callout: "Our classes are written by the engineers who build and support the instruments, so if a question comes up while you are working through one, reply to this email and it will reach someone who can answer it properly.",
    signName: "Berkeley Nucleonics Academy",
    replyTo,
  });
  return Object.assign({
    subject: n
      ? "Thank you for your interest \u00b7 Your BNC Academy " + (n === 1 ? "class pass" : "class passes")
      : "Thank you for your interest in BNC Academy",
  }, shell);
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

// Origins allowed to POST here. This used to answer "*", which let anything on the
// internet submit the form headlessly without ever loading a page — which is how the
// _gotcha honeypot got bypassed wholesale: a bot that never renders the form never sees
// the hidden field to fall for it. Our own properties plus Vercel previews only.
//
// The subdomain wildcard on berkeleynucleonics.com is load-bearing, not decoration. The
// QuickQuote configurator (_shared/bnc-configurator.js, embedded on 24 doc pages) posts to
// a HARDCODED absolute "https://www.berkeleynucleonics.com/api/form?form=configurator"
// with no override wired up anywhere. That is same-origin on production www, but a genuine
// cross-origin POST from draft.berkeleynucleonics.com and from every Vercel preview host.
// Drop those from the allowlist and the configurator fails CORS and silently degrades to a
// mailto: draft, on every non-www host, with no error a visitor would report.
const ORIGIN_OK = /^https:\/\/([a-z0-9-]+\.)*(berkeleynucleonics\.com|directedenergy\.com)$|^https:\/\/bnc-draft-website[a-z0-9-]*\.vercel\.app$/i;

module.exports = async function handler(req, res) {
  const origin = String(req.headers.origin || "");
  if (origin && ORIGIN_OK.test(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
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
    // Set on every silent-drop path (honeypot, bad origin, rate brake, blocklist, probe).
    // The caller still gets a normal-looking success; it just must not count as a conversion.
    const dropped = !!(extra && extra.dropped);
    if (wantsJson) { res.status(200).json(Object.assign({ ok: true }, extra || {})); return; }
    if (next) {
      // A form with _next returns the visitor to the page they came from rather than to
      // thank-you.html, so the conversion never fires there. The ScintIQ configurator does
      // exactly this whenever it is reached with a ?from= param. Carry the signal across:
      // the head block on every page fires `form_submission_complete` when it sees bnc_fs,
      // then strips it from the URL so a refresh cannot double-count. Dropped spam gets the
      // bare redirect, same as it gets thank-you.html without the event.
      const sep = next.indexOf("?") === -1 ? "?" : "&";
      const hash = next.indexOf("#");
      const target = dropped
        ? next
        : hash === -1
          ? next + sep + "bnc_fs=" + encodeURIComponent(type)
          : next.slice(0, hash) + sep + "bnc_fs=" + encodeURIComponent(type) + next.slice(hash);
      res.writeHead(303, { Location: target });
      res.end();
      return;
    }
    // Redirect to the real /thank-you.html rather than rendering an inline page. That page
    // carries the site's tag stack (GTM / Bing UET) and pushes a `form_submission_complete`
    // dataLayer event, so a submit is measurable. The inline page this replaced had no
    // analytics on it at all, which silently killed conversion tracking for every form at
    // the July 2026 cutover off WordPress.
    //
    // A silently-dropped submission still gets the identical thank-you page, so the bot
    // learns nothing and keeps wasting its time — but it carries `nc=1`, which tells
    // thank-you.html to suppress the conversion event. Without this every honeypot hit,
    // blocked sender and vulnerability scan posts a fake lead into GA4 and, once the
    // thank-you conversion is imported, straight into Google Ads Smart Bidding. The
    // 2026-08-01 scanner run alone was 257 requests.
    res.writeHead(303, {
      Location: "/thank-you.html?form=" + encodeURIComponent(type) + (dropped ? "&nc=1" : ""),
    });
    res.end();
  };

  // 1. Honeypot: bots fill _gotcha. Pretend success, drop silently.
  if (body._gotcha) { respondOk({ dropped: "honeypot" }); return; }

  const ip = (req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || "").split(",")[0].trim();

  // 1a. No Origin AND no Referer => nothing that rendered our form. Every browser sends
  // Origin on a cross-origin POST and Referer on a same-origin form submit, so a real
  // visitor always carries at least one. All 257 requests in the 2026-08-01 scanner run
  // had both blank. Drop silently — the bot sees the normal thank-you and learns nothing.
  // Set FORM_REQUIRE_ORIGIN=0 in Vercel to disable without a deploy if this ever misfires.
  //
  // SERVER-TO-SERVER EXEMPTION, and it is load-bearing. Origin and Referer are set by
  // browsers; a server calling us has neither. Two LIVE lead paths forward quotes to this
  // endpoint over PHP curl from briefs.berkeleynucleonics.com:
  //   active-projects/Used Equipment Marketplace/deploy/quote.php
  //   active-projects/Rolling End-of-Year Campaigns/landing-pages/deploy/quote.php
  // Both send `X-Requested-With: XMLHttpRequest` and neither of the browser headers, so a
  // bare Origin/Referer check would silently bin real buyer enquiries. Worse, both treat
  // any 2xx/3xx as success, so our silent drop would ALSO suppress their direct-SendGrid
  // fallback — the safety net that exists so a lead is never lost — and the buyer would
  // still see a success screen. Hence: accept X-Requested-With as the third valid signal.
  //
  // It is a weak signal on its own (any client can send it) and it is not doing the heavy
  // lifting. The scanner sent no such header, and the honeypot, probe filter, burst brake
  // and the Vercel Firewall rate-limit rule all still apply underneath it. If those PHP
  // bridges are ever redeployed with an explicit `Origin: https://briefs.berkeleynucleonics.com`
  // header, this exemption can be dropped.
  const referer = String(req.headers.referer || "");
  const xhr = /XMLHttpRequest/i.test(String(req.headers["x-requested-with"] || ""));
  if (process.env.FORM_REQUIRE_ORIGIN !== "0" && !origin && !referer && !xhr) {
    respondOk({ dropped: "no-origin" }); return;
  }
  // 1b. Origin present but not ours: someone else's page is posting at our endpoint.
  if (origin && !ORIGIN_OK.test(origin)) { respondOk({ dropped: "bad-origin" }); return; }

  // 1c. Burst brake (see burstExceeded). Silent, so a scanner gets no signal to back off.
  if (burstExceeded(ip)) { respondOk({ dropped: "rate" }); return; }

  // 2. Spam: Turnstile (only enforced once TURNSTILE_SECRET is set)
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

  // 2c-bis. Automated vulnerability scan (SQL injection / XSS payloads). The whole
  // submission is checked against the broad patterns; the short structured fields
  // additionally get the strict ones, which would be unsafe against free prose. Dropped
  // before Nutshell, Supabase and the notification, so a scanner run costs one silent 303
  // instead of an inbox full of alerts and a CRM full of junk contacts.
  const _probe = looksLikeProbe(_blob) ||
    looksLikeProbe(name, true) || looksLikeProbe(email, true) ||
    looksLikeProbe(company, true) || looksLikeProbe(phone, true) || looksLikeProbe(modelField, true);
  if (_probe) { respondOk({ dropped: "probe" }); return; }

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

  // Academy pass requests arrive as one checkbox per class. Resolve them against the
  // server-side catalog first, so the course_* keys are marked consumed and do not each
  // land as their own row in the generic extra-field table below.
  const acadPicks = academyPicks(body, consumed);

  // Collect the "extra" fields (everything not reserved / not the standard four) for the note + email + log.
  const extra = {};
  for (const k of Object.keys(body)) {
    if (RESERVED[k] || consumed.has(k.toLowerCase())) continue;
    const v = body[k];
    if (v != null && String(v).trim() !== "") extra[k] = String(v).slice(0, 4000);
  }

  // One readable line for the internal notice, the Nutshell note and the Supabase row,
  // in place of twenty-one course_* rows.
  if (acadPicks.length) {
    extra["Classes requested"] = acadPicks.map((p) => p[0] + " " + p[1]).join("\n");
    extra["Classes requested count"] = String(acadPicks.length);
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
          // The client IP rides inside the existing `fields` jsonb as _ip rather than a new
          // column, so this needs no migration. It is what turns "257 junk rows" into "257
          // junk rows from one address" when the next scan comes through.
          fields: Object.assign({}, extra, ip ? { _ip: ip } : {}),
          page: (req.headers.referer || "").slice(0, 500),
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
  // FORM_NOTIFY_OFF=1 stops the internal alert storm during an attack without a deploy.
  // (FORM_ACK_OFF only silences the CUSTOMER acknowledgement, which is the other half.)
  if (smtpConfigured() && process.env.FORM_NOTIFY_OFF !== "1" && type !== "pdf-config" && type !== "quiz") {
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
        .concat(ip ? [["IP", ip]] : [])
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
      } else if (type === "academy-access") {
        ack = ackAcademy({ hello, replyTo: id.replyTo, picks: acadPicks, company });
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
module.exports.ackAcademy = ackAcademy;
module.exports.ackIdentity = ackIdentity;
module.exports.ACK_BCC = ACK_BCC;
