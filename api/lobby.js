/* /api/lobby — submission and moderation for the lobby sign.
 *
 * Staff post items here; nothing reaches the screen in reception until an approver
 * releases it. The sign itself never calls this endpoint — it reads /api/lobby-feed,
 * which only ever returns approved rows.
 *
 * Every call needs a Clerk session token from a @berkeleynucleonics.com account
 * (same rule as /api/internal-doc). Approver actions need the caller to also be on
 * the approver list.
 *
 * Actions
 *   GET  ?action=mine                     the caller's own posts, newest first
 *   GET  ?action=pending                  everything awaiting review (approvers)
 *   GET  ?action=live                     approved and not yet expired (approvers)
 *   POST {action:"submit", ...}           create a pending post
 *   POST {action:"review", id, decision}  approve or decline (approvers)
 *   POST {action:"remove", id}            pull a live post (approver, or own post)
 *
 * Storage: Supabase table bnc_lobby_posts, photos in the "lobby" storage bucket.
 * See LOBBY-SETUP.md for the DDL and the env vars.
 */
const { verifyClerkToken } = require("../lib/clerk");

const TABLE = "bnc_lobby_posts";
const BUCKET = "lobby";
const STAFF_DOMAIN = "@berkeleynucleonics.com";
const STAFF_EXTRA = new Set([
  "davidbrown750@gmail.com",
  "jsaldi@regencyinteractive.com",
  "rcabe@regencyinteractive.com",
]);
const KINDS = new Set(["announcement", "shoutout", "photo", "riddle"]);

// Field caps. Generous enough for real posts, tight enough that nothing can push the
// sign's layout around or turn a text field into a payload.
const MAX = { title: 90, detail: 160, answer: 80, name: 80, reason: 200 };
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

function sb(path, opts) {
  const o = opts || {};
  return fetch(process.env.SUPABASE_URL + "/rest/v1/" + path, {
    method: o.method || "GET",
    headers: Object.assign(
      {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: "Bearer " + process.env.SUPABASE_SERVICE_ROLE_KEY,
        "Content-Type": "application/json",
      },
      o.headers || {}
    ),
    body: o.body ? JSON.stringify(o.body) : undefined,
  });
}

function approvers() {
  const raw = String(process.env.LOBBY_APPROVERS || "").trim();
  const list = raw
    ? raw.split(/[,\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean)
    : ["david.brown@berkeleynucleonics.com", "davidbrown750@gmail.com"];
  return new Set(list);
}

function isStaffEmail(em) {
  if (!em) return false;
  return em.slice(-STAFF_DOMAIN.length) === STAFF_DOMAIN || STAFF_EXTRA.has(em);
}

/* Returns the caller's email, or null. Unlike /api/internal-doc we do NOT fall back to
 * "valid session is good enough" — this endpoint writes to a screen customers can see,
 * so an unidentifiable session is refused rather than trusted. */
async function caller(req) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token || token.split(".").length !== 3) return null;
  const p = await verifyClerkToken(token);
  if (!p) return null;
  const em = String(p.email || p.email_address || p.primary_email || "").toLowerCase();
  if (!isStaffEmail(em)) return null;
  return em;
}

function clean(v, n) {
  return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, n);
}

