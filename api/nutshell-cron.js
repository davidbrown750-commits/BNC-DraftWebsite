// Daily Nutshell sync: read yesterday's identified website visits from Supabase,
// group by email, and add a timeline note of the day's activity to each person in
// Nutshell (creating the person if they are not in the CRM yet).
//
// Runs from a Vercel Cron (see vercel.json "crons"). Vercel sends the cron request
// with  Authorization: Bearer <CRON_SECRET>  when CRON_SECRET is set.
//
// Env: NUTSHELL_API_USER, NUTSHELL_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//      CRON_SECRET (optional but recommended).
// Manual check:  GET /api/nutshell-cron?diag=1   (dry run, writes nothing)

const N = require("../lib/nutshell");
const classify = require("../lib/classify");
const SUPA = process.env.SUPABASE_URL;
const SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Never sync internal staff, test accounts, or known vendors (David: no follow-up
// on Regency Interactive). Competitors are still synced but tagged Contact Type=Competitor.
const SKIP_DOMAINS = ["berkeleynucleonics.com", "regencyinteractive.com"];
const SKIP_EMAILS = new Set([
  "basketballdavid@yahoo.com", "davidbrown750@gmail.com",
  "yvonnewebersfromholland@gmail.com", "yvonnefromholland@gmail.com",
]);
function skipEmail(e) {
  const em = String(e || "").toLowerCase();
  const dom = em.split("@")[1] || "";
  return SKIP_EMAILS.has(em) || SKIP_DOMAINS.some((d) => dom === d || dom.endsWith("." + d));
}

function authorized(req) {
  if (!process.env.CRON_SECRET) return true; // not enforced until you set it
  if (req.headers.authorization === "Bearer " + process.env.CRON_SECRET) return true; // Vercel cron
  if (req.query && req.query.key === process.env.CRON_SECRET) return true;             // manual browser run
  return false;
}

module.exports = async function handler(req, res) {
  const diag = req.query && (req.query.diag || req.query.dryrun);
  if (!authorized(req) && !diag) { res.status(401).json({ error: "unauthorized" }); return; }
  if (!SUPA || !SKEY) { res.status(200).json({ skipped: "no supabase creds" }); return; }
  if (!N.hasCreds()) { res.status(200).json({ skipped: "no nutshell creds (set NUTSHELL_API_USER/KEY)" }); return; }

  // Window: the last 24 hours of identified visits.
  const sinceIso = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const day = sinceIso.slice(0, 10);
  const q = SUPA + "/rest/v1/bnc_visits"
    + "?email=not.is.null"
    + "&visited_at=gte." + encodeURIComponent(sinceIso)
    + "&select=email,company,path,page_title,dwell_seconds,visited_at"
    + "&order=visited_at.asc&limit=8000";

  let rows = [];
  try {
    const r = await fetch(q, { headers: { apikey: SKEY, Authorization: "Bearer " + SKEY } });
    rows = await r.json();
    if (!Array.isArray(rows)) rows = [];
  } catch (e) {
    res.status(200).json({ error: "supabase read failed", detail: String(e) }); return;
  }

  // Group by email.
  const byEmail = {};
  for (const v of rows) {
    const e = (v.email || "").toLowerCase();
    if (!e) continue;
    (byEmail[e] = byEmail[e] || []).push(v);
  }

  let created = 0, noted = 0, classified = 0, errors = 0;
  const errSamples = [], clsSamples = [];
  let emails = Object.keys(byEmail).filter((e) => !skipEmail(e));
  const skipped = Object.keys(byEmail).length - emails.length;
  // Optional cap for a small manual test run: ?max=2
  const max = req.query && req.query.max ? parseInt(req.query.max, 10) : 0;
  if (max > 0) emails = emails.slice(0, max);

  for (const email of emails) {
    const visits = byEmail[email];
    const pageCount = visits.length;
    const dwellMin = Math.round(visits.reduce((a, v) => a + (v.dwell_seconds || 0), 0) / 60);
    const company = (visits.find((v) => v.company) || {}).company || null;
    const top = [...new Set(visits.map((v) => v.page_title || v.path).filter(Boolean))].slice(0, 10);

    // Auto-classify Product Line + Contact Type from the pages viewed.
    const cls = classify.classify(email, company, visits.map((v) => ({ path: v.path, title: v.page_title })));

    const note =
      "Website activity " + day + ": " + pageCount + " page view" + (pageCount === 1 ? "" : "s")
      + (dwellMin ? (", ~" + dwellMin + " min on site") : "") + ".\n"
      + "Pages: " + top.join("; ") + "\n" + cls.flag;

    if (diag) { // dry run: preview classification, write nothing
      if (clsSamples.length < 8) clsSamples.push({ email, company, productLine: cls.productLine, contactType: cls.contactType });
      continue;
    }

    try {
      const { contact, created: wasCreated } = await N.upsertContact({ email, company });
      if (wasCreated) {
        created++;
        // Only set fields on records WE create, so we never overwrite a rep's manual enrichment.
        try {
          await N.setContactCustomFields(contact.id, { "Product Line": cls.productLine, "Contact Type": cls.contactType });
          classified++;
        } catch (e) { if (errSamples.length < 3) errSamples.push({ email, step: "customFields", error: e.rpc || e.message }); }
      }
      await N.addNote(contact.id, note);
      noted++;
    } catch (e) {
      errors++;
      if (errSamples.length < 3) errSamples.push({ email, error: e.rpc || e.message, alsoTried: e.alsoTried });
    }
  }

  res.status(200).json({
    window: "24h", day,
    visitsRead: rows.length,
    identifiedVisitors: emails.length,
    skippedInternalVendorTest: skipped,
    contactsCreated: created,
    contactsClassified: classified,
    notesAdded: noted,
    errors, errSamples,
    classificationPreview: diag ? clsSamples : undefined,
    dryRun: !!diag,
  });
};
