// Markdown for Agents: serves a clean markdown rendition of any page when the
// client asks for it with `Accept: text/markdown`. Browsers are untouched, because
// their Accept header never contains text/markdown.
//
// Why this is worth having beyond the checkbox: a typical page here is ~340 KB, of
// which ~253 KB is a search index duplicated onto every page, and ~6,400 characters
// of mega-menu run before the first <h1>. An agent asking for markdown gets the
// article and its spec tables and nothing else, which is the whole point.
//
// Wired up in vercel.json with a `has` condition on the accept header:
//   /            -> /api/md?path=/
//   /:page.html  -> /api/md?path=/:page.html
//
// No npm dependencies: this repo has no package.json by design, so the HTML to
// markdown conversion is hand-rolled below against the shapes this site actually
// emits (h1-h6, p, ul/ol, table, a, strong/em, code, pre, blockquote, hr, br).

const BLOCKED = /^\/(api|_shared|lib|figures|docs\/pdfs|software)\//i;

function decodeEntities(s) {
  const named = {
    amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–",
    mdash: "—", hellip: "…", rsquo: "’", lsquo: "‘",
    ldquo: "“", rdquo: "”", times: "×", deg: "°",
    plusmn: "±", micro: "µ", ohm: "Ω", middot: "·",
    bull: "•", trade: "™", reg: "®", copy: "©",
  };
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, n) => (named[n] !== undefined ? named[n] : (named[n.toLowerCase()] !== undefined ? named[n.toLowerCase()] : m)));
}

// Tags become a space, not nothing. Section headings here are marked up as
// `<span class="num">1</span>Introduction`, which collapses to "1Introduction"
// if tags are simply deleted.
const clean = (s) => decodeEntities(String(s).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

// Cell text keeps pipes escaped so a value like "50 | 75 ohm" cannot break the table.
const cellText = (s) => clean(s).replace(/\|/g, "\\|");

function tableToMarkdown(html) {
  const rows = [];
  const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let tr;
  while ((tr = trRe.exec(html))) {
    const cells = [];
    const cellRe = /<(t[hd])\b([^>]*)>([\s\S]*?)<\/\1>/gi;
    let c;
    while ((c = cellRe.exec(tr[1]))) {
      const span = /colspan\s*=\s*["']?(\d+)/i.exec(c[2]);
      cells.push({ head: c[1].toLowerCase() === "th", text: cellText(c[3]) });
      // a colspan cell occupies extra columns; pad so the grid stays rectangular
      const n = span ? Math.min(parseInt(span[1], 10) || 1, 12) : 1;
      for (let i = 1; i < n; i++) cells.push({ head: c[1].toLowerCase() === "th", text: "" });
    }
    if (cells.length) rows.push(cells);
  }
  if (!rows.length) return "";
  const width = Math.max(...rows.map((r) => r.length));
  const pad = (r) => {
    const out = r.map((c) => c.text);
    while (out.length < width) out.push("");
    return out;
  };
  const out = [];
  const headerIsReal = rows[0].some((c) => c.head);
  if (headerIsReal) {
    out.push("| " + pad(rows[0]).join(" | ") + " |");
    out.push("|" + Array(width).fill("---").join("|") + "|");
    rows.slice(1).forEach((r) => out.push("| " + pad(r).join(" | ") + " |"));
  } else {
    // key/value tables with no <th>: emit a headerless grid that still parses
    out.push("|" + Array(width).fill(" ").join("|") + "|");
    out.push("|" + Array(width).fill("---").join("|") + "|");
    rows.forEach((r) => out.push("| " + pad(r).join(" | ") + " |"));
  }
  return out.join("\n") + "\n\n";
}

function listToMarkdown(html, ordered) {
  const items = [];
  const re = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
  let m;
  let i = 1;
  while ((m = re.exec(html))) {
    const t = inline(m[1]);
    if (t) items.push((ordered ? i++ + ". " : "- ") + t);
  }
  return items.length ? items.join("\n") + "\n\n" : "";
}

// Inline formatting inside a block: links, emphasis, code, line breaks.
function inline(html) {
  let s = String(html);
  s = s.replace(/<br\s*\/?>/gi, " ");
  s = s.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "");
  s = s.replace(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (m, href, txt) => {
    const label = clean(txt);
    if (!label) return "";
    if (/^(#|javascript:)/i.test(href)) return label;
    return "[" + label.replace(/[\[\]]/g, "") + "](" + href.trim() + ")";
  });
  s = s.replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, (m, _t, t) => {
    const v = clean(t);
    return v ? "**" + v + "**" : "";
  });
  s = s.replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, (m, _t, t) => {
    const v = clean(t);
    return v ? "*" + v + "*" : "";
  });
  s = s.replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, (m, t) => {
    const v = clean(t);
    return v ? "`" + v + "`" : "";
  });
  return clean(s);
}

