// /api/chat.js — BNC custom AI assistant (RAG over the real datasheets + Claude).
// Replaces the generic Nutshell bot: every answer is grounded in retrieved BNC
// content, so model numbers / specs / ranges are accurate (never invented).
//
// Vercel env vars (Project Settings -> Environment Variables):
//   ANTHROPIC_API_KEY          = Anthropic API key  (SECRET; required to answer)
//   ANTHROPIC_MODEL            = optional, default "claude-sonnet-4-6"
//   SUPABASE_URL               = already set (used by track.js / visitors.js)
//   SUPABASE_SERVICE_ROLE_KEY  = already set (SECRET, server-side only)
//   NUTSHELL_API_USER / NUTSHELL_API_KEY = optional; when present, captured chat
//                                leads are also pushed to Nutshell (else just stored).
//
// Fail-soft: if ANTHROPIC_API_KEY is missing, returns a friendly message instead
// of erroring, so the widget degrades gracefully until the key is added.

// (deploy nonce: force a fresh build so newly-added env vars are applied)
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
const SUPA = process.env.SUPABASE_URL;
const SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL_RE = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/;

async function readBody(req) {
  if (req.body) return typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  let raw = "";
  await new Promise((r) => { req.on("data", (c) => (raw += c)); req.on("end", r); });
  return raw ? JSON.parse(raw) : {};
}

// --- retrieve relevant BNC content via the kb_search FTS RPC ---
async function retrieve(query, k) {
  if (!SUPA || !SKEY) return [];
  try {
    const r = await fetch(SUPA + "/rest/v1/rpc/kb_search", {
      method: "POST",
      headers: { apikey: SKEY, Authorization: "Bearer " + SKEY, "Content-Type": "application/json" },
      body: JSON.stringify({ q: query.slice(0, 400), k: k || 6 }),
    });
    if (!r.ok) return [];
    return await r.json();
  } catch (e) { return []; }
}

function buildContext(chunks) {
  if (!chunks.length) return "(no matching BNC documents were found for this question)";
  return chunks.map((c, i) =>
    `[${i + 1}] ${c.title || "BNC"}${c.product_line ? " — " + c.product_line : ""}\nURL: ${c.url}\n${c.content}`
  ).join("\n\n---\n\n");
}

const SYSTEM = (context) => `You are the Berkeley Nucleonics (BNC) assistant on berkeleynucleonics.com. You help engineers and buyers find the right instrument and answer technical questions about BNC products: pulse & delay generators, RF & microwave signal generators, arbitrary waveform generators, DEI pulsed-power / high-voltage, PVP-Series, ScintIQ scintillation detectors, ICX-FieldHawk spectrum analyzers, and isotope-ID / radiation detection.

Answer ONLY from the BNC SOURCES below. These are excerpts from the actual BNC datasheets, application notes, manuals, and pages.

RULES:
- Never invent or guess specifications, model numbers, prices, certifications, or availability. If the sources do not contain the answer, say so plainly and offer to connect them with a BNC engineer.
- When you state a spec (frequency range, channel count, voltage, etc.), it must come from the sources. Cite the product/model by name.
- Link to the relevant page using its URL from the sources when helpful.
- Keep answers concise and concrete. Use short paragraphs or tight bullet lists. No emoji. No em dashes.
- For export-control, ITAR/EAR, or "can I buy/ship to X country" questions, do not make a determination; say a BNC representative (David Brown / John Reynolds) will advise.
- If the user seems ready to buy, wants a quote, or wants to talk to a person, tell them they can click "Chat with a BNC engineer" at the top of this chat window to reach someone live, or leave their name and email for a follow-up. Be helpful, not pushy.
- If you cannot answer from the sources, say so and point them to "Chat with a BNC engineer" at the top of the window.

BNC SOURCES:
${context}`;

// --- stream from Anthropic, relay text deltas to the browser as SSE ---
async function streamAnthropic(res, model, system, messages) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({ model, max_tokens: 1024, system, stream: true, messages }),
  });
  if (!r.ok || !r.body) {
    const t = await r.text().catch(() => "");
    res.write(`data: ${JSON.stringify({ delta: "Sorry, I could not reach the assistant just now. Please try again, or use Get a Quote to reach an engineer." })}\n\n`);
    return "";
  }
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "", full = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const ev = JSON.parse(payload);
        if (ev.type === "content_block_delta" && ev.delta && ev.delta.type === "text_delta") {
          full += ev.delta.text;
          res.write(`data: ${JSON.stringify({ delta: ev.delta.text })}\n\n`);
        }
      } catch (e) { /* ignore keep-alives / partials */ }
    }
  }
  return full;
}

