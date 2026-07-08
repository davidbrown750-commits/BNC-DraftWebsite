// Real-time Nutshell upsert for a signed-in visitor. Called by _shared/bnc-auth.js
// once per session with the Clerk session token + the visitor's identity. The token
// is verified server-side (RS256), so only genuine signed-in sessions can write.
//
// Env: NUTSHELL_API_USER, NUTSHELL_API_KEY.
// Body (POST JSON): { token, email, name, phone, company }
// Diag:  GET /api/nutshell-sync?diag=1   -> reports creds + live auth check.

const N = require("../lib/nutshell");
const { verifyClerkToken } = require("../lib/clerk");

// Atomic dedup gate (same as /api/form): two racing sign-in syncs (or a sync racing a
// form submit) both find nothing in Nutshell and both create -> same-second duplicate
// contacts (e.g. Brandon Parra 3509491/3509495, 2026-07-08). Postgres makes the first
// INSERT of an email into bnc_contact_claims win; the loser skips its create.
// "skip" = Supabase unavailable -> fail open (behave as before).
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
    if (!r.ok && r.status !== 409) return "skip";
    let arr = [];
    try { arr = await r.json(); } catch (_) {}
    return (Array.isArray(arr) && arr.length > 0) ? "claimed" : "exists";
  } catch (_) { return "skip"; }
}
async function releaseEmailClaim(email) {
  if (!email || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  try {
    await fetch(process.env.SUPABASE_URL + "/rest/v1/bnc_contact_claims?email=eq." + encodeURIComponent(email), {
      method: "DELETE",
      headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: "Bearer " + process.env.SUPABASE_SERVICE_ROLE_KEY },
    });
  } catch (_) {}
}

module.exports = async function handler(req, res) {
  if (req.method === "GET" && req.query && req.query.diag) {
    let authOk = false, error = null, endpoint = null;
    try { endpoint = await N.endpoint(); } catch (e) {}
    if (N.hasCreds()) {
      try { await N.rpc("searchByEmail", { emailAddressString: "diag@example.com" }); authOk = true; }
      catch (e) { error = e.rpc || e.message; }
    }
    res.status(200).json({ hasNutshellCreds: N.hasCreds(), endpoint, authOk, error });
    return;
  }
  if (req.method !== "POST") { res.status(405).end(); return; }

  let body = {};
  try { body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {}); } catch (e) {}

  // Gate: require a valid Clerk session token (anti-spam). Identity comes from the body
  // (Clerk's default session JWT does not carry email), trusted only behind a valid token.
  const claims = await verifyClerkToken(body.token);
  if (!claims) { res.status(401).json({ error: "invalid or missing session token" }); return; }

  const email = (body.email || "").toLowerCase().trim();
  if (!email || email.indexOf("@") < 1) { res.status(200).json({ skipped: "no email" }); return; }
  if (!N.hasCreds()) { res.status(200).json({ skipped: "no nutshell creds" }); return; }

  try {
    // Find-or-create guarded by the atomic claim (replaces the raced upsertContact path).
    let contact = await N.findContactByEmail(email);
    let created = false;
    if (!contact) {
      const claim = await claimEmail(email);
      if (claim === "exists") {
        // Another writer (a concurrent sync or /api/form) owns creating this email.
        // Re-check once in case it just landed; otherwise skip the create entirely.
        contact = await N.findContactByEmail(email);
        if (!contact) { res.status(200).json({ ok: true, deduped: true }); return; }
      } else {
        try {
          contact = await N.createContact({
            name: body.name || body.company || String(email).split("@")[0],
            email,
            phone: body.phone || null,
          });
          created = true;
        } catch (ce) {
          if (claim === "claimed") await releaseEmailClaim(email);
          throw ce;
        }
      }
    }
    if (created) {
      try {
        await N.addNote(contact.id, "Registered / signed in on the website (" + email + ").");
      } catch (e) { /* note is best-effort */ }
    }
    res.status(200).json({ ok: true, contactId: contact.id, created });
  } catch (e) {
    res.status(200).json({ ok: false, error: e.rpc || e.message });
  }
};
