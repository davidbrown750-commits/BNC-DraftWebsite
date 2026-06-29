// Real-time Nutshell upsert for a signed-in visitor. Called by _shared/bnc-auth.js
// once per session with the Clerk session token + the visitor's identity. The token
// is verified server-side (RS256), so only genuine signed-in sessions can write.
//
// Env: NUTSHELL_API_USER, NUTSHELL_API_KEY.
// Body (POST JSON): { token, email, name, phone, company }
// Diag:  GET /api/nutshell-sync?diag=1   -> reports creds + live auth check.

const N = require("../lib/nutshell");
const { verifyClerkToken } = require("../lib/clerk");

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
    const { contact, created } = await N.upsertContact({
      email,
      name: body.name || null,
      phone: body.phone || null,
      company: body.company || null,
    });
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
