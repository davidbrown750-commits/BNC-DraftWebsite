// One-click "Block this sender" endpoint for the self-hosted form pipeline.
// Reached from the red button in the form notification email:
//   GET /api/block?email=<urlencoded lowercased email>&t=<hex HMAC-SHA256(email, BLOCK_KEY)>
//
// On a valid signature it (best-effort, additive, never assumes prod is reachable):
//   1. adds the email to Supabase bnc_blocked_emails (future submissions are dropped by /api/form)
//   2. removes the Nutshell "false record" for that email (hard delete, else flag as spam)
// then shows a branded BNC confirmation page. On partial failure it still reports what succeeded.
//
// Inert until BLOCK_KEY is set: with no secret every token fails the compare and the endpoint 403s,
// and /api/form renders no button, so nothing is exposed.
//
// Vercel env: BLOCK_KEY (HMAC secret), SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//   NUTSHELL_API_USER, NUTSHELL_API_KEY.

const crypto = require("crypto");
const N = require("../lib/nutshell");

function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

function expectedToken(email) {
  const key = process.env.BLOCK_KEY;
  if (!key || !email) return "";
  return crypto.createHmac("sha256", key).update(String(email).toLowerCase()).digest("hex");
}

// Constant-time hex compare (equal length required by timingSafeEqual).
function tokenOk(email, t) {
  const want = expectedToken(email);
  if (!want || !t) return false;
  const a = Buffer.from(want, "utf8");
  const b = Buffer.from(String(t), "utf8");
  if (a.length !== b.length) return false;
  try { return crypto.timingSafeEqual(a, b); } catch (_) { return false; }
}

// Upsert into the blocklist. Prefer merge-duplicates so a repeat click is idempotent.
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
      body: JSON.stringify({ email: email, reason: "spam-form", source: "form-email", blocked_at: new Date().toISOString() }),
    });
    if (r.ok || r.status === 409) return { ok: true };
    return { ok: false, error: "supabase HTTP " + r.status };
  } catch (e) { return { ok: false, error: e.message }; }
}

function page({ email, blocked, crmAction, crmDetail }) {
  const crmLine = crmAction === "deleted" ? "the Nutshell record has been deleted"
    : crmAction === "flagged" ? "the Nutshell record has been flagged for deletion"
    : crmAction === "not-found" ? "no Nutshell record was found for this address"
    : crmAction === "skipped" ? "the Nutshell record was not touched (CRM not configured)"
    : "the Nutshell record could not be updated";
  const blockLine = blocked ? "Future submissions from this address are dropped." : "The blocklist could not be updated, so future submissions may still arrive.";
  return '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    "<title>Sender blocked - Berkeley Nucleonics</title>" +
    '<body style="margin:0;background:#0a1626;font-family:Arial,Helvetica,sans-serif">' +
    '<div style="max-width:560px;margin:12vh auto;background:#ffffff;border-radius:6px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,.35)">' +
    '<div style="background:#0655a3;height:6px"></div>' +
    '<div style="padding:34px 34px 30px;color:#113163">' +
    '<h1 style="margin:0 0 14px;color:#0655a3;font-size:22px">Sender blocked</h1>' +
    '<p style="font-size:16px;line-height:1.6;margin:0 0 12px">Blocked <strong>' + esc(email) + "</strong>. " + esc(blockLine) + " " + esc(crmLine + ".") + "</p>" +
    (crmDetail ? '<p style="font-size:12px;color:#6b7a90;margin:0 0 12px">' + esc(crmDetail) + "</p>" : "") +
    '<p style="font-size:13px;color:#6b7a90;margin:18px 0 0">Berkeley Nucleonics website form protection</p>' +
    "</div></div></body>";
}

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  if (req.method !== "GET") { res.status(405).end("Method not allowed"); return; }

  const q = req.query || {};
  const email = String(q.email || "").toLowerCase().trim();
  const t = String(q.t || "");

  if (!email || !tokenOk(email, t)) {
    res.status(403).end('<!doctype html><meta charset="utf-8"><title>Invalid link</title>' +
      '<body style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:14vh auto;text-align:center;color:#113163">' +
      '<h1 style="color:#0655a3">Link not valid</h1><p style="font-size:15px;line-height:1.6">This block link is missing or has an invalid signature.</p></body>');
    return;
  }

  // 1. Blocklist
  const bl = await addToBlocklist(email);

  // 2. Nutshell removal (hard delete, else flag)
  let crmAction = "error", crmDetail = "";
  if (!N.hasCreds()) {
    crmAction = "skipped";
  } else {
    try {
      const r = await N.removeSpamContactByEmail(email);
      if (!r.found) { crmAction = "not-found"; }
      else if (r.action === "deleted") { crmAction = "deleted"; crmDetail = "Nutshell contact " + r.id + " deleted."; }
      else if (r.action === "flagged") { crmAction = "flagged"; crmDetail = "Nutshell contact " + r.id + " flagged (hard delete unavailable: " + (r.deleteError || "unknown") + ")."; }
      else { crmAction = "error"; crmDetail = "Nutshell error: " + (r.error || "unknown") + "."; }
    } catch (e) { crmAction = "error"; crmDetail = "Nutshell error: " + e.message + "."; }
  }

  res.status(200).end(page({ email, blocked: bl.ok, crmAction, crmDetail }));
};
