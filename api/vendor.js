// "Flag as vendor" endpoint for the form-notification emails. The softer sibling of
// /api/block: vendors (guest-post pitches, SEO/agency outreach, resellers) are not spam,
// so we KEEP the Nutshell record but tag its "Contact Type" as Vendor, and block future
// website submissions from that address so they stop hitting the inbox.
//
//   GET /api/vendor?email=<urlencoded lowercased email>&t=<hex HMAC-SHA256("vendor:"+email, BLOCK_KEY)>
//
// On a valid signature (best-effort, additive):
//   1. add the email to Supabase bnc_blocked_emails (reason "vendor") -> /api/form drops future submits
//   2. tag the Nutshell contact "Contact Type" = "Vendor" (record kept, not deleted)
// then a branded confirmation. Inert until BLOCK_KEY is set (token never matches -> 403).
//
// Vercel env: BLOCK_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NUTSHELL_API_USER/KEY.

const crypto = require("crypto");
const N = require("../lib/nutshell");

function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

// Namespaced token ("vendor:") so a vendor link can't be replayed as a block link and vice versa.
function tokenOk(email, t) {
  const key = process.env.BLOCK_KEY;
  if (!key || !email || !t) return false;
  const want = crypto.createHmac("sha256", key).update("vendor:" + String(email).toLowerCase()).digest("hex");
  const a = Buffer.from(want, "utf8"), b = Buffer.from(String(t), "utf8");
  if (a.length !== b.length) return false;
  try { return crypto.timingSafeEqual(a, b); } catch (_) { return false; }
}

async function addToBlocklist(email) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return { ok: false, error: "supabase not configured" };
  try {
    const r = await fetch(process.env.SUPABASE_URL + "/rest/v1/bnc_blocked_emails", {
      method: "POST",
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: "Bearer " + process.env.SUPABASE_SERVICE_ROLE_KEY,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({ email: email, reason: "vendor", source: "form-email", blocked_at: new Date().toISOString() }),
    });
    if (r.ok || r.status === 409) return { ok: true };
    return { ok: false, error: "supabase HTTP " + r.status };
  } catch (e) { return { ok: false, error: e.message }; }
}

function page({ email, blocked, crmAction, crmDetail }) {
  const crmLine = crmAction === "tagged" ? "the Nutshell record is tagged Contact Type = Vendor"
    : crmAction === "not-found" ? "no Nutshell record was found for this address"
    : crmAction === "skipped" ? "the Nutshell record was not touched (CRM not configured)"
    : "the Nutshell record could not be tagged (" + (crmDetail || "unknown") + ")";
  const blockLine = blocked ? "Future website submissions from this address are now dropped." : "The blocklist could not be updated, so future submissions may still arrive.";
  return '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    "<title>Marked as vendor - Berkeley Nucleonics</title>" +
    '<body style="margin:0;background:#0a1626;font-family:Arial,Helvetica,sans-serif">' +
    '<div style="max-width:560px;margin:12vh auto;background:#ffffff;border-radius:6px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,.35)">' +
    '<div style="background:#c77e00;height:6px"></div>' +
    '<div style="padding:34px 34px 30px;color:#113163">' +
    '<h1 style="margin:0 0 14px;color:#8a5a00;font-size:22px">Marked as vendor</h1>' +
    '<p style="font-size:16px;line-height:1.6;margin:0 0 12px"><strong>' + esc(email) + "</strong> is flagged as a vendor. " + esc(blockLine) + " " + esc(crmLine) + ".</p>" +
    '<p style="font-size:13px;color:#6b7a90;margin:18px 0 0">Berkeley Nucleonics website form protection</p>' +
    "</div></div></body>";
}

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  if (req.method !== "GET") { res.status(405).end("Method not allowed"); return; }
  const q = req.query || {};
  const email = String(q.email || "").toLowerCase().trim();
  const t = String(q.t || "").replace(/[^a-fA-F0-9]/g, "").toLowerCase();
  if (!email || !tokenOk(email, t)) {
    res.status(403).end('<!doctype html><meta charset="utf-8"><title>Invalid link</title>' +
      '<body style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:14vh auto;text-align:center;color:#113163">' +
      '<h1 style="color:#8a5a00">Link not valid</h1><p style="font-size:15px;line-height:1.6">This vendor link is missing or has an invalid signature.</p></body>');
    return;
  }

  const bl = await addToBlocklist(email);

  let crmAction = "error", crmDetail = "";
  if (!N.hasCreds()) { crmAction = "skipped"; }
  else {
    try {
      const contact = await N.findContactByEmail(email);
      if (!contact) { crmAction = "not-found"; }
      else {
        try { await N.setContactCustomFields(contact.id, { "Contact Type": "Vendor" }); crmAction = "tagged"; }
        catch (e) { crmAction = "error"; crmDetail = e.rpc || e.message; }
      }
    } catch (e) { crmAction = "error"; crmDetail = e.rpc || e.message; }
  }

  res.status(200).end(page({ email, blocked: bl.ok, crmAction, crmDetail }));
};
