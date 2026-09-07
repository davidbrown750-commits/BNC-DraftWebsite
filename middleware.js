// Edge middleware: routes `Accept: text/markdown` requests to the markdown renderer.
//
// Why this exists rather than a vercel.json rewrite: Vercel resolves the filesystem
// BEFORE it evaluates rewrites, and every page here is a real .html file (and `/`
// resolves to index.html). A rewrite with a `has` condition on the accept header
// therefore never fires. Middleware runs ahead of the filesystem, so it can.
//
// Cost: this runs only on `/` and on .html page requests, per the matcher below.
// Assets, PDFs, figures and the API are excluded. For any request whose Accept
// header does not mention text/markdown, which is every browser request, it returns
// immediately without doing any work.
//
// `books/` used to be excluded here, which meant the 190 web book pages in the
// sitemap, roughly a third of the indexable site and the longest-form technical
// writing on it, were the one body of content an agent could not read as
// markdown. Those pages are also the heaviest: a chapter is about 100 KB of HTML
// against 124 KB for a datasheet, so they had the most to gain from conversion
// and were getting none of it. The added cost is invocations on pages that
// already fall through in a few microseconds unless the request asks for
// markdown, which no browser does.

export const config = {
  matcher: [
    "/",
    "/((?!api/|_shared/|lib/|figures/|docs/pdfs/|software/).*\\.html)",
    // The lobby display screens. These carry booked revenue, customer names and RMA
    // numbers on a wall in a public room, so they are gated here rather than by a
    // client-side reveal: middleware runs ahead of the filesystem, so an unauthenticated
    // request never receives the HTML at all.
    "/lobby-sign",
    "/lobby-sign/:path*",
    "/screen",
    "/screen/:path*",
  ],
};

// --- lobby screen gate -------------------------------------------------------
// Verifies the same HMAC that lib/lobby-gate.js issues. Keep PAYLOAD, the hex
// encoding and the cookie name identical in both files.
const SIGN_COOKIE = "bnc_sign";
const SIGN_PAYLOAD = "lobby-sign-v1";

function timingSafeEqualStr(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function expectedSignToken(secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(SIGN_PAYLOAD));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function lobbyGate(request, url) {
  const secret = process.env.LOBBY_SIGN_SECRET;
  // Fail closed. An unset secret must not silently reopen the screens.
  if (!secret) return Response.redirect(new URL("/lobby-signin.html", url.origin), 302);

  // An existing ?k= bookmark keeps working, so the reception TV does not break the
  // moment this ships.
  const key = url.searchParams.get("k") || url.searchParams.get("key") || "";
  const feedKey = process.env.LOBBY_FEED_KEY || "";
  if (key && feedKey && timingSafeEqualStr(key, feedKey)) return;

  const cookie = request.cookies.get(SIGN_COOKIE);
  const token = cookie && cookie.value ? cookie.value : "";
  if (token && timingSafeEqualStr(token, await expectedSignToken(secret))) return;

  const to = new URL("/lobby-signin.html", url.origin);
  to.searchParams.set("next", url.pathname + url.search);
  return Response.redirect(to, 302);
}

export default async function middleware(request) {
  {
    const url = new URL(request.url);
    if (url.pathname === "/lobby-sign" || url.pathname.startsWith("/lobby-sign/") ||
        url.pathname === "/screen" || url.pathname.startsWith("/screen/")) {
      const blocked = await lobbyGate(request, url);
      if (blocked) return blocked;
      return;
    }
  }

  // Legacy WordPress parameter URLs (?s= site search, ?replytocom= comment
  // replies) used to be robots-blocked, which left Google unable to crawl the
  // ones it had already indexed. 301 them to the clean path instead so search
  // engines consolidate onto the canonical URL.
  {
    const url = new URL(request.url);
    if (url.searchParams.has("s") || url.searchParams.has("replytocom")) {
      url.searchParams.delete("s");
      url.searchParams.delete("replytocom");
      return Response.redirect(url.toString(), 301);
    }
  }

  const accept = (request.headers.get("accept") || "").toLowerCase();

  // Browsers send text/html,application/xhtml+xml,... and never text/markdown,
  // so they fall straight through and are served the normal static page.
  if (!accept.includes("text/markdown")) return;

  const url = new URL(request.url);
  const path = url.pathname === "/" ? "/home.html" : url.pathname;

  const target = new URL("/api/md", url.origin);
  target.searchParams.set("path", path);

  // api/md.js fetches the page with `Accept: text/html`, so that inner request
  // falls through this middleware untouched and cannot loop back here.
  const res = await fetch(target.toString(), {
    headers: { accept: "text/markdown" },
  });

  // If rendering fails for any reason, fall through to the normal HTML page
  // rather than serving an error to an agent.
  if (!res.ok) return;

  return res;
}
