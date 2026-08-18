// "Flag as competitor" endpoint for the form-notification emails. Sits between /api/vendor
// and /api/block: the record is KEPT and the sender is NOT blocked, because a competitor
// reading our datasheets is information we want to keep receiving. All it does is tag the
// Nutshell "Contact Type" as Competitor, which is the same value the battle-card classifier
// and reassign.php already use, so a competitor flagged here drops out of the daily cards.
//
//   GET /api/competitor?email=<urlencoded lowercased email>&t=<hex HMAC-SHA256("competitor:"+email, BLOCK_KEY)>
//
// Deliberately NOT blocking (contrast /api/vendor, which does block): a vendor pitching us is
// noise, while a competitor is a signal. If a competitor also needs silencing, the block
// button in the same email still does that.
//
// Vercel env: BLOCK_KEY, NUTSHELL_API_USER/KEY. Inert until BLOCK_KEY is set (403 on every
// call, because the token can never match).

const crypto = require("crypto");
const N = require("../lib/nutshell");

function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

// Namespaced token ("competitor:") so this link cannot be replayed as a block or vendor link.
function tokenOk(email, t) {
  const key = process.env.BLOCK_KEY;
  if (!key || !email || !t) return false;
  const want = crypto.createHmac("sha256", key).update("competitor:" + String(email).toLowerCase()).digest("hex");
  const a = Buffer.from(want, "utf8"), b = Buffer.from(String(t), "utf8");
  if (a.length !== b.length) return false;
  try { return crypto.timingSafeEqual(a, b); } catch (_) { return false; }
}

function page({ email, crmAction, crmDetail }) {
  const crmLine = crmAction === "tagged" ? "the Nutshell record is tagged Contact Type = Competitor"
    : crmAction === "not-found" ? "no Nutshell record was found for this address"
    : crmAction === "skipped" ? "the Nutshell record was not touched (CRM not configured)"
    : "the Nutshell record could not be tagged (" + (crmDetail || "unknown") + ")";
  return '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    "<title>Flagged as competitor - Berkeley Nucleonics</title>" +
    '<body style="margin:0;background:#0a1626;font-family:Arial,Helvetica,sans-serif">' +
    '<div style="max-width:560px;margin:12vh auto;background:#ffffff;border-radius:6px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,.35)">' +
    '<div style="background:#5b3da8;height:6px"></div>' +
    '<div style="padding:34px 34px 30px;color:#113163">' +
    '<h1 style="margin:0 0 14px;color:#4a2f92;font-size:22px">Flagged as a competitor</h1>' +
    '<p style="font-size:16px;line-height:1.6;margin:0 0 12px"><strong>' + esc(email) + "</strong> is flagged as a competitor, so " + esc(crmLine) +
    " and they drop out of the daily battle cards.</p>" +
    '<p style="font-size:15px;line-height:1.6;margin:0 0 12px;color:#37475f">They are <strong>not</strong> blocked. What a competitor reads on the site is worth knowing, ' +
    "so the record stays live. Use the block button in the same email if this address also needs silencing.</p>" +
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
      '<h1 style="color:#4a2f92">Link not valid</h1><p style="font-size:15px;line-height:1.6">This competitor link is missing or has an invalid signature.</p></body>');
    return;
  }

  let crmAction = "error", crmDetail = "";
  if (!N.hasCreds()) { crmAction = "skipped"; }
  else {
    try {
      const contact = await N.findContactByEmail(email);
      if (!contact) { crmAction = "not-found"; }
      else {
        try { await N.setContactCustomFields(contact.id, { "Contact Type": "Competitor" }); crmAction = "tagged"; }
        catch (e) { crmAction = "error"; crmDetail = e.rpc || e.message; }
      }
    } catch (e) { crmAction = "error"; crmDetail = e.rpc || e.message; }
  }

  res.status(200).end(page({ email, crmAction, crmDetail }));
};
