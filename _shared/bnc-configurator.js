/* ============================================================
   BNC Product Configurator - shared engine
   Config-driven modal widget. No dependencies.

   Usage:
     1. Include bnc-configurator.css, this file, and a data file
        that calls BNCConfigurator.register(family).
     2. Add a launch element:
        <button data-bnc-configurator="awg" data-bnc-model="685"></button>
        (Empty elements get the standard branded button injected.)

   Data model (per family):
   {
     id, title, subtitle, endpoint (optional),
     models: [{
       id, name, blurb, info, image, imageCaption,
       pnBase: "575",
       imageRules: [{ when:<pred>, src, caption }],   // first match wins
       groups: [{
         id, label, hint, type: "radio" | "check",
         options: [{
           code, label, note, info, badge,
           pn: "-XX" | function(state){...},
           desc: "text" | function(state){...},
           default: true,            // radio initial selection
           onlyFor: <pred>,          // available only when pred true
           excludes: ["CODE", ...],  // mutually exclusive options
           needs: ["CODE", ...]      // required options
         }]
       }],
       rules: [{ atMost: 2, of:["A","B","C"], when:<pred>, reason:"..." }]
     }]
   }
   Predicates <pred>: { group:{ id:"groupId", in:["code"] } }
                    | { checked:"CODE" } | { notChecked:"CODE" }
                    | { any:[<pred>...] } | { all:[<pred>...] }
   ============================================================ */

