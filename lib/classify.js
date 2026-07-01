// Classify a web-reg visitor into Nutshell Product Line + Contact Type from the
// pages they viewed and their email/company. Rules per David (2026-07-01).
// Enum values MUST match Nutshell exactly (see findCustomFields "Contacts").

// --- Product Line: page keyword -> specific enum value (+ category for fallback) ---
const LINE_RULES = [
  { line: "Digital Delay Generators",  cat: "tm",  re: /(pdg|delay[- ]?gen|delay generator|pulse[- ]?delay|pulse ?& ?delay|\b5(25|75|77|88)\b|model-?5(25|75|77|88)|\b745\b)/ },
  { line: "High Voltage/High Current", cat: "hv",  re: /(pvp|high[- ]?voltage|high[- ]?current|\b765\b|\bdei\b|pulser|\bptn\b|\bpnc\b|\bpcu\b)/ },
  { line: "RF / Micro",                cat: "tm",  re: /(rfsg|signal[- ]?gen|signal generator|\b8(45|55|65|70|71)b?\b|\brfs\b|rfs-|vsg|microwave)/ },
  { line: "Spectrum Analyzers",        cat: "tm",  re: /(\bicx\b|field[- ]?hawk|\brtsa\b|spectrum analyz|real[- ]?time spectrum)/ },
  { line: "Isotope Identification",    cat: "rad", re: /(riid|isotope|identifinder|radionuclide|\bsam\b|sam-?9|sam-?11|sampack|sammobile)/ },
  { line: "Nuclear Spectroscopy",      cat: "rad", re: /(scintiq|scintillat|nuclear spectro|gamma spectro|\bmca\b|multichannel analyz)/ },
  { line: "Power Analyzer",            cat: "tm",  re: /(power[- ]?meter|power[- ]?analyz|power[- ]?sensor|\b12000\b|121\d\d|122\d\d)/ },
];
const AWG_RE = /(\bawg\b|arbitrary|waveform|\b68[56]\b)/;                 // -> T&M category, no specific line
const RAD_RE = /(radiation|detector|nuclear|geiger|dosimet|neutron|\bgamma\b)/; // general nuclear signal

function productLines(pages) {
  const texts = (pages || []).map((p) => ((p.path || "") + " " + (p.title || "")).toLowerCase());
  const lineCount = {}, catCount = { tm: 0, rad: 0, hv: 0 };
  for (const t of texts) {
    let matched = false;
    for (const r of LINE_RULES) {
      if (r.re.test(t)) { lineCount[r.line] = (lineCount[r.line] || 0) + 1; catCount[r.cat]++; matched = true; }
    }
    if (AWG_RE.test(t)) { catCount.tm++; matched = true; }
    if (!matched && RAD_RE.test(t)) { catCount.rad++; }
  }
  const distinct = Object.keys(lineCount).sort((a, b) => lineCount[b] - lineCount[a]);
  // Clear: one or two specific lines (David: two is fine).
  if (distinct.length >= 1 && distinct.length <= 2) {
    return { lines: distinct.slice(0, 2), uncertain: false, reason: "matched product pages" };
  }
  const total = catCount.tm + catCount.rad + catCount.hv;
  const domCat = ["rad", "hv", "tm"].sort((a, b) => catCount[b] - catCount[a])[0];
  // Mixed (3+ distinct lines) or none matched -> general "All X" by dominant area.
  if (total > 0) {
    if (domCat === "rad") return { lines: ["All Rad"], uncertain: true, reason: "multiple/general nuclear interest" };
    if (domCat === "hv")  return { lines: ["High Voltage/High Current"], uncertain: true, reason: "mostly high voltage" };
    return { lines: ["All T&M"], uncertain: true, reason: "multiple/general T&M interest" };
  }
  return { lines: ["All BNC"], uncertain: true, reason: "no product pages visited" };
}

// --- Contact Type ---
const COMPETITOR_DOMAINS = [
  "keysight.com", "tabor.co.il", "taborelec.com", "thinksrs.com",
  "activetechnologies.it", "activetechnologies.com", "rohde-schwarz.com",
  "holzworth.com", "bkprecision.com", "morimicrowave.com",
];
const COMPETITOR_NAMES = [
  "keysight", "tabor", "stanford research", "active technologies",
  "rohde", "holzworth", "holdsworth", "bk precision", "mori microwave",
];
const FOREIGN_TLD = new Set([
  "uk", "de", "fr", "cn", "jp", "ca", "au", "se", "dk", "in", "br", "it", "es",
  "nl", "ch", "kr", "tw", "il", "be", "at", "fi", "no", "pl", "ru", "sg", "mx",
  "nz", "za", "ie", "pt", "gr", "cz", "hu", "ro", "tr", "th", "my", "ph", "id",
  "ua", "sk", "si", "hr", "lt", "lv", "ee", "is", "lu", "ae", "sa", "cl", "ar", "co",
]);

function contactType(email, company) {
  const dom = (String(email || "").toLowerCase().split("@")[1]) || "";
  const co = String(company || "").toLowerCase();
  const isComp = COMPETITOR_DOMAINS.some((d) => dom.endsWith(d))
    || COMPETITOR_NAMES.some((n) => co.includes(n) || dom.includes(n.replace(/[^a-z]/g, "")));
  if (isComp) return { type: "Competitor", uncertain: false, reason: "competitor domain/company" };
  const tld = dom.split(".").pop();
  if (FOREIGN_TLD.has(tld)) return { type: "Prospect International", uncertain: true, reason: "foreign email domain (verify)" };
  return { type: "Prospect Domestic", uncertain: true, reason: "defaulted domestic (verify)" };
}

// Convenience: full classification + a one-line flag for the battle card / note.
function classify(email, company, pages) {
  const pl = productLines(pages);
  const ct = contactType(email, company);
  const flag = "Auto-classified (verify): Product Line = " + pl.lines.join(" + ")
    + (pl.uncertain ? " [" + pl.reason + "]" : "")
    + "; Contact Type = " + ct.type + (ct.uncertain ? " [" + ct.reason + "]" : "") + ".";
  return { productLine: pl.lines, contactType: ct.type, uncertain: pl.uncertain || ct.uncertain, flag };
}

module.exports = { productLines, contactType, classify };
