// Lobby display screens: storage, editing and delivery.
//
// Two audiences, two gates:
//   - The screens themselves (a TV in reception) read with the bnc_sign cookie set by
//     the password login, or the existing ?k= feed key. See lib/lobby-gate.js.
//   - The dashboard writes with a Clerk session token, and only from a
//     @berkeleynucleonics.com address. That check is here, server-side; the reveal in
//     the dashboard page is presentation only and enforces nothing.
//
// Screens live as JSON objects in the private Supabase bucket `lobby-screens`, one per
// screen at screens/<id>.json. Artwork goes to the public bucket `lobby-media`.
// Storage rather than a table because a screen is a single document that is read whole
// and written whole, and because provisioning a bucket needs no schema migration.
// Visitor names are the reason `lobby-screens` is private and `lobby-media` is not.
const { verifyClerkToken } = require("../lib/clerk");
const { signedIn } = require("../lib/lobby-gate");

const SB = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DOC_BUCKET = "lobby-screens";
const MEDIA_BUCKET = "lobby-media";

const STAFF_DOMAIN = "@berkeleynucleonics.com";
const STAFF_EXTRA = ["davidbrown750@gmail.com"];

const KINDS = new Set(["visitor", "didyouknow", "announcements"]);
const ID_RE = /^[a-z0-9][a-z0-9-]{0,48}$/;
const MAX_VISITORS = 4;
const MAX_IMAGES = 4;
const MAX_ITEMS = 12;
const MAX_BODY_CHARS = 1200;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const DATA_URL_RE = /^data:(image\/(png|jpeg|webp|svg\+xml));base64,([A-Za-z0-9+/=\s]+)$/;

function isStaffEmail(e) {
  e = String(e || "").toLowerCase();
  if (!e) return false;
  if (e.length > STAFF_DOMAIN.length && e.slice(-STAFF_DOMAIN.length) === STAFF_DOMAIN) return true;
  return STAFF_EXTRA.indexOf(e) !== -1;
}

// Returns the caller's email, or null. Deliberately refuses a valid session that
// carries no email claim: this writes to a customer-facing screen, so "some valid
// session" is not good enough. Same posture as api/lobby.js.
async function caller(req) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token || token.split(".").length !== 3) return null;
  const p = await verifyClerkToken(token);
  if (!p) return null;
  const em = String(p.email || p.email_address || p.primary_email || "").toLowerCase();
  return isStaffEmail(em) ? em : null;
}

function sb(path, opts) {
  const o = opts || {};
  return fetch(SB + path, {
    method: o.method || "GET",
    headers: Object.assign({
      apikey: SB_KEY,
      Authorization: "Bearer " + SB_KEY,
    }, o.headers || {}),
    body: o.body,
  });
}

function clean(v, max) {
  return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);
}

// Only ever accept artwork URLs we produced. Without this the dashboard could be
// talked into pointing a screen at any host on the internet.
function safeMediaUrl(v) {
  const s = String(v || "").trim();
  if (!s) return "";
  const prefix = SB + "/storage/v1/object/public/" + MEDIA_BUCKET + "/";
  return s.startsWith(prefix) ? s : "";
}

function normalise(input, who) {
  const kind = String(input.kind || "").trim();
  if (!KINDS.has(kind)) throw new Error("unknown screen kind");
  const out = {
    id: String(input.id || "").trim().toLowerCase(),
    kind,
    title: clean(input.title, 60) || input.id,
    enabled: input.enabled !== false,
    background: safeMediaUrl(input.background),
    updated_at: new Date().toISOString(),
    updated_by: who,
  };
  if (!ID_RE.test(out.id)) throw new Error("id must be lower-case letters, numbers and dashes");

  if (kind === "visitor") {
    out.heading = clean(input.heading, 60) || "Welcome";
    out.visitors = (Array.isArray(input.visitors) ? input.visitors : [])
      .slice(0, MAX_VISITORS)
      .map((v) => ({
        time: clean(v && v.time, 24),
        name: clean(v && v.name, 60),
        company: clean(v && v.company, 60),
        logo: safeMediaUrl(v && v.logo),
      }))
      .filter((v) => v.name || v.company);
  } else if (kind === "announcements") {
    // The notices that ride in the lobby sign's amber slot. A dated item drops off on
    // its own the day after it runs, so nobody has to remember to take it down.
    out.heading = clean(input.heading, 60) || "Lobby sign notices";
    out.items = (Array.isArray(input.items) ? input.items : [])
      .slice(0, MAX_ITEMS)
      .map((it) => ({
        title: clean(it && it.title, 90),
        detail: clean(it && it.detail, 160),
        until: /^\d{4}-\d{2}-\d{2}$/.test(String((it && it.until) || "")) ? String(it.until) : "",
      }))
      .filter((it) => it.title);
  } else {
    out.heading = clean(input.heading, 60) || "Did You Know?";
    // Free text keeps its line breaks; only the length is capped. The screen renders
    // it as text, never as markup.
    out.body = String(input.body == null ? "" : input.body).slice(0, MAX_BODY_CHARS);
    out.images = (Array.isArray(input.images) ? input.images : [])
      .slice(0, MAX_IMAGES).map(safeMediaUrl).filter(Boolean);
  }
  return out;
}

