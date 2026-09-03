// BNC Academy free-pass acknowledgement.
//
// Wired into api/form.js's academy-access branch. Returns { subject, html, text } like
// ackContact/ackQuote/ackRma. Replaces the earlier inline ackAcademy() (catalog/picks-based,
// alec@berkeleynucleonicsacademy.com sender, "a human will follow up" copy) with the
// audience-classified, instant-access-code version Meraly reviewed and approved.
//
// Codes are supplied by the caller (or fall back to the constants below) so the Nutshell
// lookup stays the single source of truth for entitlement.

const CODES = {
  student: process.env.ACADEMY_CODE_STUDENT || "STUDENT_BNC_26",
  general: process.env.ACADEMY_CODE_GENERAL || "20_BNC_26",
};

const ACADEMY_URL = "https://academy.berkeleynucleonics.com/courses";
const LOGO_URL = "https://www.berkeleynucleonics.com/figures/home/bnc-academy-logo.png";

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// ---------------------------------------------------------------------------
// Audience determination: "student" | "general"
//
// Order matters, and rule 1 is the one that earns its keep. A professor on a .edu
// is not a student, and they are the single likeliest person to forward this to a
// class, so they must resolve to general and receive the forwarding panel.
// ---------------------------------------------------------------------------
const RE_FACULTY = /\b(professor|prof\b|faculty|lecturer|instructor|teacher|advisor|adviser|dean|provost|principal investigator|\bpi\b|staff scientist|research scientist|department head|dept head|chair(man|person)?|director)\b/;
const RE_STUDENT = /\b(student|undergrad\w*|grad(uate)? student|ph\.?d\.? (student|candidate)|masters? student|m\.?sc|b\.?sc|intern|apprentice|trainee|cadet|pupil)\b/;
const RE_ACADEMIC_ORG = /\b(universit|college|polytechnic|institute of technology|\bschool\b|academia|universidad|universit[eé]|universit[aä]t|hochschule|ecole|escuela)/;
const RE_ACADEMIC_TLD = /(^|\.)(edu|ac)\.[a-z]{2,}$|\.edu$/;

function academyAudience({ email, role, company } = {}) {
  const r = String(role || "").toLowerCase();
  const c = String(company || "").toLowerCase();
  const domain = String(email || "").toLowerCase().split("@")[1] || "";

  if (RE_FACULTY.test(r)) return "general";       // 1. stated faculty outranks their domain
  if (RE_STUDENT.test(r)) return "student";       // 2. stated student
  if (RE_ACADEMIC_TLD.test(domain)) return "student";  // 3. .edu / .ac.uk / .edu.au ...
  if (RE_ACADEMIC_ORG.test(c)) return "student";  // 4. academic-looking employer
  return "general";                               // 5. default
}

// Collect the checked course boxes (course_NUC01 = "NUC 01 Nuclear Radiation 101").
function academyCourses(body) {
  const out = [];
  Object.keys(body || {}).forEach((k) => {
    if (!/^course_/i.test(k)) return;
    const v = String(body[k] || "").trim();
    if (!v) return;
    const m = v.match(/^([A-Z]{2,3}\s?\d{2})\s+(.*)$/);
    out.push(m ? { code: m[1], title: m[2] } : { code: "", title: v });
  });
  return out;
}

