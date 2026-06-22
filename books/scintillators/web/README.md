# Scintillator Book V2 — Web Companion

This folder holds the web-facing assets that go alongside the printed book and the chapter HTML pages. They are intended to be hosted publicly on the Berkeley Nucleonics website **with no paywall and no login**.

---

## What's in this folder

| File | What it is |
|---|---|
| `reader-quiz.html` | The "How to Read This Book" interactive quiz. 6 questions, scores readers into one of three reading paths (Foundation / Selection / Design), captures name + email, optional shipping address for a free print copy, and an optional class-pass opt-in for the BNC Academy online course. |
| `reader-quiz-spec.md` | The design spec — questions, scoring rubric, copy for each result page, voice and tone notes. Treat this as the source of truth when editing the quiz. |
| `README.md` | This file. |

The chapter-level interactive quizzes live in `../html/quiz-NN-slug.html` (one per chapter). The first one shipped is `quiz-14-nuclear-renaissance.html`. Each chapter quiz is its own self-contained HTML page with hidden answers that reveal only after the reader writes an attempt.

---

## Hosting the reader quiz

### Step 1 — Pick a form-to-email service

The quiz POSTs the lead to a public form endpoint. No backend code is required. Pick one:

- **Formspree** (`formspree.io`) — free tier, 50 submissions/month, no signup wall for end users. Easy. Recommended.
- **Web3Forms** (`web3forms.com`) — free tier, 250 submissions/month, simpler signup.
- **Basin** (`usebasin.com`) — free tier, 100 submissions/month.

All three forward each submission as an email to whichever inbox you configure. The quiz submits a `multipart/form-data` POST that includes:

- `first_name`, `last_name`, `email`, `company`, `role`, `country`
- `consent` (required checkbox)
- `want_print` (`yes` or absent), and if yes, the address fields: `ship_street`, `ship_city`, `ship_state`, `ship_postal`, `ship_country`
- `want_class_pass` (`yes` or absent)
- `reader_path` — the computed path: `student`, `buyer`, or `designer`
- `quiz_answers` — JSON map of question ID → chosen option label
- `path_scores` — JSON of the three path scores
- `_subject` — pre-built email subject line
- `submitted_from` — `reader-quiz-v1`

Set the destination to `davidbrown750@gmail.com` (or any BNC alias).

### Step 2 — Plug in the endpoint

Open `reader-quiz.html`. Near the top of the `<script>` block, change:

```js
const FORM_ENDPOINT = "https://formspree.io/f/REPLACE_WITH_YOUR_ID";
```

to your real endpoint. That's it. No build step.

If you ever need to change the destination email, do it in the form provider's dashboard — not in the HTML.

### Step 3 — Drop it onto the website

The file is single-file, no external dependencies, no build step. Options:

- Upload `reader-quiz.html` to your web server and link to it from the marketing page.
- Embed it inline in WordPress / Webflow / Framer via an HTML embed block.
- Host it as a GitHub Pages page and link from there.

It is mobile-responsive and accessible. It doesn't use cookies or `localStorage`. The only network call it makes is the POST to the form endpoint when the reader submits.

---

## Fulfilling the leads

Each submission emails you a complete lead record. You'll see one of these three reader paths in the subject line: `student`, `buyer`, or `designer`. Use that to triage:

### If they wanted a print copy (`want_print: yes`)

The address is in the email. Within two business days:

