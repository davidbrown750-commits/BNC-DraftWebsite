# Scintillator Book V2 — Webmaster Deployment Notes

**Author:** David Brown, Berkeley Nucleonics Corporation
**Goal:** Host the digital book publicly with no paywall and no login, while capturing reader names + emails on an opt-in quiz.
**Server requirements:** Static file hosting only. No backend, no database, no SSL gymnastics beyond standard HTTPS. Works on any modern web host (Apache, nginx, Cloudflare Pages, Netlify, GitHub Pages, WordPress with an HTML embed, Webflow Custom Code, etc.).

---

## What to upload

All files come from the project folder `book/`. Two suggested URL structures:

### Recommended structure

```
yourdomain.com/scintillator-book/
    ├── 00-front-matter.html
    ├── 01-why-now.html
    ├── 02-scintillation-physics.html
    ├── ... (14 chapters total)
    ├── appendix-A-new-materials.html
    ├── ... (8 appendices total)
    ├── quiz-01-why-now.html
    ├── ... (14 chapter quizzes)
    ├── progress.html
    ├── reader-quiz.html
    ├── _bnc-style.css
    ├── _quiz-style.css
    ├── _reader-prompt.js
    └── figures/                      ← drop the figures folder in alongside
```

### Files to upload, by source folder

| Source on David's drive | Destination on server | Notes |
|---|---|---|
| `book/html/*.html` (23 files: 00–14 + appendix-A–H) | `/scintillator-book/` | The book content, one HTML per chapter / appendix. |
| `book/html/quiz-*.html` (14 files) | `/scintillator-book/` | Interactive chapter quizzes. |
| `book/html/progress.html` | `/scintillator-book/` | Reader progress dashboard. |
| `book/html/_bnc-style.css` | `/scintillator-book/` | Shared book stylesheet. |
| `book/html/_quiz-style.css` | `/scintillator-book/` | Shared quiz stylesheet. |
| `book/html/_reader-prompt.js` | `/scintillator-book/` | Top banner + 30-sec reader-quiz prompt. Auto-loaded by every chapter. |
| `book/web/reader-quiz.html` | `/scintillator-book/` | The lead-capture quiz. **One config change required — see below.** |
| `book/figures/` (the whole folder) | `/scintillator-book/figures/` | All chapter figures — referenced by `../figures/...` from each chapter, so the folder must sit alongside the HTML. |

**Total: ~50 files.** All are static — just upload via FTP / SFTP / your CMS.

### What NOT to upload

- `book/chapters/`, `book/appendices/` (these are the markdown source — not for the public site)
- `book/pdf/`, `book/pdf-5x8/`, `book/pdf-5x8-final/` (the print PDFs — keep on David's drive for the print run)
- `book/Scintillator-Book-V2-MASTER.{md,html}` (an internal combined master)
- `book/cover/` (cover art — for print only)
- `*.bak` files anywhere (backups created by the editing scripts)

---

## The one config change required

Open `reader-quiz.html` in any text editor. Near the top of the `<script>` block, find:

```js
const FORM_ENDPOINT = "https://formspree.io/f/REPLACE_WITH_YOUR_ID";
```

Replace `REPLACE_WITH_YOUR_ID` with the Formspree form ID David provides (see "Setting up the email tool" below). Save and re-upload `reader-quiz.html`. **No build step. No server config.**

---

## Setting up the email tool (for David, not the webmaster)

The quiz uses **Formspree** (`formspree.io`) — free tier, 50 submissions/month, no signup required for end users. Three steps:

1. Sign up at https://formspree.io with `davidbrown750@gmail.com`. (Free plan is fine to start.)
2. Click **+ New Form**, give it a name like "Scintillator Book Reader Quiz", set the destination to `davidbrown750@gmail.com`. Formspree will assign you a form ID like `xnqebjkr`.
3. The endpoint URL is `https://formspree.io/f/<form-id>`. Paste that into the `FORM_ENDPOINT` constant in `reader-quiz.html` (see config change above).

**Alternatives if you prefer:** Web3Forms (250/month free) or Basin (100/month free). All three work the same way — pick one, get the endpoint URL, paste into the HTML file. No code changes beyond that one constant.

---

## What happens when a reader submits the quiz

1. Reader clicks **Email me my reading roadmap**.
2. Browser POSTs the form data to your Formspree endpoint.
3. Formspree forwards it to `davidbrown750@gmail.com` as an email with subject like:
   `[Scintillator Quiz] Sarah → buyer path`
4. The email body includes:
   - **Name** (first + last)
   - **Email**
   - **Company / Institution** + **Role / Title** (if filled)
   - **Country**
   - **`reader_path`** — `student`, `buyer`, or `designer`
   - **Three opt-ins:**
     - `want_print: yes` → reader wants a free printed copy. Email also includes shipping address.
     - `want_class_pass: yes` → reader wants a free seat in the BNC Academy course at academy.berkeleynucleonics.com.
   - All quiz answers as JSON (which questions and options they chose)

You then act on each lead manually within two business days:

- **Mail the print copy** if requested. Address is in the email.
- **Provision the class pass** if requested. Add their email as a complimentary seat in the BNC Academy.
- **Send the personalized roadmap.** Copy/paste the right path's reading roadmap from `reader-quiz-spec.md` into a reply email. (Once volume is ~5+ leads/week, automate this with Mailchimp / ConvertKit / HubSpot using `reader_path` as the segmentation tag.)

---

## How the chapter-level quizzes work

The 14 chapter quizzes don't need a backend at all. They save the reader's attempts and self-grades to **`localStorage` in the reader's own browser** — David never sees this data, and the reader can clear it or export it themselves from `progress.html`.

The dashboard (`progress.html`) reads localStorage and shows:
- Total chapters touched, how many got each grade
- Per-chapter breakdown of every question, the reader's attempt, the model answer
- Suggested re-reads
- Print / Export-as-JSON / Clear-all buttons

No webmaster action required for the chapter quizzes — they just work once the files are uploaded.

---

## Privacy and consent

- The reader quiz includes a **required consent checkbox** before submission.
- Berkeley Nucleonics is responsible for honoring opt-out requests from the resulting marketing list. Use a CRM / ESP that handles unsubscribes (Mailchimp, ConvertKit, etc.) once volume justifies it.
- For EU/UK readers, the consent flow is the legal minimum. If volume from those regions becomes meaningful, add a privacy notice link on the BNC site and a checkbox to confirm GDPR consent.
- The success page promises follow-up within two business days for fulfillment items. Honor that.

---

## Quick checklist for the webmaster

- [ ] Upload all files in the table above to `/scintillator-book/` (or wherever the URL structure dictates).
- [ ] Confirm the `figures/` folder sits one level above `*.html` (chapters reference `../figures/`). If you keep them in the same folder, edit chapter HTML to use `figures/...` instead of `../figures/...`.
- [ ] David provides his Formspree endpoint ID. Paste it into `reader-quiz.html` and re-upload.
- [ ] Test once: open any chapter (e.g. `01-why-now.html`), wait 30 seconds, confirm the modal appears, click *Take the quiz*, fill it out, submit. Confirm David receives the email.
- [ ] Send David a working URL for `00-front-matter.html` and `reader-quiz.html`.

That's it. Total deploy time: ~15 minutes including the test submission.

---

**Questions?** Email David at `davidbrown750@gmail.com`.
