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

// Branded "Thank you" page shown after a non-JSON form submit. Back and the 10s
// idle timer both go history.go(-2): the submit is one history entry and the form
// page another, so -2 lands the visitor back on the product page they came from.
const THANK_YOU_HTML = `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Thank you &mdash; Berkeley Nucleonics</title>
<style>
  *{box-sizing:border-box}
  html,body{height:100%}
  body{margin:0;font-family:'Myriad Pro',Arial,Helvetica,sans-serif;color:#113163;
    background:#eef3f9;background-image:radial-gradient(1100px 520px at 50% -8%,#ffffff 0%,#e7eef8 70%);
    display:flex;flex-direction:column;min-height:100%}
  .wrap{flex:1;display:flex;align-items:center;justify-content:center;padding:30px 18px}
  .card{background:#fff;max-width:620px;width:100%;border-radius:4px;overflow:hidden;text-align:center;
    box-shadow:0 12px 44px rgba(17,49,99,.13);border:1px solid #e1e8f2}
  .bar{height:6px;background:linear-gradient(90deg,#113163 0%,#0655a3 55%,#2a9fd6 100%)}
  .brand{margin:22px 0 0;font-size:12px;font-weight:bold;letter-spacing:.16em;text-transform:uppercase;color:#0655a3}
  .brand span{display:block;margin-top:4px;font-size:10px;font-weight:normal;letter-spacing:.06em;color:#8091a8}
  .figs{display:flex;justify-content:center;align-items:flex-end;gap:6px;margin:16px 0 2px}
  .figs img{height:148px;width:auto;display:block}
  h1{color:#0655a3;font-size:29px;margin:8px 0 10px}
  .msg{font-size:16px;line-height:1.62;color:#37475f;margin:0 auto;max-width:460px;padding:0 8px}
  .actions{margin:24px 0 8px}
  .btn{display:inline-block;background:#0655a3;color:#fff;text-decoration:none;font-weight:bold;font-size:15px;
    padding:12px 28px;border-radius:4px;box-shadow:0 3px 10px rgba(6,85,163,.22);transition:background .15s}
  .btn:hover{background:#113163}
  .hint{font-size:12.5px;color:#8091a8;margin:14px 0 28px}
  .hint b{color:#0655a3}
  footer{background:#113163;color:#c7d5ea;font-size:12px;line-height:1.7;text-align:center;padding:18px 16px}
  footer a{color:#fff;text-decoration:none;font-weight:bold}
  footer a:hover{text-decoration:underline}
  footer .sep{color:#4a5f85;margin:0 8px}
  footer .fine{display:block;margin-top:6px;color:#8ea4c6}
</style>
<body>
  <div class="wrap">
    <div class="card">
      <div class="bar"></div>
      <p class="brand">Berkeley Nucleonics<span>Precision Instrumentation &middot; Since 1969</span></p>
      <div class="figs">
        <img src="/figures/wp/thankyou-eng-wave.png" alt="">
        <img src="/figures/wp/thankyou-eng-thanks.png" alt="">
      </div>
      <h1>Thank you</h1>
      <p class="msg">Your request is in. A Berkeley Nucleonics specialist will review it and follow up shortly. We will take you right back to the page you were viewing.</p>
      <div class="actions">
        <a class="btn" href="#" onclick="goBack();return false;">&larr; Back to what you were viewing</a>
        <p class="hint">Returning automatically in <b id="cd">10</b> seconds&hellip;</p>
      </div>
    </div>
  </div>
  <footer>
    <a href="https://www.berkeleynucleonics.com/" target="_blank" rel="noopener">Home</a><span class="sep">|</span>
    <a href="https://www.berkeleynucleonics.com/products" target="_blank" rel="noopener">Products</a><span class="sep">|</span>
    <a href="https://www.berkeleynucleonics.com/contact" target="_blank" rel="noopener">Contact</a>
    <span class="fine">&copy; Berkeley Nucleonics Corporation &middot; 2955 Kerner Blvd, San Rafael, CA 94901 &middot; +1 (800) 234-7858</span>
  </footer>
  <script>
    function goBack(){ try{ history.go(-2); }catch(e){ try{ history.back(); }catch(_){} } }
    var n=10, el=document.getElementById('cd');
    var iv=setInterval(function(){ n-=1; if(el){ el.textContent=(n>0?n:0); } if(n<=0){ clearInterval(iv); goBack(); } },1000);
    function reset(){ n=10; if(el){ el.textContent=n; } }
    ['mousemove','mousedown','keydown','touchstart','scroll','wheel'].forEach(function(ev){
      window.addEventListener(ev, reset, {passive:true});
    });
  </script>
</body>`;

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
};
const DEFAULT_NOTIFY = "website@berkeleynucleonics.com";
// Per-form-type recipients (override DEFAULT_NOTIFY; a FORM_NOTIFY_<TYPE> env var still wins over this).
const TYPE_NOTIFY = {
  rma: "operations@berkeleynucleonics.com",          // RMA repair / authorization request
  "rma-status": "operations@berkeleynucleonics.com", // RMA status check
};
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