function htmlToMarkdown(html) {
  let body = html;

  // Drop everything that is chrome, script, or style. The mega-menu is the big one.
  body = body.replace(/<!--[\s\S]*?-->/g, "");
  body = body.replace(/<(script|style|noscript|template|svg)\b[\s\S]*?<\/\1>/gi, "");
  body = body.replace(/<nav\b[\s\S]*?<\/nav>/gi, "");
  body = body.replace(/<header\b[\s\S]*?<\/header>/gi, "");
  body = body.replace(/<footer\b[\s\S]*?<\/footer>/gi, "");
  body = body.replace(/<form\b[\s\S]*?<\/form>/gi, "");

  // The page H1 frequently sits outside <main> on this site, so grab it before
  // narrowing. Losing it would drop the single most important line on the page.
  const h1m = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(body);
  const h1 = h1m ? inline(h1m[1]) : "";

  // Prefer the real content region when the page marks one.
  const main = /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(body);
  if (main) body = main[1];
  else {
    const b = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(body);
    if (b) body = b[1];
  }

  const hasOwnH1 = /<h1\b/i.test(body);

  // The FAQ carries 115 question/answer pairs as <details><summary>question</summary>.
  // The questions are the retrievable part, so promote each <summary> to a heading.
  // Where a summary already wraps its own heading, leave that heading to do the work.
  body = body.replace(/<summary\b[^>]*>([\s\S]*?)<\/summary>/gi, (m, inner) =>
    /<h[1-6]\b/i.test(inner) ? inner : "<h3>" + inner + "</h3>"
  );

  const out = [];
  // Walk the block-level elements in document order.
  const blockRe = /<(h[1-6]|p|ul|ol|table|pre|blockquote|hr)\b([^>]*)>([\s\S]*?)<\/\1>|<hr\b[^>]*\/?>/gi;
  let m;
  while ((m = blockRe.exec(body))) {
    const tag = (m[1] || "hr").toLowerCase();
    const inner = m[3] || "";
    if (tag === "hr") { out.push("---\n\n"); continue; }
    if (/^h[1-6]$/.test(tag)) {
      const t = inline(inner);
      if (t) out.push("#".repeat(Number(tag[1])) + " " + t + "\n\n");
    } else if (tag === "p") {
      const t = inline(inner);
      if (t) out.push(t + "\n\n");
    } else if (tag === "ul" || tag === "ol") {
      out.push(listToMarkdown(inner, tag === "ol"));
    } else if (tag === "table") {
      out.push(tableToMarkdown(inner));
    } else if (tag === "pre") {
      const t = decodeEntities(inner.replace(/<[^>]+>/g, "")).replace(/\s+$/, "");
      if (t.trim()) out.push("```\n" + t + "\n```\n\n");
    } else if (tag === "blockquote") {
      const t = inline(inner);
      if (t) out.push("> " + t + "\n\n");
    }
  }

  const md = out.join("").replace(/\n{3,}/g, "\n\n").trim();
  const titled = h1 && !hasOwnH1 ? "# " + h1 + "\n\n" + md : md;
  return titled + "\n";
}

module.exports = async (req, res) => {
  try {
    let path = (req.query && req.query.path) || "/";
    if (Array.isArray(path)) path = path[0];
    path = String(path);

    // Only ever serve our own pages, and never reach outside the site.
    if (!path.startsWith("/") || path.includes("..") || path.includes("//")) {
      res.status(400).send("Bad path");
      return;
    }
    if (BLOCKED.test(path)) { res.status(404).send("Not available as markdown"); return; }
    if (path !== "/" && !/\.html$/i.test(path)) { res.status(404).send("Not available as markdown"); return; }

    const host = req.headers["x-forwarded-host"] || req.headers.host;
    const proto = req.headers["x-forwarded-proto"] || "https";
    const target = proto + "://" + host + path;

    const upstream = await fetch(target, {
      headers: {
        // Ask for HTML explicitly so this request cannot re-enter the markdown rewrite.
        accept: "text/html",
        "user-agent": "bnc-markdown-renderer",
      },
      redirect: "follow",
    });

    if (!upstream.ok) {
      res.status(upstream.status).send("Upstream " + upstream.status);
      return;
    }

    const html = await upstream.text();
    const md = htmlToMarkdown(html);

    const title = (/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html) || [])[1];
    const canonical = (/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i.exec(html) || [])[1];
    const header =
      (title ? "<!-- " + clean(title) + " -->\n" : "") +
      (canonical ? "<!-- source: " + canonical.trim() + " -->\n" : "");
    const out = header ? header + "\n" + md : md;

    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400");
    res.setHeader("Vary", "Accept");
    res.setHeader("X-Markdown-Tokens", String(Math.ceil(out.length / 4)));
    res.setHeader("Link", '<' + path + '>; rel="canonical"');
    res.status(200).send(out);
  } catch (e) {
    res.status(500).send("Markdown conversion failed");
  }
};

// Exported for offline testing of the converter without deploying.
module.exports.htmlToMarkdown = htmlToMarkdown;