// ---------------------------------------------------------------------------
// Template
// ---------------------------------------------------------------------------
function ackAcademy({ hello, replyTo, audience, courses, code, signName } = {}) {
  const aud = audience === "student" ? "student" : "general";
  const theCode = code || CODES[aud];
  const list = Array.isArray(courses) ? courses : [];
  const sign = signName || "Meraly Rodas";

  const courseRows = list.length
    ? list.map((c) =>
        '<tr><td style="padding:9px 0;border-bottom:1px solid #d8dee6;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1b2430;">' +
        (c.code ? '<span style="color:#0655a3;font-weight:bold;">' + esc(c.code) + "</span> &nbsp;" : "") +
        esc(c.title) + "</td></tr>").join("")
    : '<tr><td style="padding:9px 0;border-bottom:1px solid #d8dee6;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#5b6875;">Every course in the catalog is open to you with this code.</td></tr>';

  const html =
'<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">' +
'<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office"><head>' +
'<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />' +
'<meta name="viewport" content="width=device-width, initial-scale=1" />' +
'<meta name="x-apple-disable-message-reformatting" />' +
'<meta name="color-scheme" content="light" /><meta name="supported-color-schemes" content="light" />' +
'<title>Your BNC Academy access code</title>' +
'<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->' +
'<style type="text/css">' +
'body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}' +
'table,td{mso-table-lspace:0pt;mso-table-rspace:0pt}' +
'img{-ms-interpolation-mode:bicubic;border:0;outline:none;text-decoration:none}a{color:#0655a3}' +
'@media screen{' +
'.bnc-flap{transform-origin:top center;animation:bncOpen .75s cubic-bezier(.2,.75,.3,1) both}' +
'.bnc-card{animation:bncRise .85s cubic-bezier(.2,.7,.3,1) .18s both}' +
'@keyframes bncOpen{from{transform:scaleY(.06)}to{transform:scaleY(1)}}' +
'@keyframes bncRise{from{transform:translateY(24px)}to{transform:translateY(0)}}}' +
'@media (prefers-reduced-motion:reduce){.bnc-flap,.bnc-card{animation:none !important}}' +
'@media only screen and (max-width:620px){.bnc-wrap{width:100% !important}.bnc-pad{padding-left:22px !important;padding-right:22px !important}.bnc-code{font-size:21px !important;letter-spacing:1px !important}.bnc-h1{font-size:23px !important}}' +
'</style></head>' +
'<body style="margin:0;padding:0;background:#eef2f7;">' +
'<div style="display:none;font-size:1px;color:#eef2f7;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">Your BNC Academy access code is inside, along with the courses you asked for.' +
"&#8203;&nbsp;".repeat(10) + '</div>' +
'<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#eef2f7;"><tr><td align="center" style="padding:28px 12px;">' +
'<table role="presentation" class="bnc-wrap" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:600px;">' +

// masthead
'<tr><td align="center" style="background:#ffffff;border:1px solid #d8dee6;border-bottom:0;border-radius:4px 4px 0 0;padding:26px 24px 20px;">' +
'<a href="https://academy.berkeleynucleonics.com/" style="text-decoration:none;">' +
'<img src="' + LOGO_URL + '" width="132" height="107" alt="Berkeley Nucleonics Academy" style="display:block;width:132px;height:107px;border:0;" /></a></td></tr>' +

// envelope
'<tr><td style="background:#ffffff;border-left:1px solid #d8dee6;border-right:1px solid #d8dee6;padding:0 0 4px;">' +
'<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#113163;">' +
'<tr><td align="center" style="background:#113163;font-size:0;line-height:0;padding:0;">' +
'<!--[if !mso]><!--><div class="bnc-flap" style="width:0;height:0;margin:0 auto;border-left:300px solid transparent;border-right:300px solid transparent;border-top:52px solid #0d2650;font-size:0;line-height:0;"></div><!--<![endif]-->' +
'<!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td height="22" style="height:22px;background:#0d2650;font-size:0;line-height:0;">&nbsp;</td></tr></table><![endif]-->' +
'</td></tr>' +
'<tr><td style="padding:0 18px 22px;">' +
'<table role="presentation" class="bnc-card" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#ffffff;border-radius:4px;">' +
'<tr><td class="bnc-pad" style="padding:34px 38px 30px;font-family:Arial,Helvetica,sans-serif;">' +

'<h1 class="bnc-h1" style="margin:0 0 6px;font-family:\'Myriad Pro\',Calibri,\'Segoe UI\',Arial,sans-serif;font-size:26px;line-height:1.25;color:#113163;font-weight:bold;">Your access code is here</h1>' +
'<p style="margin:0 0 20px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#0655a3;font-weight:bold;">Berkeley Nucleonics Academy</p>' +
'<p style="margin:0 0 16px;font-size:15px;line-height:1.62;color:#1b2430;">' + esc(hello || "Hello,") + '</p>' +
'<p style="margin:0 0 24px;font-size:15px;line-height:1.62;color:#1b2430;">Thank you for requesting access to the Academy. Your code is below. It unlocks the courses you selected, and you can start them whenever you like. There is no expiry on the material once you are enrolled.</p>' +

// the code, as live text
'<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 26px;"><tr>' +
'<td align="center" style="background:#f4f7fa;border:2px dashed #0655a3;border-radius:4px;padding:20px 16px 18px;">' +
'<p style="margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#5b6875;font-weight:bold;">Your access code</p>' +
'<p class="bnc-code" style="margin:0;font-family:Consolas,\'Courier New\',Courier,monospace;font-size:26px;line-height:1.2;letter-spacing:2px;color:#113163;font-weight:bold;">' + esc(theCode) + '</p>' +
'</td></tr></table>' +

'<p style="margin:0 0 10px;font-family:\'Myriad Pro\',Calibri,\'Segoe UI\',Arial,sans-serif;font-size:15px;color:#113163;font-weight:bold;">The courses you asked for</p>' +
'<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 26px;border-top:1px solid #d8dee6;">' + courseRows + '</table>' +

'<p style="margin:0 0 12px;font-family:\'Myriad Pro\',Calibri,\'Segoe UI\',Arial,sans-serif;font-size:15px;color:#113163;font-weight:bold;">Redeeming it takes about a minute</p>' +
'<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 26px;">' +
step(1, "Open the Academy and pick a course from the list above.") +
step(2, "Choose enroll, then enter the code above when you are asked for it.") +
step(3, "Repeat for each course you want. One code covers all of them.", true) +
'</table>' +

// CTA
'<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 6px;"><tr><td align="center">' +
'<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="' + ACADEMY_URL + '" style="height:44px;v-text-anchor:middle;width:250px;" arcsize="9%" strokecolor="#0655a3" fillcolor="#0655a3"><w:anchorlock/><center style="color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;">Open the Academy</center></v:roundrect><![endif]-->' +
'<!--[if !mso]><!--><a href="' + ACADEMY_URL + '" style="display:inline-block;background:#0655a3;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;line-height:44px;text-align:center;text-decoration:none;width:250px;border-radius:4px;">Open the Academy</a><!--<![endif]-->' +
'</td></tr></table>' +

'</td></tr></table></td></tr></table></td></tr>' +

// sign-off
'<tr><td class="bnc-pad" style="background:#ffffff;border-left:1px solid #d8dee6;border-right:1px solid #d8dee6;padding:0 30px 30px;font-family:Arial,Helvetica,sans-serif;">' +
'<p style="margin:0;font-size:15px;line-height:1.5;color:#1b2430;">' + esc(sign) + '<br /><span style="color:#5b6875;font-size:13px;">Berkeley Nucleonics Corporation</span></p></td></tr>' +

// footer
'<tr><td style="background:#113163;border-radius:0 0 4px 4px;padding:22px 30px;font-family:Arial,Helvetica,sans-serif;">' +
'<p style="margin:0 0 6px;font-size:12px;line-height:1.6;color:#ffffff;font-weight:bold;">Berkeley Nucleonics Corporation</p>' +
'<p style="margin:0 0 10px;font-size:12px;line-height:1.6;color:#b9c6d8;">2955 Kerner Blvd, San Rafael, CA 94901 &nbsp;&middot;&nbsp; +1 (800) 234-7858</p>' +
'<p style="margin:0 0 10px;font-size:11px;line-height:1.6;color:#8fa2bd;">You are receiving this because you requested Academy access at berkeleynucleonics.com. <a href="https://www.berkeleynucleonics.com/" style="color:#b9c6d8;">berkeleynucleonics.com</a></p>' +
'<p style="margin:0;font-size:11px;line-height:1.6;color:#6d81a0;">This address does not accept replies.</p>' +
'</td></tr>' +

'</table></td></tr></table></body></html>';

  // Plain-text part. Not optional: forwarding frequently degrades to text, some clients
  // prefer it outright, and a code that only exists in the HTML part is a code that gets lost.
  const textLines = [
    "BERKELEY NUCLEONICS ACADEMY",
    "",
    (hello || "Hello,"),
    "",
    "Thank you for requesting access to the Academy. Your code is below. It unlocks",
    "the courses you selected, and you can start them whenever you like.",
    "",
    "YOUR ACCESS CODE:  " + theCode,
    "",
    "The courses you asked for:",
  ];
  if (list.length) list.forEach((c) => textLines.push("  - " + (c.code ? c.code + "  " : "") + c.title));
  else textLines.push("  - Every course in the catalog is open to you with this code.");
  textLines.push(
    "",
    "Redeeming it:",
    "  1. Open " + ACADEMY_URL,
    "  2. Pick a course, choose enroll, and enter the code when asked.",
    "  3. Repeat for each course. One code covers all of them.",
    ""
  );
  textLines.push(
    sign,
    "Berkeley Nucleonics Corporation",
    "2955 Kerner Blvd, San Rafael, CA 94901  |  +1 (800) 234-7858",
    "",
    "This address does not accept replies."
  );

  return {
    subject: "Your BNC Academy access code is inside",
    html,
    text: textLines.join("\n"),
  };
}

function step(n, copy, last) {
  const pad = last ? "" : "padding:0 0 10px;";
  return '<tr><td width="26" valign="top" style="' + pad + 'font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#0655a3;font-weight:bold;">' + n + '.</td>' +
    '<td valign="top" style="' + pad + 'font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#1b2430;">' + esc(copy) + '</td></tr>';
}

module.exports = { ackAcademy, academyAudience, academyCourses, CODES };
