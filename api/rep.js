// "Flag as Manufacturers Rep" endpoint for the form-notification emails. A manufacturer's
// rep who contacts us reps OTHER companies (not us) and is not a customer, so we tag the
// Nutshell "Contact Type" as a Reseller. Unlike /api/vendor we do NOT block them — a rep
// asking to represent us is a potential channel partner and may follow up. (David 2026-07-09.)
//
//   GET /api/rep?email=<lowercased email>&kind=<reseller-domestic|reseller-international>&t=<HMAC>
//   token = hex HMAC-SHA256("rep:"+kind+":"+email, BLOCK_KEY)
//
// BNC taxonomy: BNC-Rep = reps who represent US; Reseller = reps who represent others, not us.
// A website inquiry is a Reseller; pick Domestic vs International. Inert until BLOCK_KEY is set.

const crypto = require("crypto");
const N = require("../lib/nutshell");

function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

const KINDS = {
  "reseller-domestic": "Reseller-Domestic",
  "reseller-international": "Reseller-International",
};

function tokenOk(email, kind, t) {
  const key = process.env.BLOCK_KEY;
  if (!key || !email || !kind || !t || !KINDS[kind]) return false;
  const want = crypto.createHmac("sha256", key).update("rep:" + kind + ":" + String(email).toLowerCase()).digest("hex");
  const a = Buffer.from(want, "utf8"), b = Buffer.from(String(t), "utf8");
  if (a.length !== b.length) return false;
  try { return crypto.timingSafeEqual(a, b); } catch (_) { return false; }
}

function page({ email, type, crmAction, crmDetail }) {
  const crmLine = crmAction === "tagged" ? "the Nutshell record is tagged Contact Type = " + type
    : crmAction === "not-found" ? "no Nutshell record was found for this address"
    : crmAction === "skipped" ? "the Nutshell record was not touched (CRM not configured)"
    : "the Nutshell record could not be tagged (" + (crmDetail || "unknown") + ")";
  return '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    "<title>Flagged as manufacturers rep - Berkeley Nucleonics</title>" +
    '<body style="margin:0;background:#0a1626;font-family:Arial,Helvetica,sans-serif">' +
    '<div style="max-width:560px;margin:12vh auto;background:#ffffff;border-radius:6px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,.35)">' +
    '<div style="background:#0a7d6b;height:6px"></div>' +
    '<div style="padding:34px 34px 30px;color:#113163">' +
    '<h1 style="margin:0 0 14px;color:#0a6154;font-size:22px">Flagged as a manufacturers rep</h1>' +
    '<p style="font-size:16px;line-height:1.6;margin:0 0 12px"><strong>' + esc(email) + "</strong> is now a " + esc(type) +
    " (reps other companies, not a customer). " + esc(crmLine) + ". They are not blocked, so they can still reach us.</p>" +
    '<p style="font-size:13px;color:#6b7a90;margin:18px 0 0">Berkeley Nucleonics website form protection</p>' +
    "</div></div></body>";
}

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  if (req.method !== "GET") { res.status(405).end("Method not allowed"); return; }
  const q = req.query || {};
  const email = String(q.email || "").toLowerCase().trim();
  const kind = String(q.kind || "").toLowerCase().trim();
  const t = String(q.t || "").replace(/[^a-fA-F0-9]/g, "").toLowerCase();
  if (!email || !tokenOk(email, kind, t)) {
    res.status(403).end('<!doctype html><meta charset="utf-8"><title>Invalid link</title>' +
      '<body style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:14vh auto;text-align:center;color:#113163">' +
      '<h1 style="color:#0a6154">Link not valid</h1><p style="font-size:15px;line-height:1.6">This rep link is missing or has an invalid signature.</p></body>');
    return;
  }
  const type = KINDS[kind];

  let crmAction = "error", crmDetail = "";
  if (!N.hasCreds()) { crmAction = "skipped"; }
  else {
    try {
      const contact = await N.findContactByEmail(email);
      if (!contact) { crmAction = "not-found"; }
      else {
        try { await N.setContactCustomFields(contact.id, { "Contact Type": type }); crmAction = "tagged"; }
        catch (e) { crmAction = "error"; crmDetail = e.rpc || e.message; }
      }
    } catch (e) { crmAction = "error"; crmDetail = e.rpc || e.message; }
  }

  res.status(200).end(page({ email, type, crmAction, crmDetail }));
};
