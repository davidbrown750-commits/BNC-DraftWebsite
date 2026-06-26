// Deploy to the BNC-DraftWebsite repo at  /api/track.js  (Vercel serverless function).
// Vercel env vars (Project Settings -> Environment Variables):
//   SUPABASE_URL                = the Supabase project URL (same as bnc-auth-config.js)
//   SUPABASE_SERVICE_ROLE_KEY   = the service-role key (SECRET; server-side only)
// The browser POSTs visit data here; this inserts it server-side, so the key never
// touches the client and RLS keeps the visit log private.

module.exports = async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).end(); return; }
  try {
    const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const num = (v) => (Number.isFinite(+v) ? Math.max(0, Math.min(86400, Math.round(+v))) : null);
    const s = (v, n) => (v ? String(v).slice(0, n) : null);
    const row = {
      visitor_id: s(b.visitor_id, 80),
      user_id: s(b.user_id, 80),
      email: b.email ? String(b.email).slice(0, 200).toLowerCase() : null,
      company: s(b.company, 200),
      path: s(b.path, 300),
      page_title: s(b.page_title, 300),
      referrer: s(b.referrer, 500),
      dwell_seconds: num(b.dwell_seconds),
      user_agent: s(req.headers["user-agent"], 300),
    };
    if (!row.visitor_id || !row.path) { res.status(204).end(); return; }
    const r = await fetch(process.env.SUPABASE_URL + "/rest/v1/bnc_visits", {
      method: "POST",
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: "Bearer " + process.env.SUPABASE_SERVICE_ROLE_KEY,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(row),
    });
    res.status(r.ok ? 204 : 502).end();
  } catch (e) {
    res.status(204).end(); // never block the page; swallow errors
  }
}