1. Send a confirmation email: "Got your request, the print copy ships this week."
2. Print + ship a copy from your fulfillment partner (or internally if you're handling small batches).
3. International orders: confirm shipping cost-sharing if needed before printing.

### If they wanted a class pass (`want_class_pass: yes`)

Within two business days:

1. Provision a complimentary seat on `academy.berkeleynucleonics.com` for their email.
2. Email them the access link with a one-line welcome ("You're in. Course outline at the link below.")
3. Tag the seat as "scintillator-book-leadmag-2026" for analytics.

### Lead nurture — the email roadmap

The quiz promises a personalized reading roadmap by email. The form endpoint forwards the data to you, but it does not auto-send the roadmap. You have two options:

**Option A (manual, low volume):** Reply by hand for the first 50-100 leads. The roadmap text is in `reader-quiz-spec.md` under "Result pages" — copy/paste the right path's roadmap into the email reply.

**Option B (automated):** Wire the form to a marketing automation tool (Mailchimp, ConvertKit, HubSpot) using the `reader_path` field as a tag, then trigger one of three pre-written email sequences. Recommended once volume exceeds ~5 leads/week.

---

## Editing the quiz copy

All copy lives in two places in `reader-quiz.html`:

- The `QUESTIONS` array (the six quiz questions and their options).
- The `RESULTS` object (the three result pages — headline, why, roadmap, encouragement line).

If you change scoring weights, run the simulation in `reader-quiz-spec.md` Appendix to make sure the three reference personas still map to the right path.

If you rename or reorder the chapters, update the result-page roadmaps to match.

---

## Privacy and consent

- The quiz collects names, emails, optional company/role, optional shipping addresses.
- A required consent checkbox is shown before submission.
- Berkeley Nucleonics is responsible for honoring the consent — store the lead in a CRM or marketing list that allows opt-out, and respect unsubscribes.
- For EU/UK readers, this consent flow is the minimum. If volume from those regions becomes meaningful, add a link to a privacy notice on the BNC site.
- The success page tells the reader they'll hear back within two business days for fulfillment items. Honor that.

---

## Chapter-level interactive quizzes

The book ships with five-question quizzes at the end of every chapter. Each one becomes a standalone interactive page in `book/html/quiz-NN-slug.html`. The pattern:

- Numbered badge per question.
- Free-text attempt area.
- Reveal button locked until the reader writes at least 8 characters.
- Sky-blue → amber-accented answer panel slides open on reveal.
- Self-grading row (Got it / Close / Missed) per question.
- Final summary card with a recommended re-read based on self-grade tally.
- Navigation back to the chapter and forward to the next chapter.

The chapter HTML still contains the inline quiz and inline answers below an "Open the interactive quiz →" CTA — that preserves print and offline use while inviting digital readers into the better experience.

To roll this pattern out to the remaining chapters, ask Claude in a future session: *"Apply the chapter-quiz template to all chapters."* Each chapter has its quiz and answers in the same `<h2 id="chapter-N-quiz">` / `<h3 id="quiz-answers">` structure, so the conversion is mechanical.

---

## Title Case heading rule (v1.1)

All chapter and section headings (H1, H2, H3) across the book now follow proper Title Case (e.g. `3.3.1 The Alkali Halide Workhorses`, not `3.3.1 The alkali halide workhorses`). The rule is documented in `BNC-Book-Series-Style-Guide.md` and the script that applies it lives at `scripts/title_case_headings.py`. The script is idempotent — running it again on already-title-cased files is a no-op. It writes `.bak` backups on first run.

If you re-render the HTML from MD via pandoc, run the script again on the HTML to re-apply Title Case to the regenerated headings.

---

## Files modified in the v1.1 polish pass

- `BNC-Book-Series-Style-Guide.md` — heading hierarchy now mandates Title Case. Editorial accent palette added (deep plum, warm amber).
- `book/html/_bnc-style.css` — Title Case-friendly heading treatment, dark plum figure captions and table titles, warm amber section number accent and table-header underline, ornamental `❖` glyph on `<hr>`, link styling.
- `book/chapters/*.md`, `book/appendices/*.md`, `book/html/*.html`, `book/Scintillator-Book-V2-MASTER.{md,html}` — 784 headings updated to Title Case, with `.bak` backups.
- `book/html/quiz-14-nuclear-renaissance.html` — new interactive Ch 14 quiz page.
- `book/html/14-nuclear-renaissance.html` — added "Open the interactive quiz →" CTA above the inline quiz.
- `book/web/reader-quiz.html`, `book/web/reader-quiz-spec.md`, `book/web/README.md` — new web-facing reader quiz lead magnet.
- `scripts/title_case_headings.py` — reusable Title Case script.
