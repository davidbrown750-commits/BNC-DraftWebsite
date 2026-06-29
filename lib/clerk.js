// Minimal Clerk session-token verification (RS256 against the public JWKS, zero npm deps).
// Mirrors the verifier already used in api/visitors.js.
const crypto = require("crypto");
const CLERK_ISSUER = "https://clerk.berkeleynucleonics.com";

let _jwks = null, _jwksAt = 0;
async function getJwks() {
  if (_jwks && Date.now() - _jwksAt < 3600000) return _jwks;
  const r = await fetch(CLERK_ISSUER + "/.well-known/jwks.json");
  if (!r.ok) throw new Error("jwks " + r.status);
  _jwks = await r.json(); _jwksAt = Date.now();
  return _jwks;
}

function b64urlToBuf(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Buffer.from(s, "base64");
}

// Returns the verified claims object, or null if invalid/expired.
async function verifyClerkToken(jwt) {
  try {
    const parts = (jwt || "").split(".");
    if (parts.length !== 3) return null;
    const head = JSON.parse(b64urlToBuf(parts[0]).toString("utf8"));
    const jwks = await getJwks();
    const jwk = (jwks.keys || []).find((k) => k.kid === head.kid);
    if (!jwk) return null;
    const key = crypto.createPublicKey({ key: jwk, format: "jwk" });
    const ok = crypto.verify(
      "RSA-SHA256",
      Buffer.from(parts[0] + "." + parts[1]),
      key,
      b64urlToBuf(parts[2])
    );
    if (!ok) return null;
    const p = JSON.parse(b64urlToBuf(parts[1]).toString("utf8"));
    const now = Math.floor(Date.now() / 1000);
    if (p.exp && now > p.exp + 5) return null;
    if (p.nbf && now < p.nbf - 5) return null;
    if (p.iss && p.iss.indexOf("clerk.berkeleynucleonics.com") === -1) return null;
    return p;
  } catch (e) { return null; }
}

module.exports = { verifyClerkToken };
