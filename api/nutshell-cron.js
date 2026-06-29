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
const SUPA = process.env.SUPABASE_URL;
const SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function authorized(req) {
  if (!process.env.CRON_SECRET) return true; // not enforced until you set it
  return req.headers.authorization === "Bearer " + process.env.CRON_SECRET;
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

  let created = 0, noted = 0, errors = 0;
  const errSamples = [];
  const emails = Object.keys(byEmail);

  for (const email of emails) {
    const visits = byEmail[email];
    const pages = visits.length;
    const dwellMin = Math.round(visits.reduce((a, v) => a + (v.dwell_seconds || 0), 0) / 60);
    const company = (visits.find((v) => v.company) || {}).company || null;
    const top = [...new Set(visits.map((v) => v.page_title || v.path).filter(Boolean))].slice(0, 10);
    const note =
      "Website activity " + day + ": " + pages + " page view" + (pages === 1 ? "" : "s")
      + (dwellMin ? (", ~" + dwellMin + " min on site") : "") + ".\n"
      + "Pages: " + top.join("; ");

    if (diag) continue; // dry run: count groups, write nothing

    try {
      const { contact, created: wasCreated } = await N.upsertContact({ email, company });
      if (wasCreated) created++;
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
    contactsCreated: created,
    notesAdded: noted,
    errors, errSamples,
    dryRun: !!diag,
  });
};