function notifyList(type) {
  const key = "FORM_NOTIFY_" + String(type || "").toUpperCase().replace(/[^A-Z]+/g, "_");
  const raw = process.env[key] || TYPE_NOTIFY[type] || process.env.FORM_NOTIFY_TO || DEFAULT_NOTIFY;
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
  const respondOk = (extra) => {
    if (wantsJson) { res.status(200).json(Object.assign({ ok: true }, extra || {})); return; }
    if (next) { res.writeHead(303, { Location: next }); res.end(); return; }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).end(THANK_YOU_HTML);
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

  // 2d. Route-to-David signals (keep the lead, just send the notice to David — he triages):
  //   - foreign-language / strange-character body (non-Latin script or many non-ASCII chars)
  //   - free consumer mailbox (gmail / yahoo / aol / ...) — B2B buyers use corporate email
  const _nonAscii = (_blob.match(/[^\x00-\x7F]/g) || []).length;
  const _freeMbox = /@(gmail|googlemail|yahoo|ymail|rocketmail|aol|hotmail|outlook|live|icloud|proton|protonmail|gmx)\.[a-z.]+$/i.test(email);
  const routeToDavid = _scr.otherForeign || _nonAscii >= 8 || _freeMbox;
  const routeReason = _scr.otherForeign || _nonAscii >= 8 ? "foreign/strange" : (_freeMbox ? "consumer-mailbox" : "");

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

  // 3b. Nutshell find-or-create + note (best-effort; single deduped CRM path).
  // Guarded by an atomic Supabase claim so two racing submits of the same email can't
  // both create a contact (the root cause of the duplicate pairs).
  let nutshell = null;
  if (email && email.indexOf("@") > 0 && N.hasCreds()) {
    try {
      let contact = await N.findContactByEmail(email);
      let created = false;
      if (!contact && routeToDavid) {
        // gmail/yahoo/consumer + foreign submissions: do NOT auto-create a contact.
        // David's triage email gets a "Create contact" button so he decides, then routes
        // to a rep. (An already-existing contact still gets the note below.)
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

  // 5. SendGrid notification (best-effort; the lead is already saved above either way)
  if (smtpConfigured()) {
    try {
      // Preview-friendly fields: spaced name, best-effort model, and New vs Repeat
      // (from whether Nutshell just created the contact). These lead the email so the
      // inbox snippet reads "Jane Doe · jane@acme.com · Contact Us Form · Model 845 · New".
      const nm = displayName(name);
      const model = guessModel(modelField, req.headers.referer);
      const newRepeat = nutshell && typeof nutshell.created === "boolean" ? (nutshell.created ? "New" : "Repeat") : "";
      const previewParts = [];
      if (nm) { previewParts.push(nm); if (email) previewParts.push(email); }
      else if (email) previewParts.push(email);
      previewParts.push(label);
      if (model) previewParts.push("Model " + model);
      if (newRepeat) previewParts.push(newRepeat);
      const preview = previewParts.join("  ·  ");

      // Table leads with Name/Email; "Type" is dropped (the heading already says it).
      const rows = [["Name", nm || name], ["Email", email], ["Company", company], ["Phone", phone], ["Model", model], ["Status", newRepeat]]
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
      // auto-create, when we have the submission id + BLOCK_KEY. Lets David add them to
      // Nutshell on demand and then route to a rep.
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
        (nutshell && nutshell.contactId ? '<p style="color:#6b7a90;font-size:12px">Nutshell: ' + esc(nutshell.contactId) + (nutshell.created ? " (new)" : " (updated)") + "</p>" : "") +
        '<p style="color:#6b7a90;font-size:12px">Page: ' + esc(req.headers.referer || "") + "</p>" + createBtn + vendorBtn + blockBtn + "</div>";
      // Route foreign-language / strange / consumer-mailbox submissions to David (he triages
      // them), everyone else to the normal per-type inbox. Tag the subject so it's obvious why.
      const to = routeToDavid ? ["david.brown@berkeleynucleonics.com"] : notifyList(type);
      const routeTag = routeToDavid ? (routeReason === "consumer-mailbox" ? " · Consumer email" : " · Foreign/strange") : "";
      await sendMail({
        to,
        subject: "[BNC Site] " + label + (nm || email ? " — " + (nm || email) : "") + (model ? " · Model " + model : "") + (newRepeat ? " · " + newRepeat : "") + routeTag,
        html, text: preview,
        replyTo: email || undefined,
      });
    } catch (_) {}
  }

  respondOk({ nutshell });
};
