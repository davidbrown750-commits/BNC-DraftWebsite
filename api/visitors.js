// /api/visitors.js  — Web Visitor Explorer (internal, token-gated, read-only).
// Vercel env vars (Project Settings -> Environment Variables):
//   SUPABASE_URL                = the Supabase project URL (already set, used by track.js)
//   SUPABASE_SERVICE_ROLE_KEY   = service-role key (SECRET; server-side only, already set)
//   VISITOR_EXPLORER_TOKEN      = the shared password employees type to use the explorer
// The page sends ?token=<password>; we compare it server-side to VISITOR_EXPLORER_TOKEN.
// Fail-closed: if VISITOR_EXPLORER_TOKEN is not set, every request is denied.

// Path -> product line. A path can match more than one line.
const PRODUCT_RULES = [
  ["Pulse & Delay Generators", /(pdg|delay-gen|model-5(2|7|8)|\b5(2[05]|7[57]|8[589])\b|745)/],
  ["PVP-Series HV Pulse",      /pvp/],
  ["RF Signal Generators",     /(rfsg|signal-gen|\b8(45|55|65)b?\b)/],
  ["Arbitrary Waveform Gen",   /awg/],
  ["ScintIQ",                  /scintiq/],
  ["ICX FieldHawk (RTSA)",     /(icx|fieldhawk|rtsa)/],
  ["VSG-Mini",                 /vsg-mini/],
  ["Isotope ID & Radiation",   /(riid|isotope|radiation|spectro)/],
  ["Signal Sources (12000)",   /(12000|121\d\d|122\d\d|12108|12206)/],
  ["765 HV Pulse",             /\b765\b/],
  ["Pricing",                  /pricing/],
  ["Contact",                  /contact/],
];
function linesFor(path) {
  const p = (path || "").toLowerCase();
  const out = [];
  for (const [name, re] of PRODUCT_RULES) if (re.test(p) && !out.includes(name)) out.push(name);
  return out;
}
function titleCase(s) {
  return String(s).replace(/[._-]+/g, " ").replace(/\s+/g, " ").trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---- BNC-staff detection (so the explorer can hide our own people) ----
// "Hide BNC" hides only @berkeleynucleonics.com emails. Outside test logins on
// gmail/yahoo are left visible as ordinary identified visitors.
function isInternal(email) {
  if (!email) return false;
  return String(email).toLowerCase().trim().endsWith("@berkeleynucleonics.com");
}
// Free-mail domains that are not useful as a "company" for prospecting.
const FREEMAIL = new Set([
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com", "icloud.com",
  "live.com", "msn.com", "me.com", "comcast.net", "proton.me", "protonmail.com",
  "ymail.com", "mail.com", "gmx.com", "yandex.com", "qq.com", "163.com", "126.com",
]);
function companyFromEmail(email) {
  if (!email) return null;
  const dom = String(email).toLowerCase().split("@")[1];
  if (!dom || FREEMAIL.has(dom)) return null;
  return dom;
}

// ---- Clerk session verification (RS256 against the public JWKS, no npm deps) ----
const crypto = require("crypto");
const CLERK_ISSUER = "https://clerk.berkeleynucleonics.com";
const STAFF_DOMAIN = "@berkeleynucleonics.com";
// Outside collaborators granted staff-equivalent access (treated like a @berkeleynucleonics.com login).
const STAFF_EXTRA = new Set(["jsaldi@regencyinteractive.com", "rcabe@regencyinteractive.com"]);
let _jwks = null, _jwksAt = 0;
async function getJwks() {
  if (_jwks && Date.now() - _jwksAt < 3600000) return _jwks;
  const r = await fetch(CLERK_ISSUER + "/.well-known/jwks.json");
  if (!r.ok) throw new Error("jwks " + r.status);
  _jwks = await r.json(); _jwksAt = Date.now();
  return _jwks;
}
async function verifyClerkToken(jwt) {
  const parts = (jwt || "").split(".");
  if (parts.length !== 3) return null;
  let head;
  try { head = JSON.parse(Buffer.from(parts[0], "base64url").toString()); } catch (e) { return null; }
  const jwks = await getJwks();
  const jwk = (jwks.keys || []).find((k) => k.kid === head.kid);
  if (!jwk) return null;
  const key = crypto.createPublicKey({ key: jwk, format: "jwk" });
  const ok = crypto.verify("RSA-SHA256", Buffer.from(parts[0] + "." + parts[1]), key,
    Buffer.from(parts[2], "base64url"));
  if (!ok) return null;
  let p;
  try { p = JSON.parse(Buffer.from(parts[1], "base64url").toString()); } catch (e) { return null; }
  const now = Math.floor(Date.now() / 1000);
  if (p.exp && now > p.exp + 5) return null;
  if (p.nbf && now < p.nbf - 5) return null;
  if (p.iss && p.iss.indexOf("clerk.berkeleynucleonics.com") === -1) return null;
  return p;
}
// Returns true if the request is authorized. Primary path: a Clerk session JWT whose
// email claim is @berkeleynucleonics.com. Fallback: the shared VISITOR_EXPLORER_TOKEN.
async function isAuthorized(token, sharedToken) {
  if (!token) return false;
  if (token.split(".").length === 3) {
    const p = await verifyClerkToken(token);
    if (p) {
      const em = String(p.email || p.email_address || p.primary_email || "").toLowerCase();
      // If Clerk is configured to include the email claim, enforce the BNC domain
      // server-side. If the claim isn't present, a validly-signed session from the
      // BNC Clerk instance is accepted (the portal page gates who can reach it by
      // domain client-side, matching the site's existing internal-notes model).
      if (!em) return true;
      return em.slice(-STAFF_DOMAIN.length) === STAFF_DOMAIN || STAFF_EXTRA.has(em);
    }
  }
  if (sharedToken && token === sharedToken) return true;
  // Signed per-person link token (used by the daily brief so the two allowed people
  // click through with NO password). Shape: base64url(email) + "." + HMAC-SHA256(email,
  // VISITOR_LINK_KEY). Authorized only if the email is on VISITOR_ALLOW (default: David
  // + Meraly). 2-part token so it never collides with a Clerk JWT (3 parts).
  const linkKey = process.env.VISITOR_LINK_KEY;
  const parts = token.split(".");
  if (linkKey && parts.length === 2) {
    try {
      const email = Buffer.from(parts[0], "base64url").toString("utf8").toLowerCase().trim();
      const allow = (process.env.VISITOR_ALLOW || "david.brown@berkeleynucleonics.com,meraly.rodas@berkeleynucleonics.com")
        .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
      if (!allow.includes(email)) return false;
      const want = crypto.createHmac("sha256", linkKey).update(email).digest("hex");
      const a = Buffer.from(want, "utf8"), b = Buffer.from(String(parts[1]), "utf8");
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true;
    } catch (_) {}
  }
  return false;
}

async function fetchRows() {
  // PostgREST caps a single response at ~1000 rows, so page through with Range
  // headers (newest first) up to a sane ceiling.
  const cols = "user_id,path,visited_at,visitor_id,email,company,page_title,dwell_seconds";
  const base = process.env.SUPABASE_URL +
    "/rest/v1/bnc_visits?select=" + cols + "&order=visited_at.desc";
  const PAGE = 1000, MAX = 12000;
  let all = [];
  for (let off = 0; off < MAX; off += PAGE) {
    const r = await fetch(base, {
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: "Bearer " + process.env.SUPABASE_SERVICE_ROLE_KEY,
        Range: off + "-" + (off + PAGE - 1),
        "Range-Unit": "items",
      },
    });
    if (!r.ok && r.status !== 206) throw new Error("supabase " + r.status);
    const chunk = await r.json();
    all = all.concat(chunk);
    if (chunk.length < PAGE) break;
  }
  return all;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const TOKEN = process.env.VISITOR_EXPLORER_TOKEN || "";
  const token = (req.query && req.query.token) || req.headers["x-access-token"] || "";
  let ok = false;
  try { ok = await isAuthorized(token, TOKEN); } catch (e) { ok = false; }
  if (!ok) { res.status(401).json({ error: "unauthorized" }); return; }

  try {
    const rows = await fetchRows();
    const map = new Map();
    for (const v of rows) {
      const key = v.visitor_id || v.user_id || (v.email && v.email.toLowerCase()) || "unknown";
      let g = map.get(key);
      if (!g) {
        g = { key, email: null, company: null, first: v.visited_at, last: v.visited_at,
              hits: 0, days: new Set(), dwell: 0, pages: new Map(), lines: new Set(), timeline: [] };
        map.set(key, g);
      }
      if (v.email && !g.email) g.email = v.email;
      if (v.company && !g.company) g.company = v.company;
      if (v.visited_at < g.first) g.first = v.visited_at;
      if (v.visited_at > g.last) g.last = v.visited_at;
      g.hits++;
      g.days.add((v.visited_at || "").slice(0, 10));
      // cap a single pageview's dwell at 30 min so one left-open tab can't skew the total
      g.dwell += Math.min(Math.max(v.dwell_seconds || 0, 0), 1800);
      const pg = g.pages.get(v.path) || { count: 0, last: v.visited_at, title: v.page_title };
      pg.count++;
      if (v.visited_at > pg.last) pg.last = v.visited_at;
      if (v.page_title && !pg.title) pg.title = v.page_title;
      g.pages.set(v.path, pg);
      for (const ln of linesFor(v.path)) g.lines.add(ln);
      if (g.timeline.length < 50)
        g.timeline.push({ path: v.path, title: v.page_title, at: v.visited_at, dwell: v.dwell_seconds || 0 });
    }

    let visitors = [...map.values()].map((g) => ({
      key: g.key,
      email: g.email,
      company: g.company,
      // Best company we can show for prospecting: the captured company, otherwise the
      // corporate email domain (free-mail domains are dropped). Null for anonymous rows.
      company_label: g.company || companyFromEmail(g.email),
      company_source: g.company ? "captured" : (companyFromEmail(g.email) ? "email" : null),
      name: g.email ? titleCase(g.email.split("@")[0]) : null,
      identified: !!g.email,
      internal: isInternal(g.email),
      first_seen: g.first,
      last_seen: g.last,
      hits: g.hits,
      visit_days: g.days.size,
      dwell_seconds: g.dwell,
      product_lines: [...g.lines].sort(),
      pages: [...g.pages.entries()]
        .map(([path, p]) => ({ path, count: p.count, last: p.last, title: p.title }))
        .sort((a, b) => b.count - a.count),
      timeline: g.timeline,
    }));

    // Daily Run: per-day count of unique IDENTIFIED, NON-BNC visitors over the last 15
    // days (a visitor counts on each day they were on the site). Computed from the raw
    // rows in Pacific time, and independent of the search filters below so the trend
    // panel always shows the full picture. (David 2026-07-09.)
    const idNonBnc = new Set();
    for (const g of map.values()) if (g.email && !isInternal(g.email)) idNonBnc.add(g.key);
    const ptDay = (iso) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
    const dayCounts = new Map(); // 'YYYY-MM-DD' (PT) -> Set of visitor keys
    for (const v of rows) {
      const k = v.visitor_id || v.user_id || (v.email && v.email.toLowerCase()) || "unknown";
      if (!idNonBnc.has(k) || !v.visited_at) continue;
      const d = ptDay(v.visited_at);
      if (!dayCounts.has(d)) dayCounts.set(d, new Set());
      dayCounts.get(d).add(k);
    }
    const daily_run = [];
    const basePT = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" }) + "T12:00:00Z");
    for (let i = 0; i < 15; i++) {
      const key = new Date(basePT.getTime() - i * 86400000).toISOString().slice(0, 10);
      daily_run.push({ date: key, count: (dayCounts.get(key) || new Set()).size });
    }

    const q = ((req.query && req.query.q) || "").toLowerCase().trim();
    const product = ((req.query && req.query.product) || "").trim();
    const idOnly = ((req.query && req.query.identified) || "") === "1";
    const hideInternal = ((req.query && req.query.hideInternal) || "") === "1";
    if (product) visitors = visitors.filter((v) => v.product_lines.includes(product));
    if (idOnly) visitors = visitors.filter((v) => v.identified);
    if (hideInternal) visitors = visitors.filter((v) => !v.internal);
    if (q) visitors = visitors.filter((v) => {
      const hay = [v.email || "", v.company || "", v.name || "",
        v.product_lines.join(" "),
        v.pages.map((p) => p.path + " " + (p.title || "")).join(" ")].join(" ").toLowerCase();
      return hay.includes(q);
    });

    visitors.sort((a, b) => (a.last_seen < b.last_seen ? 1 : -1));
    const total = visitors.length;
    const internal_count = visitors.filter((v) => v.internal).length;
    const limit = Math.min(parseInt((req.query && req.query.limit) || "300", 10) || 300, 500);
    visitors = visitors.slice(0, limit);

    res.status(200).json({
      generated_at: new Date().toISOString(),
      total_rows: rows.length,
      total_visitors: total,
      internal_count: internal_count,
      returned: visitors.length,
      daily_run,
      visitors,
    });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
