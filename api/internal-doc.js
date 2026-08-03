// Serves staff-only internal documents (QAM, EU-100, EU-100C) ONLY to a verified
// Clerk session. The files are embedded in internal-docs-data.js, so unlike the
// compliance PDFs under /docs/pdfs/ they are never reachable as static URLs.
//
// Auth mirrors api/visitors.js isAuthorized(): a validly-signed BNC Clerk session
// JWT; when the token carries an email claim, the @berkeleynucleonics.com domain is
// enforced server-side (falling back to the portal's client-side domain gate when
// Clerk is not configured to include the email claim).
const { verifyClerkToken } = require("../lib/clerk");
const DOCS = require("./internal-docs-data");

const STAFF_DOMAIN = "@berkeleynucleonics.com";
const STAFF_EXTRA = new Set(["davidbrown750@gmail.com", "jsaldi@regencyinteractive.com", "rcabe@regencyinteractive.com"]);

async function authorized(req) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : (req.query && req.query.t) || "";
  if (!token || token.split(".").length !== 3) return false;
  const p = await verifyClerkToken(token);
  if (!p) return false;
  const em = String(p.email || p.email_address || p.primary_email || "").toLowerCase();
  if (!em) return true; // valid BNC session; portal enforces domain client-side
  return em.slice(-STAFF_DOMAIN.length) === STAFF_DOMAIN || STAFF_EXTRA.has(em);
}

module.exports = async (req, res) => {
  try {
    const key = (req.query && req.query.doc) || "";
    const doc = DOCS[key];
    if (!doc) { res.status(404).json({ error: "unknown document" }); return; }
    if (!(await authorized(req))) { res.status(401).json({ error: "not authorized" }); return; }

    const buf = Buffer.from(doc.b64, "base64");
    res.setHeader("Content-Type", doc.mime);
    res.setHeader("Content-Disposition",
      (doc.download ? `attachment; filename="${doc.download}"` : "inline"));
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    res.status(200).send(buf);
  } catch (e) {
    res.status(500).json({ error: "server error" });
  }
};
