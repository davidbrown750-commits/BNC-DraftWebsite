// On-demand "Create contact in Nutshell" endpoint, reached from the green button in the
// form-notification email for routed leads (gmail/yahoo/consumer/foreign) that /api/form
// deliberately did NOT auto-create. David clicks it to add the person to Nutshell, then
// routes them to a rep.
//
//   GET /api/create-contact?id=<bnc_form_submissions.id>&t=<hex HMAC-SHA256("create:"+id, BLOCK_KEY)>
//
// It verifies the signature, loads that submission row from Supabase, then find-or-creates
// the Nutshell contact (same dedup as /api/form) and attaches a note with the submission.
// Inert until BLOCK_KEY is set (every token fails the compare -> 403), matching /api/block.
//
// Vercel env: BLOCK_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NUTSHELL_API_USER/KEY.

const crypto = require("crypto");
const Nut = require("../lib/nutshell");

function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

function tokenOk(id, t) {
  const key = process.env.BLOCK_KEY;
  if (!key || !id || !t) return false;
  const want = crypto.createHmac("sha256", key).update("create:" + String(id)).digest("hex");
  const a = Buffer.from(want, "utf8"), b = Buffer.from(String(t), "utf8");
  if (a.length !== b.length) return false;
  try { return crypto.timingSafeEqual(a, b); } catch (_) { return false; }
}

async function loadSubmission(id) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  try {
    const r = await fetch(process.env.SUPABASE_URL + "/rest/v1/bnc_form_submissions?id=eq." + encodeURIComponent(id) + "&select=*&limit=1", {
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: "Bearer " + process.env.SUPABASE_SERVICE_ROLE_KEY,
      },
    });
    if (!r.ok) return null;
    const j = await r.json();
    return Array.isArray(j) && j[0] ? j[0] : null;
  } catch (_) { return null; }
}

function page({ title, heading, body, color }) {
  return '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    "<title>" + esc(title) + " - Berkeley Nucleonics</title>" +
    '<body style="margin:0;background:#0a1626;font-family:Arial,Helvetica,sans-serif">' +
    '<div style="max-width:560px;margin:12vh auto;background:#fff;border-radius:6px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,.35)">' +
    '<div style="background:' + (color || "#0655a3") + ';height:6px"></div>' +
    '<div style="padding:34px 34px 30px;color:#113163">' +
    '<h1 style="margin:0 0 14px;color:' + (color || "#0655a3") + ';font-size:22px">' + esc(heading) + "</h1>" +
    body + "</div></div></body>";
}

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  if (req.method !== "GET") { res.status(405).end("Method not allowed"); return; }

  const q = req.query || {};
  const id = String(q.id || "").trim();
  const t = String(q.t || "").replace(/[^a-fA-F0-9]/g, "").toLowerCase();

  if (!id || !tokenOk(id, t)) {
    res.status(403).end(page({ title: "Invalid link", heading: "Link not valid",
      color: "#b0242a", body: '<p style="font-size:15px;line-height:1.6">This create-contact link is missing or has an invalid signature.</p>' }));
    return;
  }

  const sub = await loadSubmission(id);
  if (!sub) {
    res.status(404).end(page({ title: "Not found", heading: "Submission not found",
      color: "#b0242a", body: '<p style="font-size:15px;line-height:1.6">That form submission could not be found. It may have been removed.</p>' }));
    return;
  }

  const email = String(sub.email || "").toLowerCase().trim();
  if (!email || email.indexOf("@") < 1) {
    res.status(400).end(page({ title: "No email", heading: "No email to add",
      color: "#b0242a", body: '<p style="font-size:15px;line-height:1.6">This submission has no email address, so there is no contact to create.</p>' }));
    return;
  }
  if (!Nut.hasCreds()) {
    res.status(200).end(page({ title: "CRM not configured", heading: "Nutshell not configured",
      color: "#b0242a", body: '<p style="font-size:15px;line-height:1.6">The Nutshell credentials are not set on the server, so no contact was created.</p>' }));
    return;
  }

  let contact = null, created = false, err = "";
  try {
    contact = await Nut.findContactByEmail(email);
    if (!contact) {
      contact = await Nut.createContact({
        name: sub.name || sub.company || email.split("@")[0],
        email, phone: sub.phone || null,
      });
      created = true;
    }
    // Attach a note with the original submission so the rep has context.
    const lines = [(sub.form_type || "Website form") + " via website (added on request).", "Email: " + email];
    if (sub.company) lines.push("Company: " + sub.company);
    if (sub.phone) lines.push("Phone: " + sub.phone);
    if (sub.message) lines.push("Message: " + String(sub.message).slice(0, 2000));
    const fields = sub.fields && typeof sub.fields === "object" ? sub.fields : {};
    for (const k of Object.keys(fields)) lines.push(k + ": " + String(fields[k]).slice(0, 500));
    if (sub.page) lines.push("Page: " + sub.page);
    try { await Nut.addNote(contact.id, lines.join("\n")); } catch (_) {}
  } catch (e) {
    err = e.rpc || e.message || "unknown";
  }

  if (!contact) {
    res.status(502).end(page({ title: "Could not create", heading: "Could not create the contact",
      color: "#b0242a", body: '<p style="font-size:15px;line-height:1.6">Nutshell returned an error: ' + esc(err) + ".</p>" }));
    return;
  }

  const name = sub.name || email;
  res.status(200).end(page({ title: "Contact created", heading: created ? "Contact created" : "Contact already existed",
    color: "#1a8a5a",
    body: '<p style="font-size:16px;line-height:1.6;margin:0 0 12px"><strong>' + esc(name) + "</strong> (" + esc(email) + ") " +
      (created ? "has been added to Nutshell" : "was already in Nutshell") + " with the submission attached as a note.</p>" +
      '<p style="font-size:15px;line-height:1.6;margin:0 0 16px">Open it in Nutshell to assign it to a salesperson for follow-up.</p>' +
      '<p><a href="https://app.nutshell.com/" style="display:inline-block;background:#0655a3;color:#fff;text-decoration:none;font-weight:bold;font-size:14px;padding:10px 22px;border-radius:4px">Open Nutshell</a></p>' +
      '<p style="font-size:12px;color:#6b7a90;margin:18px 0 0">Nutshell contact ' + esc(String(contact.id)) + "</p>" }));
};
