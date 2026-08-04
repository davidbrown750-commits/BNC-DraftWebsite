/* /api/lobby-feed — what the lobby sign reads.
 *
 * Returns only approved, unexpired posts, shaped the way the sign wants them. The sign
 * is a TV in reception, not a person, so it authenticates with a shared key on the URL
 * (?k=) rather than a Clerk session — the same convention the briefs tools use.
 *
 * This endpoint is read-only and never exposes an author's email address. Whoever holds
 * the key can see what is already on a screen in a public room, and nothing more.
 *
 * Set LOBBY_FEED_KEY in Vercel. Without it the endpoint refuses to serve rather than
 * defaulting open.
 */
const TABLE = "bnc_lobby_posts";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/* Constant-time-ish compare so the key cannot be recovered a character at a time. */
function keyMatches(given, expected) {
  const a = Buffer.from(String(given || ""));
  const b = Buffer.from(String(expected || ""));
  if (!b.length || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

module.exports = async function handler(req, res) {
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  // The sign polls every minute; a short cache keeps a wall-mounted browser from
  // hammering the function without making an approval feel slow.
  res.setHeader("Cache-Control", "public, max-age=30");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "GET") { res.status(405).end(); return; }

  const expected = process.env.LOBBY_FEED_KEY;
  if (!expected) { res.status(503).json({ ok: false, error: "feed not configured" }); return; }
  const given = (req.query && (req.query.k || req.query.key)) || "";
  if (!keyMatches(given, expected)) { res.status(401).json({ ok: false, error: "bad key" }); return; }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    res.status(500).json({ ok: false, error: "storage not configured" });
    return;
  }

  try {
    const q =
      TABLE +
      "?select=id,kind,title,detail,answer,image_url,author_name,created_at,until" +
      "&status=eq.approved" +
      "&or=(until.is.null,until.gte." + todayISO() + ")" +
      "&order=created_at.desc&limit=60";
    const r = await fetch(process.env.SUPABASE_URL + "/rest/v1/" + q, {
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: "Bearer " + process.env.SUPABASE_SERVICE_ROLE_KEY,
      },
    });
    if (!r.ok) throw new Error("supabase " + r.status);
    const rows = await r.json();

    // Split by kind so the sign can drop each straight into the slot it already has.
    const out = { announcements: [], shoutouts: [], photos: [], riddles: [] };
    for (const p of rows) {
      const base = {
        id: p.id,
        t: p.title,
        d: p.detail || "",
        by: p.author_name || "",
        until: p.until || null,
      };
      if (p.kind === "announcement") out.announcements.push(base);
      else if (p.kind === "shoutout") out.shoutouts.push(base);
      else if (p.kind === "photo") out.photos.push(Object.assign({ src: p.image_url }, base));
      else if (p.kind === "riddle") out.riddles.push({ id: p.id, q: p.title, a: p.answer, by: base.by });
    }

    res.status(200).json({ ok: true, generated_at: new Date().toISOString(), counts: {
      announcements: out.announcements.length, shoutouts: out.shoutouts.length,
      photos: out.photos.length, riddles: out.riddles.length,
    }, ...out });
  } catch (e) {
    res.status(500).json({ ok: false, error: "server error" });
  }
};
