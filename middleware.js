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
  ],
};

export default async function middleware(request) {
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