// --- capture a chat lead (Supabase now; Nutshell if creds present) ---
async function captureLead(session) {
  if (!SUPA || !SKEY || !session.email) return;
  try {
    const row = {
      session_id: session.sessionId || null,
      email: session.email.toLowerCase(),
      name: session.name || null,
      first_question: session.firstQuestion || null,
      transcript: session.transcript || null,
      product_interest: session.productInterest || null,
      visitor_known: !!session.visitorKnown,
      updated_at: new Date().toISOString(),
    };
    await fetch(SUPA + "/rest/v1/bnc_chat_leads?on_conflict=session_id", {
      method: "POST",
      headers: {
        apikey: SKEY, Authorization: "Bearer " + SKEY, "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(row),
    });
  } catch (e) { /* non-fatal */ }
}

// Store a "talk to a human" request as a high-priority lead.
async function storeHumanLead(b) {
  if (!SUPA || !SKEY) return;
  try {
    const row = {
      session_id: b.sessionId || null,
      email: (b.email || "").toLowerCase() || null,
      name: b.name || null,
      first_question: b.message || null,
      transcript: { phone: b.phone || null, wants_human: true, message: b.message || null, convo: b.transcript || null },
      product_interest: "Human request",
      updated_at: new Date().toISOString(),
    };
    await fetch(SUPA + "/rest/v1/bnc_chat_leads?on_conflict=session_id", {
      method: "POST",
      headers: { apikey: SKEY, Authorization: "Bearer " + SKEY, "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(row),
    });
  } catch (e) { /* non-fatal */ }
}

// Optional instant email alert to the team (set SENDGRID_API_KEY + LEAD_NOTIFY_TO + LEAD_NOTIFY_FROM).
async function notifyHuman(b) {
  const key = process.env.SENDGRID_API_KEY, to = process.env.LEAD_NOTIFY_TO, from = process.env.LEAD_NOTIFY_FROM;
  if (!key || !to || !from) return;
  try {
    const text = 'New "talk to a human" request from the website chat.\n\n' +
      "Name: " + (b.name || "-") + "\nEmail: " + (b.email || "-") + "\nPhone: " + (b.phone || "-") +
      "\nMessage: " + (b.message || "-") + "\nSession: " + (b.sessionId || "-");
    await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({
        personalizations: [{ to: to.split(",").map(function (e) { return { email: e.trim() }; }) }],
        from: { email: from }, subject: "Website chat: talk-to-a-human request",
        content: [{ type: "text/plain", value: text }],
      }),
    });
  } catch (e) { /* non-fatal */ }
}

module.exports = async function handler(req, res) {
  // Safe diagnostic: GET /api/chat?diag=1 -> booleans only (never reveals secrets)
  if (req.method === "GET") {
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      ok: true,
      hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
      model: MODEL,
      hasSupabase: !!(SUPA && SKEY),
    });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }

  let body;
  try { body = await readBody(req); } catch (e) { res.status(400).json({ error: "bad json" }); return; }

  // "Talk to a human" request (bypasses Nutshell): store the lead + optional email alert
  if (body.action === "human") {
    await storeHumanLead(body);
    await notifyHuman(body);
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ ok: true });
    return;
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser) { res.status(400).json({ error: "no user message" }); return; }

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  // 1) retrieve grounding content from the real BNC corpus
  const chunks = await retrieve(lastUser.content, 6);
  const sources = chunks.map((c) => ({ title: c.title, url: c.url, product_line: c.product_line }))
    .filter((s, i, a) => a.findIndex((x) => x.url === s.url) === i).slice(0, 5);

  if (!process.env.ANTHROPIC_API_KEY) {
    res.write(`data: ${JSON.stringify({ delta: "The assistant is being set up and will be live shortly. In the meantime, use Get a Quote/Demo or call us and a BNC engineer will help right away." })}\n\n`);
    res.write(`data: ${JSON.stringify({ done: true, sources })}\n\n`);
    res.end(); return;
  }

  // 2) build the grounded prompt and stream the answer
  const convo = messages.filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-10).map((m) => ({ role: m.role, content: String(m.content || "").slice(0, 4000) }));
  let full = "";
  try {
    full = await streamAnthropic(res, MODEL, SYSTEM(buildContext(chunks)), convo);
  } catch (e) {
    res.write(`data: ${JSON.stringify({ delta: "Sorry, something went wrong. Please try again." })}\n\n`);
  }

  // 3) capture a lead if the visitor shared an email anywhere in the chat
  const allText = messages.map((m) => m.content).join(" ") + " " + (body.visitor && body.visitor.email || "");
  const emailMatch = allText.match(EMAIL_RE);
  if (emailMatch) {
    const lineCounts = {};
    for (const c of chunks) if (c.product_line) lineCounts[c.product_line] = (lineCounts[c.product_line] || 0) + 1;
    const productInterest = Object.keys(lineCounts).sort((a, b) => lineCounts[b] - lineCounts[a])[0] || null;
    await captureLead({
      sessionId: body.sessionId,
      email: emailMatch[0],
      name: (body.visitor && body.visitor.name) || null,
      firstQuestion: (messages.find((m) => m.role === "user") || {}).content || null,
      transcript: messages.slice(-20),
      productInterest,
      visitorKnown: !!(body.visitor && body.visitor.known),
    });
  }

  res.write(`data: ${JSON.stringify({ done: true, sources })}\n\n`);
  res.end();
};
