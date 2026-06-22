/* quiz-mc.js  (BNC Web Books - shared interactive multiple-choice quiz engine)
 *
 * One engine used by every book so all quizzes behave identically:
 *   - reader clicks an option per question (radio)
 *   - selections are saved to localStorage (survive reload)
 *   - "Check my answers" grades, marks each question right/wrong, shows a score
 *   - per-chapter score is also written to a book-wide progress key
 *   - "Try again" resets
 *
 * Usage on a quiz page:
 *   <div id="bnc-quiz"></div>
 *   <script>
 *     window.QUIZ_DATA = {
 *       bookKey: "rtsa",                 // unique per book
 *       chapterKey: "01",               // unique per chapter within the book
 *       title: "Chapter 1 Quiz",
 *       questions: [
 *         { q: "Question text?",
 *           options: ["A ...","B ...","C ...","D ..."],
 *           answer: 2,                   // index of the correct option
 *           explain: "Optional one-line explanation shown after grading." }
 *       ]
 *     };
 *   </script>
 *   <script defer src="quiz-mc.js"></script>
 */
(function () {
  "use strict";

  function injectStyles() {
    if (document.getElementById("__bnc-quiz-style")) return;
    var css = '\
      .bncq{font-family:Georgia,serif;max-width:820px;margin:18px 0;}\
      .bncq h3.bncq-title{font-family:Helvetica,Arial,sans-serif;color:#003D6B;border-left:4px solid #0078B6;padding-left:12px;font-size:20px;margin:0 0 14px;}\
      .bncq .bncq-prog{font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#4B2A6B;letter-spacing:.5px;text-transform:uppercase;margin:0 0 16px;}\
      .bncq .q{background:#fff;border:1px solid #b6c2cc;border-radius:6px;padding:16px 18px;margin:0 0 14px;}\
      .bncq .q .qn{font-family:Helvetica,Arial,sans-serif;color:#C77E00;font-weight:700;font-size:12px;letter-spacing:1px;text-transform:uppercase;}\
      .bncq .q .qt{font-weight:bold;color:#1f2933;margin:4px 0 12px;}\
      .bncq .opt{display:block;border:1px solid #cfd8df;border-radius:5px;padding:10px 12px;margin:7px 0;cursor:pointer;font-size:15px;transition:border-color .12s,background .12s;}\
      .bncq .opt:hover{border-color:#0078B6;background:#f3f9fd;}\
      .bncq .opt input{margin-right:10px;}\
      .bncq .opt.sel{border-color:#003D6B;background:#eaf4fb;}\
      .bncq.graded .opt{cursor:default;}\
      .bncq.graded .opt.correct{border-color:#2e9e57;background:#eef7f0;}\
      .bncq.graded .opt.wrong{border-color:#c0392b;background:#fdecea;}\
      .bncq.graded .opt .tag{font-family:Helvetica,Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;margin-left:8px;}\
      .bncq.graded .opt.correct .tag{color:#2e9e57;}\
      .bncq.graded .opt.wrong .tag{color:#c0392b;}\
      .bncq .explain{font-family:Helvetica,Arial,sans-serif;font-size:13px;color:#4B2A6B;margin-top:8px;display:none;}\
      .bncq.graded .explain{display:block;}\
      .bncq .bncq-actions{display:flex;gap:10px;align-items:center;margin-top:6px;}\
      .bncq button{font-family:Helvetica,Arial,sans-serif;font-weight:700;letter-spacing:.6px;text-transform:uppercase;font-size:12px;padding:11px 20px;border-radius:4px;cursor:pointer;border:1px solid #003D6B;background:#003D6B;color:#fff;}\
      .bncq button.ghost{background:#fff;color:#003D6B;}\
      .bncq button[disabled]{opacity:.45;cursor:not-allowed;}\
      .bncq .score{font-family:Helvetica,Arial,sans-serif;display:none;margin-top:16px;padding:16px 18px;border-radius:6px;border-left:5px solid #003D6B;background:#eaf4fb;color:#003D6B;font-size:17px;font-weight:700;}\
      .bncq.graded .score{display:block;}\
      .bncq .score small{display:block;font-weight:400;font-size:13px;color:#2C3E50;margin-top:4px;}\
    ';
    var s = document.createElement("style");
    s.id = "__bnc-quiz-style";
    s.textContent = css;
    document.head.appendChild(s);
  }

  function lsGet(k){ try { return JSON.parse(localStorage.getItem(k) || "null"); } catch(e){ return null; } }
  function lsSet(k,v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} }

  function boot() {
    var cfg = window.QUIZ_DATA;
    var root = document.getElementById("bnc-quiz");
    if (!cfg || !root || !cfg.questions || !cfg.questions.length) return;
    injectStyles();

    var BOOK = cfg.bookKey || "book";
    var CH = cfg.chapterKey || "ch";
    var KEY = BOOK + "-quiz-" + CH;
    var PROGRESS_KEY = BOOK + "-quiz-progress";
    var state = lsGet(KEY) || { answers: {}, graded: false };

    function persist() {
      lsSet(KEY, state);
      if (state.graded) {
        var prog = lsGet(PROGRESS_KEY) || {};
        prog[CH] = { score: score(), total: cfg.questions.length };
        lsSet(PROGRESS_KEY, prog);
      }
    }
    function score() {
      var n = 0;
      cfg.questions.forEach(function (q, i) { if (state.answers[i] === q.answer) n++; });
      return n;
    }

    function draw() {
      var html = '<div class="bncq' + (state.graded ? " graded" : "") + '">';
      html += '<h3 class="bncq-title">' + (cfg.title || "Chapter Quiz") + "</h3>";
      html += '<p class="bncq-prog">' + cfg.questions.length + ' questions. Pick one answer each, then check your score.</p>';
      cfg.questions.forEach(function (q, i) {
        html += '<div class="q"><div class="qn">Question ' + (i + 1) + '</div><div class="qt">' + q.q + "</div>";
        q.options.forEach(function (opt, j) {
          var cls = "opt";
          if (state.answers[i] === j) cls += " sel";
          if (state.graded) {
            if (j === q.answer) cls += " correct";
            else if (state.answers[i] === j) cls += " wrong";
          }
          var tag = "";
          if (state.graded && j === q.answer) tag = '<span class="tag">Correct</span>';
          else if (state.graded && state.answers[i] === j) tag = '<span class="tag">Your pick</span>';
          html += '<label class="' + cls + '"><input type="radio" name="q' + i + '" value="' + j + '"' +
            (state.answers[i] === j ? " checked" : "") + (state.graded ? " disabled" : "") + ">" + opt + tag + "</label>";
        });
        if (q.explain) html += '<div class="explain"><strong>Why:</strong> ' + q.explain + "</div>";
        html += "</div>";
      });
      var answered = Object.keys(state.answers).length;
      html += '<div class="bncq-actions">';
      if (!state.graded) {
        html += '<button id="bncq-check"' + (answered < cfg.questions.length ? " disabled" : "") + ">Check my answers</button>";
        html += '<span class="bncq-prog" style="margin:0;">' + answered + " of " + cfg.questions.length + " answered</span>";
      } else {
        html += '<button class="ghost" id="bncq-retry">Try again</button>';
      }
      html += "</div>";
      html += '<div class="score">You scored ' + score() + " of " + cfg.questions.length +
        ".<small>" + scoreLine(score(), cfg.questions.length) + "</small></div>";
      html += "</div>";
      root.innerHTML = html;
      wire();
    }

    function scoreLine(s, t) {
      var pct = Math.round((s / t) * 100);
      if (pct === 100) return "Perfect. You have this chapter cold.";
      if (pct >= 70) return "Solid. Review the ones you missed above.";
      if (pct >= 40) return "Worth another read of this chapter, then retake.";
      return "Reread the chapter and try again. The answers are marked above.";
    }

    function wire() {
      Array.prototype.forEach.call(root.querySelectorAll('input[type=radio]'), function (inp) {
        inp.addEventListener("change", function () {
          if (state.graded) return;
          var qi = parseInt(inp.name.slice(1), 10);
          state.answers[qi] = parseInt(inp.value, 10);
          persist();
          draw();
        });
      });
      var check = document.getElementById("bncq-check");
      if (check) check.addEventListener("click", function () {
        state.graded = true; persist(); draw();
        root.querySelector(".score").scrollIntoView({ behavior: "smooth", block: "center" });
      });
      var retry = document.getElementById("bncq-retry");
      if (retry) retry.addEventListener("click", function () {
        state = { answers: {}, graded: false }; persist(); draw();
      });
    }

    draw();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
