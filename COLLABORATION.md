# Collaborating on the Berkeley Nucleonics website

Welcome. This repo **is** the live site. A push to `main` deploys to
**www.berkeleynucleonics.com** through Vercel in about one to two minutes. There is
no separate staging step: `main` is production. Every change is a commit and every
deploy is retained, so nothing here is ever unrecoverable. If something looks wrong,
rollback is one click (see the last section).

## Push straight to `main` — do NOT open pull requests

You have Write access and `main` is not protected, so **commit directly to `main` and
`git push origin main`.** A push deploys to `www` in about one to two minutes. Do not
create feature branches or pull requests for routine changes: PRs and preview builds
add delay and flood the owner's inbox with no benefit here. Review and revert are
handled after the fact (see the rollback section), not by a PR gate.

If you are using an AI coding agent (Claude, etc.), tell it explicitly: **work on
`main`, commit, and `git push origin main` — no branches, no pull requests.**

## Make a change

1. Edit the files in this repo (on `main`).
2. Commit with a clear message describing what changed and why.
3. `git push origin main`.
4. Vercel auto-builds and publishes to `www` within a couple of minutes.
5. Verify on https://www.berkeleynucleonics.com (hard-refresh to bypass cache).

## House rules (please keep these)

- **Brand.** BNC blue `#0655a3`, dark `#113163`, Myriad Pro headings with Arial
  fallback, 4px radius, conservative shadows, and **no emoji**. Match the look of the
  existing pages rather than inventing new styling.
- **Never invent specs.** No made-up model numbers, specifications, pricing, or
  certifications. Treat the current published datasheet as authoritative and flag
  anything unverified.
- **Voice.** No em dashes. Vary sentence length so copy reads naturally.
- **Keep production URLs.** Canonicals, `og:url`, the sitemap, and `llms.txt` point at
  `www.berkeleynucleonics.com`. Do not reintroduce `draft.` or `*.vercel.app` URLs.
- **Be careful with `vercel.json`.** It holds the old-to-new 301 redirect map, the
  response headers (including the draft-only noindex), and a daily cron. Change it only
  on purpose, and validate it is still valid JSON before pushing (a bad `vercel.json`
  fails the Vercel build and the previous deploy keeps serving).

## Where things live

- **Root `*.html`** — top-level pages: `home.html`, the line pages (`pdg-home.html`,
  `rfsg-home.html`, `scintiq-home.html`, etc.), `pricing.html`, `contact.html`.
- **`docs/`** — datasheets, application briefs, technical notes, index pages, and the
  ScintIQ configurator.
- **`_shared/`** — JavaScript and CSS injected across many pages (`bnc-auth.js`,
  `bnc-chat.js`, `bnc-visit.js`, the nav, etc.). Edit the shared file, not per-page
  copies, then it applies everywhere.
- **`api/`** — Vercel serverless functions (chat, visit tracking, Nutshell sync). Plain
  CommonJS, no npm dependencies.
- **`figures/`** — images. Migrated legacy images live under `figures/wp/`.
- **`vercel.json`** — rewrites, redirects, headers, cron.

## Mobile and SEO are already handled

Pages carry a shared mobile-nav fix, production robots/canonical/sitemap, and the
redirect map. When you add a **new page**, keep a unique `<title>` (<= 60 chars), a
150 to 160 char description, a canonical to the `www` URL, and a single `<h1>`. Add the
page to `sitemap.xml`.

## If something breaks: roll back (one click, seconds)

1. Vercel → **bnc-draft-website** project → **Deployments**.
2. Find the last good deployment → the **...** menu → **Promote to Production**.
3. It is live again in seconds, with no rebuild.

For a permanent code-level undo of a specific change:
`git revert <commit-sha> && git push origin main`.

The old WordPress site is preserved read-only at **retired.berkeleynucleonics.com**
(a separate frozen archive). Do not edit it from this repo.

Questions or anything unclear: ask David.
