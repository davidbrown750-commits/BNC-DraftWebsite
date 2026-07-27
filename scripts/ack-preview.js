// Renders the three customer acknowledgements (RMA, quote, contact) from the real builders in
// api/form.js, so the copy can be reviewed without submitting a form or sending mail.
//   node scripts/ack-preview.js            -> writes tmp/ack-preview/*.html + index.html
//   node scripts/ack-preview.js --json     -> prints { subject, from, replyTo, bcc, html, text }
const fs = require("fs");
const path = require("path");
const F = require("../api/form.js");

const SAMPLES = [
  {
    key: "rma",
    form: "RMA Request form (rma.html)",
    build: () => F.ackRma({
      hello: "Hello Karen,",
      replyTo: F.ackIdentity("rma").replyTo,
      model: "SAM 950",
      serials: ["100200", "100201"],
      reason: "Annual calibration and battery replacement",
      company: "Example County Fire Department",
    }),
    identity: F.ackIdentity("rma"),
  },
  {
    key: "quote",
    form: "Quote / Demo form (get-quote.html)",
    build: () => F.ackQuote({
      hello: "Hello Daniel,",
      replyTo: F.ackIdentity("quote").replyTo,
      model: "Model 577 Pulse Generator",
      quantity: "2",
      country: "United States",
      company: "Example National Laboratory",
    }),
    identity: F.ackIdentity("quote"),
  },
  {
    key: "contact",
    form: "Contact Us form (contact.html)",
    build: () => F.ackContact({
      hello: "Hello Priya,",
      replyTo: F.ackIdentity("contact").replyTo,
      company: "Example Aerospace Systems",
      phone: "(555) 204-8817",
      source: "Search engine",
    }),
    identity: F.ackIdentity("contact"),
  },
];

const rendered = SAMPLES.map((s) => {
  const ack = s.build();
  return {
    key: s.key, form: s.form, subject: ack.subject,
    from: s.identity.from, replyTo: s.identity.replyTo, bcc: F.ACK_BCC,
    html: ack.html, text: ack.text,
  };
});

if (process.argv.indexOf("--json") !== -1) {
  process.stdout.write(JSON.stringify(rendered, null, 2));
} else {
  const out = path.join(__dirname, "..", "tmp", "ack-preview");
  fs.mkdirSync(out, { recursive: true });
  const meta = (r) =>
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto 0;padding:14px 16px;background:#113163;color:#c7d5ea;border-radius:4px 4px 0 0;font-size:12.5px;line-height:1.75">' +
    '<div style="color:#ffffff;font-weight:bold;font-size:14px;margin-bottom:6px">' + r.form + "</div>" +
    "From: " + r.from + "<br>Reply-To: " + r.replyTo + "<br>Bcc: " + (r.bcc.join(", ") || "(none)") +
    "<br>Subject: " + r.subject + "</div>";
  for (const r of rendered) {
    fs.writeFileSync(path.join(out, r.key + ".html"), r.html, "utf8");
    fs.writeFileSync(path.join(out, r.key + ".txt"), r.text, "utf8");
  }
  fs.writeFileSync(
    path.join(out, "index.html"),
    '<!doctype html><meta charset="utf-8"><title>BNC form acknowledgements</title>' +
    '<body style="margin:0;background:#eef3f9;padding:24px 12px">' +
    rendered.map((r) => '<div style="padding-top:26px">' + meta(r) + r.html + "</div>").join("") +
    "</body>",
    "utf8"
  );
  console.log("wrote " + out);
}