function isDate(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

async function getBody(req) {
  let b = req.body;
  if (Buffer.isBuffer(b)) b = b.toString("utf8");
  if (typeof b === "string" && b.trim()) {
    try {
      return JSON.parse(b);
    } catch (_) {
      return {};
    }
  }
  return b && typeof b === "object" ? b : {};
}

/* Photos arrive as a data URL, already downscaled in the browser. We re-check the type
 * and size here anyway, because the browser is not a trusted place to enforce a limit. */
async function storeImage(dataUrl, email) {
  const m = /^data:(image\/(png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ""));
  if (!m) throw new Error("unsupported image");
  const buf = Buffer.from(m[3], "base64");
  if (!buf.length) throw new Error("empty image");
  if (buf.length > MAX_IMAGE_BYTES) throw new Error("image too large");
  const ext = m[2] === "jpeg" ? "jpg" : m[2];
  const name =
    todayISO() + "/" + email.split("@")[0].replace(/[^a-z0-9]+/gi, "-").toLowerCase() +
    "-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + "." + ext;
  const up = await fetch(
    process.env.SUPABASE_URL + "/storage/v1/object/" + BUCKET + "/" + name,
    {
      method: "POST",
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: "Bearer " + process.env.SUPABASE_SERVICE_ROLE_KEY,
        "Content-Type": m[1],
        "x-upsert": "true",
      },
      body: buf,
    }
  );
  if (!up.ok) throw new Error("upload failed " + up.status);
  return process.env.SUPABASE_URL + "/storage/v1/object/public/" + BUCKET + "/" + name;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    res.status(500).json({ ok: false, error: "storage not configured" });
    return;
  }

  const email = await caller(req);
  if (!email) {
    res.status(401).json({ ok: false, error: "sign in with your @berkeleynucleonics.com account" });
    return;
  }
  const canApprove = approvers().has(email);

  try {
    if (req.method === "GET") {
      const action = String((req.query && req.query.action) || "mine");

      if (action === "mine") {
        const r = await sb(
          TABLE + "?select=*&author_email=eq." + encodeURIComponent(email) +
          "&order=created_at.desc&limit=50"
        );
        if (!r.ok) throw new Error("supabase " + r.status);
        res.status(200).json({ ok: true, canApprove, posts: await r.json() });
        return;
      }

      if (action === "pending" || action === "live") {
        if (!canApprove) { res.status(403).json({ ok: false, error: "not an approver" }); return; }
        const q =
          action === "pending"
            ? TABLE + "?select=*&status=eq.pending&order=created_at.asc&limit=100"
            : TABLE + "?select=*&status=eq.approved&or=(until.is.null,until.gte." +
              todayISO() + ")&order=created_at.desc&limit=100";
        const r = await sb(q);
        if (!r.ok) throw new Error("supabase " + r.status);
        res.status(200).json({ ok: true, canApprove, posts: await r.json() });
        return;
      }

      res.status(400).json({ ok: false, error: "unknown action" });
      return;
    }

    if (req.method !== "POST") { res.status(405).end(); return; }

    const body = await getBody(req);
    const action = String(body.action || "submit");

    if (action === "submit") {
      const kind = String(body.kind || "announcement").toLowerCase();
      if (!KINDS.has(kind)) { res.status(400).json({ ok: false, error: "unknown post type" }); return; }

      const row = {
        kind,
        title: clean(body.title, MAX.title),
        detail: clean(body.detail, MAX.detail),
        answer: kind === "riddle" ? clean(body.answer, MAX.answer) : null,
        until: isDate(body.until) ? body.until : null,
        status: "pending",
        author_email: email,
        author_name: clean(body.author_name, MAX.name) || email.split("@")[0],
      };

      if (!row.title) { res.status(400).json({ ok: false, error: "a headline is required" }); return; }
      if (kind === "riddle" && !row.answer) {
        res.status(400).json({ ok: false, error: "a riddle needs its answer" });
        return;
      }
      if (row.until && row.until < todayISO()) {
        res.status(400).json({ ok: false, error: "that expiry date has already passed" });
        return;
      }

      if (kind === "photo") {
        if (!body.image) { res.status(400).json({ ok: false, error: "choose a photo" }); return; }
        try {
          row.image_url = await storeImage(body.image, email);
        } catch (e) {
          res.status(400).json({ ok: false, error: String(e.message || "image rejected") });
          return;
        }
      }

      const r = await sb(TABLE, {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: row,
      });
      if (!r.ok) throw new Error("supabase " + r.status);
      const saved = (await r.json())[0] || null;
      res.status(200).json({ ok: true, post: saved });
      return;
    }

    if (action === "review") {
      if (!canApprove) { res.status(403).json({ ok: false, error: "not an approver" }); return; }
      const id = String(body.id || "");
      const decision = String(body.decision || "");
      if (!id || (decision !== "approve" && decision !== "decline")) {
        res.status(400).json({ ok: false, error: "bad review" });
        return;
      }
      const patch = {
        status: decision === "approve" ? "approved" : "declined",
        reviewed_by: email,
        reviewed_at: new Date().toISOString(),
        decline_reason: decision === "decline" ? clean(body.reason, MAX.reason) || null : null,
      };
      const r = await sb(TABLE + "?id=eq." + encodeURIComponent(id) + "&status=eq.pending", {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: patch,
      });
      if (!r.ok) throw new Error("supabase " + r.status);
      const rows = await r.json();
      if (!rows.length) { res.status(409).json({ ok: false, error: "already reviewed" }); return; }
      res.status(200).json({ ok: true, post: rows[0] });
      return;
    }

    if (action === "remove") {
      const id = String(body.id || "");
      if (!id) { res.status(400).json({ ok: false, error: "missing id" }); return; }
      // An approver can pull anything. Anyone else can only withdraw their own post.
      let q = TABLE + "?id=eq." + encodeURIComponent(id);
      if (!canApprove) q += "&author_email=eq." + encodeURIComponent(email);
      const r = await sb(q, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: { status: "removed", reviewed_by: email, reviewed_at: new Date().toISOString() },
      });
      if (!r.ok) throw new Error("supabase " + r.status);
      const rows = await r.json();
      if (!rows.length) { res.status(404).json({ ok: false, error: "not found" }); return; }
      res.status(200).json({ ok: true });
      return;
    }

    res.status(400).json({ ok: false, error: "unknown action" });
  } catch (e) {
    res.status(500).json({ ok: false, error: "server error" });
  }
};