async function listScreens() {
  const r = await sb("/storage/v1/object/list/" + DOC_BUCKET, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prefix: "screens/", limit: 200, sortBy: { column: "name", order: "asc" } }),
  });
  if (!r.ok) return [];
  const rows = await r.json();
  const out = [];
  for (const row of rows) {
    if (!row.name || !row.name.endsWith(".json")) continue;
    const doc = await readScreen(row.name.replace(/\.json$/, ""));
    if (doc) out.push(doc);
  }
  return out;
}

async function readScreen(id) {
  if (!ID_RE.test(id)) return null;
  const r = await sb("/storage/v1/object/" + DOC_BUCKET + "/screens/" + id + ".json");
  if (!r.ok) return null;
  try { return await r.json(); } catch { return null; }
}

async function writeScreen(doc) {
  const r = await sb("/storage/v1/object/" + DOC_BUCKET + "/screens/" + doc.id + ".json", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-upsert": "true" },
    body: JSON.stringify(doc),
  });
  return r.ok;
}

async function uploadMedia(purpose, dataUrl, name) {
  const m = DATA_URL_RE.exec(String(dataUrl || "").trim());
  if (!m) throw new Error("image must be a png, jpeg, webp or svg data URL");
  const mime = m[1];
  const bytes = Buffer.from(m[3].replace(/\s+/g, ""), "base64");
  if (!bytes.length) throw new Error("image was empty");
  if (bytes.length > MAX_IMAGE_BYTES) throw new Error("image is larger than 4 MB");
  const ext = mime === "image/png" ? "png" : mime === "image/jpeg" ? "jpg"
    : mime === "image/webp" ? "webp" : "svg";
  const dir = ["logo", "background", "image"].indexOf(purpose) !== -1 ? purpose : "image";
  const slug = String(name || "art").toLowerCase().replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "").slice(0, 40) || "art";
  const path = `${dir}/${slug}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const r = await sb("/storage/v1/object/" + MEDIA_BUCKET + "/" + path, {
    method: "POST",
    headers: { "Content-Type": mime, "x-upsert": "true" },
    body: bytes,
  });
  if (!r.ok) throw new Error("upload failed (" + r.status + ")");
  return SB + "/storage/v1/object/public/" + MEDIA_BUCKET + "/" + path;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }

  if (!SB || !SB_KEY) { res.status(503).json({ ok: false, error: "storage not configured" }); return; }

  try {
    // ---- display read: the screen itself, behind the lobby password ----
    if (req.method === "GET" && req.query && req.query.id && !req.query.action) {
      if (!signedIn(req)) { res.status(401).json({ ok: false, error: "locked" }); return; }
      const doc = await readScreen(String(req.query.id).toLowerCase());
      if (!doc) { res.status(404).json({ ok: false, error: "no such screen" }); return; }
      res.status(200).json({ ok: true, screen: doc });
      return;
    }

    // ---- everything below is staff-only ----
    const who = await caller(req);
    if (!who) { res.status(403).json({ ok: false, error: "staff sign-in required" }); return; }

    if (req.method === "GET") {
      const action = String((req.query && req.query.action) || "list");
      if (action === "get") {
        const doc = await readScreen(String(req.query.id || "").toLowerCase());
        if (!doc) { res.status(404).json({ ok: false, error: "no such screen" }); return; }
        res.status(200).json({ ok: true, screen: doc, you: who });
        return;
      }
      res.status(200).json({ ok: true, screens: await listScreens(), you: who });
      return;
    }

    if (req.method !== "POST") { res.status(405).json({ ok: false, error: "method not allowed" }); return; }

    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
    body = body || {};
    const action = String(body.action || "");

    if (action === "upload") {
      const url = await uploadMedia(body.purpose, body.image, body.name);
      res.status(200).json({ ok: true, url });
      return;
    }

    if (action === "save") {
      const doc = normalise(body.screen || {}, who);
      if (!(await writeScreen(doc))) { res.status(502).json({ ok: false, error: "could not save" }); return; }
      res.status(200).json({ ok: true, screen: doc });
      return;
    }

    if (action === "delete") {
      const id = String(body.id || "").toLowerCase();
      if (!ID_RE.test(id)) { res.status(400).json({ ok: false, error: "bad id" }); return; }
      const r = await sb("/storage/v1/object/" + DOC_BUCKET, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefixes: ["screens/" + id + ".json"] }),
      });
      res.status(r.ok ? 200 : 502).json({ ok: r.ok });
      return;
    }

    res.status(400).json({ ok: false, error: "unknown action" });
  } catch (err) {
    res.status(400).json({ ok: false, error: String((err && err.message) || err) });
  }
};
