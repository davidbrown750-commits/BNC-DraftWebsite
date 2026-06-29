// Shared Nutshell JSON-RPC client (zero npm deps; uses global fetch + node crypto via Basic auth).
// Vercel env vars:
//   NUTSHELL_API_USER  = your Nutshell login email OR company domain (Setup -> API)
//   NUTSHELL_API_KEY   = the Nutshell API key/token (SECRET, server-side only)
// Endpoint + auth per https://developers-rpc.nutshell.com/ :
//   discovery: POST https://api.nutshell.com/v1/json  method getApiForUsername
//   calls:     POST https://<account-host>/api/v1/json  with HTTP Basic (user:key)

const DISCOVERY = "https://api.nutshell.com/v1/json";
const DEFAULT_HOST = "app.nutshell.com";

function creds() {
  return { user: process.env.NUTSHELL_API_USER || "", key: process.env.NUTSHELL_API_KEY || "" };
}
function hasCreds() {
  const c = creds();
  return !!(c.user && c.key);
}

let _endpoint = null, _endpointAt = 0;
async function endpoint() {
  if (_endpoint && Date.now() - _endpointAt < 3600000) return _endpoint;
  const { user } = creds();
  let host = DEFAULT_HOST;
  try {
    const r = await fetch(DISCOVERY, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "disc", jsonrpc: "2.0", method: "getApiForUsername", params: { username: user } }),
    });
    const j = await r.json();
    if (j && j.result && j.result.api) host = j.result.api;
  } catch (e) { /* fall back to default host */ }
  _endpoint = "https://" + host + "/api/v1/json";
  _endpointAt = Date.now();
  return _endpoint;
}

async function rpc(method, params) {
  const { user, key } = creds();
  const url = await endpoint();
  const auth = "Basic " + Buffer.from(user + ":" + key).toString("base64");
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: auth },
    body: JSON.stringify({ id: method, jsonrpc: "2.0", method, params: params || {} }),
  });
  let j = null;
  try { j = await r.json(); } catch (e) { throw new Error("nutshell non-json response (HTTP " + r.status + ")"); }
  if (j && j.error) { const e = new Error(j.error.message || "nutshell rpc error"); e.rpc = j.error; throw e; }
  return j ? j.result : null;
}

// Find a person by email. searchByEmail returns {contacts, leads, accounts}.
async function findContactByEmail(email) {
  const res = await rpc("searchByEmail", { emailAddressString: String(email) });
  const list = (res && res.contacts) || [];
  return list.length ? list[0] : null; // {id:"1234-contacts", name, ...}
}

async function createContact({ name, email, phone, description }) {
  const contact = {};
  if (name) contact.name = name;
  if (email) contact.email = [String(email)];
  if (phone) contact.phone = [String(phone)];
  if (description) contact.description = description;
  return rpc("newContact", { contact }); // -> {id, rev, ...}
}

// Add a timeline note to a contact. Nutshell IDs are stubs like "1234-contacts";
// some API shards expect {entity:{entityType,id}}, others {links:{parent:stub}} — try both.
async function addNote(contactId, note) {
  const stub = String(contactId);
  const numeric = Number(stub.split("-")[0]);
  try {
    return await rpc("newNote", { entity: { entityType: "Contacts", id: numeric }, note: note });
  } catch (e1) {
    try {
      return await rpc("newNote", { note: note, links: { parent: stub } });
    } catch (e2) {
      e2.alsoTried = (e1.rpc || e1.message);
      throw e2;
    }
  }
}

// Find-or-create, returns {contact, created:bool}.
async function upsertContact({ email, name, phone, company }) {
  let contact = await findContactByEmail(email);
  if (contact) return { contact, created: false };
  const created = await createContact({
    name: name || company || String(email).split("@")[0],
    email, phone,
  });
  return { contact: created, created: true };
}

module.exports = { hasCreds, creds, endpoint, rpc, findContactByEmail, createContact, addNote, upsertContact };
