# Self-hosted form endpoint (`/api/form`) — setup & activation

Replaces Formspree. Every website form now POSTs to `/api/form?form=<type>` (contact, quote,
quote-index, rma, rma-status, scintiq, quiz, resource, pdf-config). One deduped path into
Nutshell + a durable Supabase log + a SendGrid notification. Formspree-compatible fields
(`_gotcha` honeypot, `_subject`, `_next` redirect, `_replyto`).

## Files
- `api/form.js` — the handler (honeypot, optional Turnstile, optional Clerk identity, Nutshell
  upsert-by-email + note, Supabase log, SendGrid notify, JSON-or-redirect response).
- `lib/smtp.js` — zero-dep SMTP sender (SendGrid STARTTLS 587 / implicit TLS 465).
- Reuses `lib/nutshell.js`, `lib/clerk.js`.
- Same files mirrored into the sandbox repo (`bnc-website-source`).

## What David must do to activate

1. **Supabase table** (SQL editor). Service-role inserts only, like `bnc_visits`:
   ```sql
   create table if not exists public.bnc_form_submissions (
     id bigint generated always as identity primary key,
     created_at timestamptz not null default now(),
     form_type text, email text, name text, company text, phone text,
     message text, fields jsonb, page text, verified boolean default false, user_agent text
   );
   alter table public.bnc_form_submissions enable row level security;
   ```

2. **Vercel env vars** (BNC-DraftWebsite project → Settings → Environment Variables → Production),
   then redeploy (Vercel only injects vars into deploys created after they exist):
   - `SMTP_HOST=smtp.sendgrid.net`
   - `SMTP_PORT=587`
   - `SMTP_USER=apikey`  (SendGrid literally uses "apikey"; same as the Daily Brief)
   - `SMTP_PASS=<the SendGrid API key>`  (same value the Daily Brief uses)
   - `SMTP_FROM=<the verified SendGrid sender>` (e.g. the address the briefs send from)
   - `FORM_NOTIFY_TO=david.brown@berkeleynucleonics.com`  (comma-separate for multiple)
   - Optional per-type routing: `FORM_NOTIFY_RMA=...`, `FORM_NOTIFY_QUOTE=...`, `FORM_NOTIFY_CONTACT=...`
   - Optional spam: `TURNSTILE_SECRET=<Cloudflare Turnstile secret>` (endpoint skips Turnstile until set)
   - Already present (existing functions): `NUTSHELL_API_USER`, `NUTSHELL_API_KEY`,
     `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

3. **Disable the duplicate-creating Nutshell bridges** (Nutshell → Setup → API → API Keys):
   **Jotform**, **n8n/GHL api key**, and **BNC Website - Contact Us**. Keep the
   `david.brown@` sync key. This is what actually stops the duplicate contacts — `/api/form`
   is now the single deduped writer.

4. **Deploy**: push `site-bundle` → BNC-DraftWebsite (Vercel builds), and `sandbox` →
   bnc-website-source. The endpoint + migrated forms deploy together (atomic; forms never
   point at a missing endpoint).

## Verify after deploy
- `curl -sX POST 'https://draft.berkeleynucleonics.com/api/form?form=contact' -H 'Content-Type: application/json' -d '{"email":"you@x.com","name":"Test","message":"hello"}'` → `{"ok":true,...}`
- Check: a Nutshell contact (deduped), a `bnc_form_submissions` row, and a SendGrid email to `FORM_NOTIFY_TO`.
- Submit each form type once from the site and confirm the thank-you + the three effects.

## Notes
- Even before the SMTP env is set, forms still work and leads still reach Nutshell + Supabase
  (notification is best-effort). Nothing is lost.
- Turnstile is optional; the honeypot (`_gotcha`) is always active.
- Migrated 2026-07-02 across 51 files (site-bundle + sandbox): contact, get-quote, RMA (×2),
  ScintIQ configurator, 10 book quizzes, 10 book "Going Deeper" resource forms, the doc PDF
  configurator, and the product-index/line-card quotes.

## Blocking spammers ("Block this sender")

Every form notification email carries a red **"Block this sender and delete the record"** button.
One click drops all future submissions from that address and removes the spam Nutshell record.
The button only appears when the submission has an email address AND `BLOCK_KEY` is set (below).

### How it works
- `api/form.js` builds the button as `${base}/api/block?email=<lowercased email>&t=<token>`, where
  `token` is a hex `HMAC-SHA256(lowercased email, BLOCK_KEY)`. `base` is the request host, falling
  back to `https://www.berkeleynucleonics.com`. No secret ships to the browser; only the signed link does.
- `api/form.js` also checks the blocklist on every POST: if the sender's lowercased email is in
  `bnc_blocked_emails`, it returns the normal thank-you but skips Nutshell, the Supabase log, and the
  notification. The bot sees a success and nothing reaches the CRM. A lookup error just proceeds
  normally (real forms are never broken).
- `api/block.js` recomputes the HMAC and constant-time-compares it to `t`. On mismatch it returns 403.
  On a match it (a) upserts the email into `bnc_blocked_emails` (merge-duplicates, so re-clicks are
  idempotent) and (b) removes the Nutshell record: it attempts a hard delete (`deleteContact`), and if
  the API shard does not expose that, it falls back to flagging the contact (description + timeline note
  "SPAM - false record, flagged for deletion"). It then shows a branded BNC confirmation page and, on
  any partial failure, still reports what succeeded.

### What David must do to activate
1. **Supabase table** (SQL editor). Service-role writes only, like `bnc_form_submissions`:
   ```sql
   create table if not exists public.bnc_blocked_emails (
     id bigint generated always as identity primary key,
     email text not null unique,
     reason text,
     source text,
     blocked_at timestamptz not null default now()
   );
   create index if not exists bnc_blocked_emails_email_idx on public.bnc_blocked_emails (email);
   alter table public.bnc_blocked_emails enable row level security;
   -- No policies: only the service_role key (used by the API) can read/write.
   ```
2. **Vercel env var** (BNC-DraftWebsite project -> Settings -> Environment Variables -> Production),
   then redeploy:
   - `BLOCK_KEY=<a long random secret>` (e.g. `openssl rand -hex 32`). This signs the block links.
     Until it is set, no button is rendered and `/api/block` 403s every request, so the feature is inert.
   - Already present: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NUTSHELL_API_USER`, `NUTSHELL_API_KEY`.

### Files
- `api/block.js` (new) — the block endpoint (site-bundle + sandbox).
- `api/form.js` — added blocklist short-circuit + the notify-email block button.
- `lib/nutshell.js` — added `findContactIdByEmail`, `deleteContact`, `flagContactSpam`,
  `removeSpamContactByEmail`.

### Manually blocking an address (without the email button)
Insert a row directly in the SQL editor:
```sql
insert into public.bnc_blocked_emails (email, reason, source)
values ('spammer@example.com', 'spam-form', 'manual')
on conflict (email) do nothing;
```
