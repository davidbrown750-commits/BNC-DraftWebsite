// Password login for the lobby display screens.
//
// POST { password } -> sets the bnc_sign cookie for a year, so the reception TV is
// unlocked once and then left alone. GET reports whether the caller is already in,
// which is what the sign-in page uses to skip straight through on a returning screen.
//
// Fails closed: with no LOBBY_SIGN_PASSWORD configured nobody gets in, rather than
// everybody. That matches api/lobby-feed.js, which 503s when its key is unset.
const { COOKIE, signToken, tokenMatches, signedIn } = require("../lib/lobby-gate");

// A wall-mounted screen should not be asked again every week.
const MAX_AGE = 60 * 60 * 24 * 365;

// A lobby TV is not a login form worth grinding, but the endpoint is public, so a
// slow rejection keeps a naive script from trying the dictionary quickly.
const WRONG_DELAY_MS = 700;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");

  if (req.method === "OPTIONS") { res.status(204).end(); return; }

  if (req.method === "GET") {
    res.status(200).json({ ok: true, signedIn: signedIn(req) });
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method not allowed" });
    return;
  }

  const expected = process.env.LOBBY_SIGN_PASSWORD;
  const secret = process.env.LOBBY_SIGN_SECRET;
  if (!expected || !secret) {
    res.status(503).json({ ok: false, error: "sign login not configured" });
    return;
  }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const given = (body && body.password) || "";

  if (!tokenMatches(given, expected)) {
    await sleep(WRONG_DELAY_MS);
    res.status(401).json({ ok: false, error: "wrong password" });
    return;
  }

  const token = signToken(secret);
  res.setHeader("Set-Cookie",
    `${COOKIE}=${token}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=Lax`);
  res.status(200).json({ ok: true });
};
