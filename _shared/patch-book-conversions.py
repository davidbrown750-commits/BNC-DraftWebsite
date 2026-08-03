#!/usr/bin/env python3
"""Patch the 20 per-book copies (10 book-enhance.js, 10 reader-quiz.html).

Both submit by fetch() and render an inline success, so they never reach thank-you.html and
never fire a conversion. Both build a FormData, which the head block's hidden-input stamping
does not touch, so attribution has to be appended explicitly.

The quizzes exist in two shapes: seven use a `data` / .then() chain, three (quantum-computing,
rf-and-microwave, scintillators) use a `payload` / async-await chain. Both are handled.

Every target must match one of the known shapes. A file that matches none is reported as a
FAILURE rather than skipped, so a silent miss cannot masquerade as full coverage.
"""
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent

ATTR_NOTE = ("// Attribution rides along in the FormData: this form never navigates, so the\n"
             "// hidden inputs the head block stamps onto native forms do not apply here.")
TRACK_NOTE = "// Inline success, no navigation: fire the conversion here or it is never counted."


def attr_lines(var, indent):
    pad = " " * indent
    return (f"{pad}{ATTR_NOTE.splitlines()[0]}\n"
            f"{pad}{ATTR_NOTE.splitlines()[1]}\n"
            f"{pad}var _a=window.BNC_ATTR||{{}}; "
            f"for(var _k in _a){{ if(Object.prototype.hasOwnProperty.call(_a,_k)) {var}.append(_k,_a[_k]); }}\n")


# (anchor, replacement, kind) — kind "before" inserts ahead of the anchor, "swap" replaces it.
SHAPES = {
    "book-enhance": [
        ("      var ep=CFG.formEndpoint;\n", attr_lines("data", 6), "before"),
        ("        .then(function(r){ if(r.ok) done(); else throw 0; })\n",
         "        " + TRACK_NOTE + "\n"
         "        // Not inside done(), which also runs when no endpoint is configured.\n"
         '        .then(function(r){ if(r.ok){ if(window.bncTrackFormSubmit) window.bncTrackFormSubmit("resource"); done(); } else throw 0; })\n',
         "swap"),
    ],
    "quiz-then": [
        ("    fetch(FORM_ENDPOINT,{method:\"POST\",body:data,headers:{\"Accept\":\"application/json\"}})\n",
         attr_lines("data", 4), "before"),
        ('      .then(function(res){ if(res.ok) showSuccess(data); else throw new Error("post failed"); })\n',
         "      " + TRACK_NOTE + "\n"
         '      .then(function(res){ if(res.ok){ if(window.bncTrackFormSubmit) window.bncTrackFormSubmit("quiz"); showSuccess(data); } else throw new Error("post failed"); })\n',
         "swap"),
    ],
    "quiz-await": [
        ("          const res = await fetch(FORM_ENDPOINT, {\n", attr_lines("payload", 10), "before"),
        ("          if (res.ok) {\n            showSuccess(payload);\n",
         "          if (res.ok) {\n"
         "            " + TRACK_NOTE + "\n"
         '            if (window.bncTrackFormSubmit) window.bncTrackFormSubmit("quiz");\n'
         "            showSuccess(payload);\n",
         "swap"),
    ],
}


def apply_shape(text, edits):
    """Return patched text, or None if any anchor is missing."""
    for anchor, repl, kind in edits:
        if repl in text:
            continue  # already applied
        if anchor not in text:
            return None
        text = text.replace(anchor, (repl + anchor) if kind == "before" else repl, 1)
    return text


def main():
    check = "--check" in sys.argv
    targets = [(p, ["book-enhance"]) for p in sorted(ROOT.glob("books/*/html/book-enhance.js"))]
    targets += [(p, ["quiz-then", "quiz-await"]) for p in sorted(ROOT.glob("books/*/web/reader-quiz.html"))]

    patched, already, failed = [], [], []
    for path, shapes in targets:
        orig = path.read_text(encoding="utf-8", errors="surrogateescape")
        out = None
        for shape in shapes:
            out = apply_shape(orig, SHAPES[shape])
            if out is not None:
                break
        if out is None:
            failed.append(path)
            continue
        if out == orig:
            already.append(path)
            continue
        if not check:
            path.write_text(out, encoding="utf-8", errors="surrogateescape")
        patched.append(path)

    verb = "would patch" if check else "patched"
    for p in patched:
        print(f"  {verb}: {p.relative_to(ROOT)}")
    for p in already:
        print(f"  already done: {p.relative_to(ROOT)}")
    for p in failed:
        print(f"  FAILED (no known shape matched): {p.relative_to(ROOT)}")
    print(f"\n{verb} {len(patched)}, already done {len(already)}, FAILED {len(failed)}, of {len(targets)}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
