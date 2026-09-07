// Shared password gate for the lobby display screens.
//
// The lobby sign and the visitor/did-you-know screens hang on a wall in a public
// room, but they carry booked revenue, customer names and RMA numbers. Until now
// /lobby-sign/ was served to anyone who knew the URL. This gates it.
//
// The cookie is an HMAC of a fixed string under LOBBY_SIGN_SECRET, so it cannot be
// forged without the secret and carries nothing about the viewer. The password
// itself never reaches the browser: it is compared server-side in api/lobby-login.js
// against LOBBY_SIGN_PASSWORD.
//
// Edge middleware verifies the same token with Web Crypto (see middleware.js). Keep
// COOKIE, PAYLOAD and the hex encoding identical in both or a valid cookie will be
// rejected at the edge.
const crypto = require("crypto");

const COOKIE = "bnc_sign";
const PAYLOAD = "lobby-sign-v1";

function signToken(secret) {
  return crypto.createHmac("sha256", String(secret)).update(PAYLOAD).digest("hex");
}

// Length-checked constant-time compare. timingSafeEqual throws on length mismatch,
// which would itself leak, so the length is checked first and separately.
function tokenMatches(given, expected) {
  const a = Buffer.from(String(given || ""), "utf8");
  const b = Buffer.from(String(expected || ""), "utf8");
  if (a.length === 0 || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function readCookie(req, name) {
  const raw = (req.headers && req.headers.cookie) || "";
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return "";
}

// True when the caller presents either a valid sign cookie or the shared feed key.
// The key path exists so an existing ?k= bookmark keeps working unchanged.
function signedIn(req) {
  const secret = process.env.LOBBY_SIGN_SECRET;
  if (secret && tokenMatches(readCookie(req, COOKIE), signToken(secret))) return true;
  const feedKey = process.env.LOBBY_FEED_KEY;
  if (feedKey) {
    const given = (req.query && (req.query.k || req.query.key)) || "";
    if (tokenMatches(given, feedKey)) return true;
  }
  return false;
}

module.exports = { COOKIE, PAYLOAD, signToken, tokenMatches, readCookie, signedIn };