(function () {
  "use strict";

  var families = {};
  var active = null; // { family, model, state, dom }

  var DEFAULT_ENDPOINT = "https://www.berkeleynucleonics.com/api/form?form=configurator";
  var FALLBACK_EMAIL = "website@berkeleynucleonics.com";

  var LOGO_SVG =
    '<svg class="bnc-cfg-logo" viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<circle cx="22" cy="22" r="20" stroke="#ffffff" stroke-width="2.5"/>' +
    '<path d="M8 22h6l3-8 5 16 4-12 3 4h7" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>' +
    "</svg>";

  var GEAR_SVG =
    '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" stroke="currentColor" stroke-width="1.8"/>' +
    '<path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.01A1.7 1.7 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.01A1.7 1.7 0 0 0 20.91 10H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>' +
    "</svg>";

  /* ---------------- predicates ---------------- */

  function evalPred(pred, state, model) {
    if (!pred) return true;
    if (pred.any) return pred.any.some(function (p) { return evalPred(p, state, model); });
    if (pred.all) return pred.all.every(function (p) { return evalPred(p, state, model); });
    if (pred.group) {
      var sel = state.radios[pred.group.id];
      return pred.group.in.indexOf(sel) !== -1;
    }
    if (pred.checked) return state.checks.indexOf(pred.checked) !== -1;
    if (pred.notChecked) return state.checks.indexOf(pred.notChecked) === -1;
    if (pred.radios) {
      // count how many of the listed (visible) radio groups have a selection
      // in the given set; true while count stays below lessThan
      var cnt = 0;
      for (var ri = 0; ri < pred.radios.groups.length; ri++) {
        var gid = pred.radios.groups[ri], grp = null;
        for (var mi = 0; mi < model.groups.length; mi++) {
          if (model.groups[mi].id === gid) { grp = model.groups[mi]; break; }
        }
        if (!grp) continue;
        if (grp.onlyFor && !evalPred(grp.onlyFor, state, model)) continue;
        if (pred.radios.in.indexOf(state.radios[gid]) !== -1) cnt++;
      }
      return cnt < pred.radios.lessThan;
    }
    return true;
  }

  function optByCode(model, code) {
    for (var g = 0; g < model.groups.length; g++) {
      var opts = model.groups[g].options;
      for (var i = 0; i < opts.length; i++) {
        if (opts[i].code === code) return opts[i];
      }
    }
    return null;
  }

  /* Availability of a check option. Returns { ok, why } */
  function checkAvailability(model, state, opt) {
    if (opt.onlyFor && !evalPred(opt.onlyFor, state, model)) {
      return { ok: false, why: opt.onlyForReason || "Not available with this base model" };
    }
    // symmetric excludes
    var i, other;
    if (opt.excludes) {
      for (i = 0; i < opt.excludes.length; i++) {
        if (state.checks.indexOf(opt.excludes[i]) !== -1) {
          return { ok: false, why: "Not compatible with -" + opt.excludes[i] };
        }
      }
    }
    for (i = 0; i < state.checks.length; i++) {
      other = optByCode(model, state.checks[i]);
      if (other && other.excludes && other.excludes.indexOf(opt.code) !== -1) {
        return { ok: false, why: "Not compatible with -" + other.code };
      }
    }
    if (opt.needs) {
      for (i = 0; i < opt.needs.length; i++) {
        if (state.checks.indexOf(opt.needs[i]) === -1) {
          return { ok: false, why: "Requires option -" + opt.needs[i] };
        }
      }
    }
    if (opt.needsAny) {
      var hasOne = opt.needsAny.some(function (c) { return state.checks.indexOf(c) !== -1; });
      if (!hasOne) {
        return { ok: false, why: "Requires option -" + opt.needsAny.join(" or -") };
      }
    }
    // model-level atMost rules
    if (model.rules) {
      for (i = 0; i < model.rules.length; i++) {
        var r = model.rules[i];
        if (!r.atMost || r.of.indexOf(opt.code) === -1) continue;
        if (r.when && !evalPred(r.when, state, model)) continue;
        if (state.checks.indexOf(opt.code) !== -1) continue; // already selected stays valid
        var count = r.of.filter(function (c) { return state.checks.indexOf(c) !== -1; }).length;
        if (count >= r.atMost) return { ok: false, why: r.reason || "Option limit reached" };
      }
    }
    return { ok: true, why: "" };
  }

  function radioAvailability(model, state, opt) {
    if (opt.onlyFor && !evalPred(opt.onlyFor, state, model)) {
      return { ok: false, why: opt.onlyForReason || "Not available with current selections" };
    }
    return { ok: true, why: "" };
  }

  function groupVisible(model, state, group) {
    return !group.onlyFor || evalPred(group.onlyFor, state, model);
  }

  /* Reset any radio selection that has become invalid. */
  function revalidateRadios(model, state) {
    model.groups.forEach(function (group) {
      if (group.type !== "radio") return;
      var sel = state.radios[group.id];
      var selOpt = null, firstOk = null, defOk = null;
      group.options.forEach(function (o) {
        var ok = radioAvailability(model, state, o).ok;
        if (o.code === sel) selOpt = ok ? o : null;
        if (ok && !firstOk) firstOk = o;
        if (ok && o.default) defOk = o;
      });
      if (!selOpt) state.radios[group.id] = (defOk || firstOk || group.options[0]).code;
    });
  }

  /* Drop selected checks that have become invalid (cascades). */
  function pruneChecks(model, state) {
    var changed = true;
    while (changed) {
      changed = false;
      for (var i = state.checks.length - 1; i >= 0; i--) {
        var opt = optByCode(model, state.checks[i]);
        if (!opt) { state.checks.splice(i, 1); changed = true; continue; }
        var saved = state.checks.splice(i, 1)[0]; // evaluate as if unchecked
        var avail = checkAvailability(model, state, opt);
        state.checks.splice(i, 0, saved);
        if (!avail.ok) { state.checks.splice(i, 1); changed = true; }
      }
    }
  }

  /* ---------------- part number ---------------- */

  function resolvePn(opt, state) {
    if (typeof opt.pn === "function") return opt.pn(state) || "";
    if (typeof opt.pn === "string") return opt.pn;
    return "-" + opt.code;
  }
  function resolveDesc(opt, state) {
    var d = opt.desc !== undefined ? opt.desc : opt.label;
    if (typeof d === "function") return d(state) || "";
    return d || "";
  }

  function buildPartNumber(model, state) {
    var segs = [{ text: model.pnBase, key: "base" }];
    var descs = [];
    var accs = [];
    model.groups.forEach(function (group) {
      if (!groupVisible(model, state, group)) return;
      if (group.type === "radio") {
        var sel = state.radios[group.id];
        if (!sel) return;
        var opt = null;
        group.options.forEach(function (o) { if (o.code === sel) opt = o; });
        if (opt) {
          var pn = resolvePn(opt, state);
          if (pn) segs.push({ text: pn, key: group.id + ":" + opt.code });
          var dd = resolveDesc(opt, state);
          if (dd) descs.push(dd);
        }
      } else {
        group.options.forEach(function (o) {
          if (state.checks.indexOf(o.code) === -1) return;
          var dd = resolveDesc(o, state);
          if (o.acc) {
            accs.push({ code: o.acc, desc: dd });
            if (dd) descs.push("Acc P/N " + o.acc + ": " + dd);
            return;
          }
          var pn = resolvePn(o, state);
          if (pn) segs.push({ text: pn, key: "chk:" + o.code });
          if (dd) descs.push((o.codeLabel ? o.codeLabel + " " : "") + dd);
        });
      }
    });
    var pn = segs.map(function (s) { return s.text; }).join("");
    var accText = accs.length ? "With acc P/N " + accs.map(function (a) { return a.code; }).join(", ") : "";
    return { segs: segs, pn: pn, desc: descs.join("; "), accs: accs, accText: accText };
  }

  /* ---------------- quote stack ---------------- */

  function stackKey(family) { return "bncCfgQuote-" + family.id; }
  function loadStack(family) {
    try {
      var raw = window.localStorage.getItem(stackKey(family));
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }
  function saveStack(family, items) {
    try { window.localStorage.setItem(stackKey(family), JSON.stringify(items)); } catch (e) { /* private mode */ }
  }

  /* ---------------- DOM helpers ---------------- */

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html !== undefined) n.innerHTML = html;
    return n;
  }
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /* ---------------- rendering ---------------- */

  function openConfigurator(familyId, modelId) {
    var family = families[familyId];
    if (!family) return;
    closeConfigurator(true);

    var model = null;
    family.models.forEach(function (m) { if (m.id === modelId) model = m; });
    if (!model) model = family.models[0];

    var state = { radios: {}, checks: [], pinnedInfo: null };
    model.groups.forEach(function (g) {
      if (g.type === "radio") {
        var def = null;
        g.options.forEach(function (o) { if (o.default) def = o.code; });
        state.radios[g.id] = def || (g.options[0] && g.options[0].code);
      }
    });

    var overlay = el("div", "bnc-cfg-overlay");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", family.title);

    var win = el("div", "bnc-cfg-window");
    overlay.appendChild(win);

    var head = el("div", "bnc-cfg-head");
    var figPath = window.BNC_CFG_FIG_PATH || "figures/";
    head.innerHTML =
      '<span class="bnc-cfg-logochip"><img src="' + figPath + 'bnc-logo.svg" alt="Berkeley Nucleonics"></span>' +
      '<div><h2>' + esc(family.title) + "</h2>" +
      (family.subtitle ? '<p class="bnc-cfg-head-sub">' + esc(family.subtitle) + "</p>" : "") +
      "</div>";
    var closeBtn = el("button", "bnc-cfg-close", "&#10005;");
    closeBtn.setAttribute("aria-label", "Close configurator");
    closeBtn.addEventListener("click", function () { closeConfigurator(); });
    win.appendChild(head);
    win.appendChild(closeBtn);

    var body = el("div", "bnc-cfg-body");
    var left = el("div", "bnc-cfg-left");
    var right = el("div", "bnc-cfg-right");
    body.appendChild(left);
    body.appendChild(right);
    win.appendChild(body);

    var foot = el("div", "bnc-cfg-foot");
    win.appendChild(foot);

    document.body.appendChild(overlay);
    document.body.style.overflow = "hidden";

    active = { family: family, model: model, state: state, dom: { overlay: overlay, left: left, right: right, foot: foot }, lastPn: "" };

    overlay.addEventListener("mousedown", function (e) { if (e.target === overlay) closeConfigurator(); });
    document.addEventListener("keydown", escListener);

    renderAll();
    requestAnimationFrame(function () { overlay.classList.add("bnc-open"); });
  }

  function escListener(e) { if (e.key === "Escape") closeConfigurator(); }

  function closeConfigurator(instant) {
    if (!active) return;
    var overlay = active.dom.overlay;
    document.removeEventListener("keydown", escListener);
    document.body.style.overflow = "";
    active = null;
    if (instant) { overlay.remove(); return; }
    overlay.classList.remove("bnc-open");
    setTimeout(function () { overlay.remove(); }, 240);
  }

  function switchModel(modelId) {
    if (!active) return;
    openConfigurator(active.family.id, modelId);
  }

  function renderAll() {
    renderLeft();
    renderRight();
    renderFoot();
  }

  /* ----- left column: model cards + groups ----- */

  function renderLeft() {
    var a = active, left = a.dom.left;
    left.innerHTML = "";

    left.appendChild(el("p", "bnc-cfg-group-label", "1. Your base model"));
    var baseStrip = el("div", "bnc-cfg-models");
    var baseCard = el("div", "bnc-cfg-modelcard bnc-selected bnc-basecard");
    baseCard.innerHTML = '<span class="bnc-mc-name">' + esc(a.model.name) + '</span><span class="bnc-mc-blurb">' + esc(a.model.blurb || "") + "</span>";
    baseCard.addEventListener("mouseenter", function () { previewInfo(a.model.name, a.model.info || a.model.blurb || ""); });
    baseCard.addEventListener("mouseleave", restoreInfo);
    baseStrip.appendChild(baseCard);
    left.appendChild(baseStrip);

    var stepNo = 2;
    a.model.groups.forEach(function (group) {
      if (!groupVisible(a.model, a.state, group)) return;
      var wrap = el("div", "bnc-cfg-group");
      wrap.appendChild(el("p", "bnc-cfg-group-label", stepNo + ". " + esc(group.label)));
      stepNo++;
      if (group.hint) wrap.appendChild(el("p", "bnc-cfg-group-hint", esc(group.hint)));
      var box = el("div", "bnc-cfg-opts");
      if (group.type !== "radio") box.style.flexDirection = "column";

      group.options.forEach(function (opt) {
        var avail = group.type === "radio"
          ? radioAvailability(a.model, a.state, opt)
          : checkAvailability(a.model, a.state, opt);
        var isSel = group.type === "radio"
          ? a.state.radios[group.id] === opt.code
          : a.state.checks.indexOf(opt.code) !== -1;

        var node;
        if (group.type === "radio") {
          node = el("button", "bnc-cfg-pill");
          node.type = "button";
          node.innerHTML =
            '<span class="bnc-pill-code">' + esc(opt.label) + "</span>" +
            (opt.note ? '<span class="bnc-pill-note">' + esc(opt.note) + "</span>" : "");
        } else {
          node = el("button", "bnc-cfg-checkrow");
          node.type = "button";
          node.innerHTML =
            '<span class="bnc-cfg-checkbox"></span>' +
            "<span>" +
            '<span class="bnc-check-code">' + esc(opt.codeLabel || ("-" + opt.code)) + "</span> " +
            '<span class="bnc-check-desc">' + esc(opt.label) + "</span>" +
            (opt.note ? '<span class="bnc-check-note">' + esc(opt.note) + "</span>" : "") +
            (!avail.ok && !isSel ? '<span class="bnc-cfg-why">' + esc(avail.why) + "</span>" : "") +
            "</span>";
        }
        if (isSel) node.classList.add("bnc-selected");
        if (!avail.ok && !isSel) node.classList.add("bnc-disabled");

        node.addEventListener("click", function () {
          if (!avail.ok && !isSel) {
            node.classList.remove("bnc-shake");
            void node.offsetWidth;
            node.classList.add("bnc-shake");
            pinInfo("Not available", avail.why + ".");
            return;
          }
          if (group.type === "radio") {
            if (a.state.radios[group.id] === opt.code) return;
            a.state.radios[group.id] = opt.code;
          } else {
            var idx = a.state.checks.indexOf(opt.code);
            if (idx === -1) a.state.checks.push(opt.code); else a.state.checks.splice(idx, 1);
          }
          revalidateRadios(a.model, a.state);
          pruneChecks(a.model, a.state);
          pinInfo(infoTitle(opt), opt.info || resolveDesc(opt, a.state));
          renderAll();
        });
        node.addEventListener("mouseenter", function () { previewInfo(infoTitle(opt), opt.info || resolveDesc(opt, a.state)); });
        node.addEventListener("mouseleave", restoreInfo);

        box.appendChild(node);
      });
      wrap.appendChild(box);
      left.appendChild(wrap);
    });
  }

  function infoTitle(opt) {
    if (opt.codeLabel) return opt.codeLabel + " " + opt.label;
    if (opt.pn && typeof opt.pn === "string" && opt.pn !== "") return opt.pn.replace(/^-/, "Option -") + " " + (opt.infoName || "");
    return opt.label;
  }

  /* ----- right column: image, info, stack, quote form ----- */

  function currentImage() {
    var a = active;
    if (a.model.imageRules) {
      for (var i = 0; i < a.model.imageRules.length; i++) {
        var r = a.model.imageRules[i];
        if (evalPred(r.when, a.state, a.model)) return { src: r.src, caption: r.caption || a.model.imageCaption || "" };
      }
    }
    return { src: a.model.image, caption: a.model.imageCaption || "" };
  }

  function renderRight() {
    var a = active, right = a.dom.right;
    right.innerHTML = "";

    // image
    var img = currentImage();
    var imgbox = el("div", "bnc-cfg-imgbox");
    var imgEl = el("img");
    imgEl.alt = a.model.name;
    imgEl.src = img.src;
    imgbox.appendChild(imgEl);
    if (img.caption) imgbox.appendChild(el("p", "bnc-cfg-imgcaption", esc(img.caption)));
    var badges = el("div", "bnc-cfg-imgbadges");
    a.model.groups.forEach(function (g) {
      if (!groupVisible(a.model, a.state, g)) return;
      g.options.forEach(function (o) {
        var on = g.type === "radio" ? a.state.radios[g.id] === o.code : a.state.checks.indexOf(o.code) !== -1;
        if (on && o.badge) badges.appendChild(el("span", "bnc-cfg-badge", esc(o.badge)));
      });
    });
    if (badges.children.length) imgbox.appendChild(badges);
    right.appendChild(imgbox);

    // info panel
    var info = el("div", "bnc-cfg-info");
    info.id = "bncCfgInfo";
    var pinned = a.state.pinnedInfo || { title: a.model.name, text: a.model.info || a.model.blurb || "" };
    info.innerHTML = '<div class="bnc-info-fade"><h4>' + esc(pinned.title) + "</h4><p>" + esc(pinned.text) + "</p></div>";
    right.appendChild(info);

    // other similar models (model.similar limits which family mates appear;
    // an empty array hides the panel entirely)
    var similarIds = a.model.similar || a.family.models
      .filter(function (m) { return m.id !== a.model.id; })
      .map(function (m) { return m.id; });
    if (similarIds.length) {
      var others = el("div", "bnc-cfg-others");
      others.appendChild(el("h4", null, "Other similar models"));
      a.family.models.forEach(function (m) {
        if (m.id === a.model.id || similarIds.indexOf(m.id) === -1) return;
        var oc = el("button", "bnc-cfg-othercard");
        oc.type = "button";
        oc.innerHTML = '<span class="bnc-mc-name">' + esc(m.name) + '</span><span class="bnc-mc-blurb">' + esc(m.blurb || "") + "</span>";
        oc.addEventListener("click", function () { switchModel(m.id); });
        oc.addEventListener("mouseenter", function () { previewInfo(m.name, m.info || m.blurb || ""); });
        oc.addEventListener("mouseleave", restoreInfo);
        others.appendChild(oc);
      });
      right.appendChild(others);
    }

    // quote stack
    var stackBox = el("div", "bnc-cfg-stack");
    stackBox.appendChild(el("h4", null, "Your quote list (up to 5 products)"));
    var items = loadStack(a.family);
    if (!items.length) {
      stackBox.appendChild(el("p", "bnc-cfg-stack-empty",
        "No configurations added yet. Build a configuration and select “Add to quote list”. You can stack several units, for example a 2-channel and a 4-channel version."));
    } else {
      items.forEach(function (it, idx) {
        var row = el("div", "bnc-cfg-stack-item");
        var pn = el("div", "bnc-cfg-stack-pn",
          '<span class="bnc-line-tag">Line ' + (idx + 1) + "</span>" + esc(it.pn) +
          "<small>" + esc(it.modelName + (it.accText ? " - " + it.accText : "")) + "</small>" +
          (it.delivery ? '<small class="bnc-delivery">' + esc("Estimated Delivery: " + it.delivery) + "</small>" : ""));
        var qty = el("span", "bnc-cfg-qty");
        var minus = el("button", null, "−");
        var num = el("span", null, String(it.qty));
        var plus = el("button", null, "+");
        minus.type = plus.type = "button";
        minus.addEventListener("click", function () {
          it.qty = Math.max(1, it.qty - 1); saveStack(a.family, items); renderRight(); renderFoot();
        });
        plus.addEventListener("click", function () {
          it.qty = Math.min(99, it.qty + 1); saveStack(a.family, items); renderRight(); renderFoot();
        });
        qty.appendChild(minus); qty.appendChild(num); qty.appendChild(plus);
        var rm = el("button", "bnc-cfg-stack-remove", "×");
        rm.type = "button";
        rm.title = "Remove from quote list";
        rm.addEventListener("click", function () {
          items.splice(idx, 1); saveStack(a.family, items); renderRight(); renderFoot();
        });
        row.appendChild(pn); row.appendChild(qty); row.appendChild(rm);
        stackBox.appendChild(row);
      });
    }
    right.appendChild(stackBox);

    // quote form (hidden until requested)
    var form = el("div", "bnc-cfg-quoteform");
    form.id = "bncCfgQuoteForm";
    form.innerHTML =
      '<div><label for="bncQfName">Name *</label><input id="bncQfName" type="text" autocomplete="name"></div>' +
      '<div><label for="bncQfEmail">Work email *</label><input id="bncQfEmail" type="email" autocomplete="email"></div>' +
      '<div><label for="bncQfCompany">Company / institution</label><input id="bncQfCompany" type="text" autocomplete="organization"></div>' +
      '<div><label for="bncQfPhone">Phone</label><input id="bncQfPhone" type="tel" autocomplete="tel"></div>' +
      '<div><label for="bncQfMsg">Notes (mixed output types, delivery needs, questions)</label><textarea id="bncQfMsg"></textarea></div>' +
      '<input type="text" name="_gotcha" style="display:none" tabindex="-1" autocomplete="off">' +
      '<p class="bnc-cfg-form-msg" id="bncQfMsgLine"></p>';
    var send = el("button", "bnc-cfg-btn bnc-cfg-btn-primary", "Send QuickQuote request");
    send.type = "button";
    send.addEventListener("click", submitQuote);
    form.appendChild(send);
    right.appendChild(form);

    // Autofill from the site's Clerk session when the visitor is signed in.
    try {
      var u = window.Clerk && window.Clerk.user;
      if (u) {
        var nmEl = form.querySelector("#bncQfName");
        var emEl = form.querySelector("#bncQfEmail");
        var full = u.fullName || (((u.firstName || "") + " " + (u.lastName || "")).trim());
        var mail = (u.primaryEmailAddress && u.primaryEmailAddress.emailAddress) ||
          (u.emailAddresses && u.emailAddresses[0] && u.emailAddresses[0].emailAddress) || "";
        if (nmEl && !nmEl.value && full) nmEl.value = full;
        if (emEl && !emEl.value && mail) emEl.value = mail;
      }
    } catch (e) { /* no Clerk on this page */ }
  }

  var infoRestoreTimer = null;
  function previewInfo(title, text) {
    var box = document.getElementById("bncCfgInfo");
    if (!box || !text) return;
    if (infoRestoreTimer) { clearTimeout(infoRestoreTimer); infoRestoreTimer = null; }
    box.innerHTML = '<div class="bnc-info-fade"><h4>' + esc(title) + "</h4><p>" + esc(text) + "</p></div>";
  }
  function pinInfo(title, text) {
    if (!active || !text) return;
    active.state.pinnedInfo = { title: title, text: text };
  }
  function restoreInfo() {
    if (!active) return;
    var a = active;
    infoRestoreTimer = setTimeout(function () {
      var box = document.getElementById("bncCfgInfo");
      if (!box || !active) return;
      var pinned = a.state.pinnedInfo || { title: a.model.name, text: a.model.info || a.model.blurb || "" };
      box.innerHTML = '<div class="bnc-info-fade"><h4>' + esc(pinned.title) + "</h4><p>" + esc(pinned.text) + "</p></div>";
    }, 350);
  }

  /* ----- footer: part number + actions ----- */

  function renderFoot() {
    var a = active, foot = a.dom.foot;
    var built = buildPartNumber(a.model, a.state);
    foot.innerHTML = "";

    var pnwrap = el("div", "bnc-cfg-pnwrap");
    pnwrap.appendChild(el("p", "bnc-cfg-pnlabel", "Your configured part number"));
    var pnEl = el("p", "bnc-cfg-pn");
    var prev = a.lastPn || "";
    built.segs.forEach(function (s) {
      var seg = el("span", "bnc-pn-seg", esc(s.text));
      if (prev.indexOf(s.text) === -1) seg.classList.add("bnc-pn-new");
      pnEl.appendChild(seg);
    });
    if (built.accText) {
      var accSeg = el("span", "bnc-pn-acc", esc(" " + built.accText));
      if ((a.lastAcc || "") !== built.accText) accSeg.classList.add("bnc-pn-new");
      pnEl.appendChild(accSeg);
    }
    a.lastPn = built.pn;
    a.lastAcc = built.accText;
    pnwrap.appendChild(pnEl);
    if (built.desc) pnwrap.appendChild(el("p", "bnc-cfg-pndesc", esc(built.desc)));
    foot.appendChild(pnwrap);

    var actions = el("div", "bnc-cfg-foot-actions");
    var reset = el("button", "bnc-cfg-reset", "Reset");
    reset.type = "button";
    reset.title = "Clear all selections and start this model over";
    reset.addEventListener("click", function () { switchModel(a.model.id); });
    var add = el("button", "bnc-cfg-btn bnc-cfg-btn-secondary", "Add to my quote list");
    add.type = "button";
    add.addEventListener("click", function () {
      var items = loadStack(a.family);
      var existing = null;
      items.forEach(function (it) { if (it.pn === built.pn && (it.accText || "") === built.accText) existing = it; });
      if (existing) existing.qty = Math.min(99, existing.qty + 1);
      else items.push({ pn: built.pn, accText: built.accText, desc: built.desc, modelName: a.model.name, delivery: a.model.delivery || "", qty: 1 });
      saveStack(a.family, items);
      add.classList.remove("bnc-flash-added");
      void add.offsetWidth;
      add.classList.add("bnc-flash-added");
      renderRight();
      renderFoot();
    });
    var go = el("button", "bnc-cfg-btn bnc-cfg-btn-primary",
      "All set, send me a QuickQuote");
    go.type = "button";
    go.addEventListener("click", function () {
      var items = loadStack(a.family);
      if (!items.length) {
        items.push({ pn: built.pn, accText: built.accText, desc: built.desc, modelName: a.model.name, delivery: a.model.delivery || "", qty: 1 });
        saveStack(a.family, items);
        renderRight();
      }
      var form = document.getElementById("bncCfgQuoteForm");
      if (form) {
        form.classList.add("bnc-active");
        if (typeof form.scrollIntoView === "function") {
          form.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
        var nm = document.getElementById("bncQfName");
        if (nm) nm.focus();
      }
    });
    actions.appendChild(reset);
    actions.appendChild(add);
    actions.appendChild(go);
    foot.appendChild(actions);
  }

  /* ----- quote submission ----- */

  function submitQuote() {
    var a = active;
    if (!a) return;
    var name = (document.getElementById("bncQfName") || {}).value || "";
    var email = (document.getElementById("bncQfEmail") || {}).value || "";
    var company = (document.getElementById("bncQfCompany") || {}).value || "";
    var phone = (document.getElementById("bncQfPhone") || {}).value || "";
    var msg = (document.getElementById("bncQfMsg") || {}).value || "";
    var line = document.getElementById("bncQfMsgLine");

    if (!name.trim() || !email.trim() || email.indexOf("@") === -1) {
      if (line) { line.className = "bnc-cfg-form-msg bnc-err"; line.textContent = "Please enter your name and a valid email address."; }
      return;
    }

    var items = loadStack(a.family);
    var configLines = items.map(function (it, i) {
      return "Line " + (i + 1) + "  |  QTY " + it.qty + "  |  " + it.pn +
        (it.accText ? " (" + it.accText + ")" : "") + "  |  " + it.modelName +
        (it.delivery ? "  |  Estimated Delivery: " + it.delivery : "") +
        (it.desc ? "  |  " + it.desc : "");
    }).join("\n");

    var payload = {
      _subject: "QuickQuote request: " + items.map(function (it) { return it.pn; }).join(", "),
      form_source: "product-configurator",
      family: a.family.title,
      name: name,
      email: email,
      company: company,
      phone: phone,
      configurations: configLines,
      message: msg
    };

    var endpoint = a.family.endpoint || window.BNC_CFG_ENDPOINT || DEFAULT_ENDPOINT;
    if (line) { line.className = "bnc-cfg-form-msg"; line.textContent = "Sending…"; }

    // Attribution rides along in the payload: this form never navigates, so the hidden
    // inputs the head block stamps onto native forms do not apply here.
    var attr = window.BNC_ATTR || {};
    for (var ak in attr) { if (Object.prototype.hasOwnProperty.call(attr, ak)) payload[ak] = attr[ak]; }

    var body = Object.keys(payload).map(function (k) {
      return encodeURIComponent(k) + "=" + encodeURIComponent(payload[k]);
    }).join("&");

    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" },
      body: body
    }).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      // Inline success, no navigation: fire the conversion here or it is never counted.
      if (window.bncTrackFormSubmit) window.bncTrackFormSubmit("configurator");
      quoteSuccess(items);
    }).catch(function () {
      // Offline / local demo fallback: open a prefilled email instead.
      var mailBody = "Please quote the following configuration(s):\n\n" + configLines +
        "\n\nName: " + name + "\nCompany: " + company + "\nPhone: " + phone +
        (msg ? "\n\nNotes: " + msg : "");
      window.location.href = "mailto:" + FALLBACK_EMAIL +
        "?subject=" + encodeURIComponent(payload._subject) +
        "&body=" + encodeURIComponent(mailBody);
      if (line) {
        line.className = "bnc-cfg-form-msg bnc-err";
        line.textContent = "Direct send was unavailable, so we opened an email draft with your configuration instead.";
      }
    });
  }

  function quoteSuccess(items) {
    var a = active;
    if (!a) return;
    saveStack(a.family, []);
    var right = a.dom.right;
    right.innerHTML = "";
    var ok = el("div", "bnc-cfg-success");
    ok.innerHTML =
      '<div class="bnc-success-mark"></div>' +
      "<h3>QuickQuote request received</h3>" +
      "<p>Thank you. A BNC applications specialist will reply with pricing for " +
      items.length + (items.length === 1 ? " configuration" : " configurations") +
      ", typically within one business day.</p>";
    right.appendChild(ok);
  }

  /* ---------------- launch buttons ---------------- */

  function injectLaunchButtons() {
    var nodes = document.querySelectorAll("[data-bnc-configurator]");
    Array.prototype.forEach.call(nodes, function (node) {
      if (node.getAttribute("data-bnc-bound")) return;
      node.setAttribute("data-bnc-bound", "1");
      if (!node.innerHTML.trim()) {
        node.classList.add("bnc-config-launch");
        node.innerHTML = GEAR_SVG +
          "<span>Configure This Product" +
          '<span class="bnc-config-launch-sub">Build your part number and request a quote</span></span>';
      }
      node.addEventListener("click", function (e) {
        e.preventDefault();
        openConfigurator(node.getAttribute("data-bnc-configurator"), node.getAttribute("data-bnc-model") || undefined);
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectLaunchButtons);
  } else {
    injectLaunchButtons();
  }

  /* ---------------- public API ---------------- */

  window.BNCConfigurator = {
    register: function (family) { families[family.id] = family; },
    open: openConfigurator,
    close: function () { closeConfigurator(); },
    bind: injectLaunchButtons
  };

  /* Drain any registrations queued by a data file loaded before the engine. */
  if (window.__bncCfgQueue) {
    window.__bncCfgQueue.forEach(function (f) { families[f.id] = f; });
    window.__bncCfgQueue = null;
  }
})();
