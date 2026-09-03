(function () {
  "use strict";

  var app = document.getElementById("app");
  var QUIZ = window.QUIZ;
  var blocks = QUIZ.blocks;
  var state = { cur: 0, answers: [], timer: null, timeLeft: 0, timerStarted: false, audioPlaying: false };
  blocks.forEach(function (b) {
    state.answers.push(b.question_data.map(function (s) {
      if (s.field_question_type === "Gap with choices" || s.field_question_type === "Fill in the blanks") {
        var n = countGaps(s.question_text);
        return { type: "gaps", values: new Array(n).fill(null) };
      }
      return { type: "choice", value: null };
    }));
  });

  function countGaps(html) {
    var m = html.match(/GAP_\d+/g);
    return m ? m.length : 0;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function catKey(cat) {
    if (cat === "Hörverständnis") return "hören";
    if (cat === "Leseverständnis") return "lesen";
    return "grammar";
  }
  function plainQuestion(s) {
    return String(s == null ? "" : s)
      .replace(/\[GAP_\d+\]/g, "___")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  function categoryLabel(cat) {
    if (cat === "Hörverständnis") return "Hören";
    if (cat === "Leseverständnis") return "Lesen";
    return "Wortschatz/Grammatik";
  }

  function renderAnswerKey() {
    var number = 0;
    var items = [];
    blocks.forEach(function (b, blockIdx) {
      b.question_data.forEach(function (sub) {
        var answers = Array.isArray(sub.actual_answer) ? sub.actual_answer : [sub.actual_answer];
        answers.forEach(function (answer, answerIdx) {
          if (answer == null) return;
          number++;
          var prompt = plainQuestion(sub.question_text);
          if (answers.length > 1) prompt = "Lücke " + (answerIdx + 1);
          items.push(
            '<li class="answer-item">' +
              '<div class="answer-meta"><span class="answer-no">No. ' + number + '</span><span>Frage ' + (blockIdx + 1) + '</span><span>' + esc(categoryLabel(b.field_question_category)) + '</span></div>' +
              '<div class="answer-prompt">' + esc(prompt) + '</div>' +
              '<div class="answer-value">' + esc(answer) + '</div>' +
            '</li>'
          );
        });
      });
    });
    return '<div class="answer-key-head">' +
      '<div><h2 id="answer-title">Kunci jawaban untuk Sensei</h2><p>Semua 40 poin yang dinilai, termasuk jawaban tiap celah.</p></div>' +
      '<button class="answer-close" id="btn-key-close" type="button">Tutup</button>' +
      '</div>' +
      '<ol class="answer-list">' + items.join("") + '</ol>';
  }

  /* ---------------- Start page ---------------- */
  function renderStart() {
    stopTimer();
    app.innerHTML =
      '<div class="start-grid">' +
        '<div class="card">' +
          "<h1>Deutsch Einstufungstest</h1>" +
          '<p style="font-weight:600;margin-bottom:8px">Bevor es losgeht, noch drei wichtige Hinweise!</p>' +
          '<div class="hint"><div class="num">1.</div><div>Überprüfe vor dem Start deine Lautsprecher oder Kopfhörer – der Test enthält Hörverstehensaufgaben!</div></div>' +
          '<div class="hint"><div class="num">2.</div><div>Vermeide Tippfehler in den Lückentexten – jeder Buchstabe zählt.</div></div>' +
          '<div class="hint"><div class="num">3.</div><div>Jede Aufgabe ist mit einem Countdown versehen. Bei Hörverstehensaufgaben startet er, sobald du den Hörbeitrag abspielst.</div></div>' +
          '<div class="start-actions"><button class="btn" id="btn-start">Test starten</button><button class="btn btn-secondary" id="btn-key" type="button" aria-expanded="false" aria-controls="answer-panel">Antworten für Sensei</button></div>' +
          '<section class="answer-key card" id="answer-panel" hidden aria-labelledby="answer-title"></section>' +
        "</div>" +
        '<div class="sidebox">' +
          '<h5>Fakten</h5><ul><li>Kostenloser Einstufungstest</li><li>Nach europäischem Standard</li><li>In nur 15 Minuten</li></ul>' +
          "<h5>Aufgabentypen</h5><ul><li>Lesen</li><li>Hören</li><li>Wortschatz</li></ul>" +
          "<h5>Vorteile</h5><ul><li>Countdown</li><li>Niveaustufe erfahren</li></ul>" +
        "</div>" +
      "</div>";
    document.getElementById("btn-start").onclick = function () { renderQuestion(0); };
    var keyButton = document.getElementById("btn-key");
    var keyPanel = document.getElementById("answer-panel");
    keyButton.onclick = function () {
      if (keyPanel.hidden) {
        keyPanel.innerHTML = renderAnswerKey();
        keyPanel.hidden = false;
        keyButton.setAttribute("aria-expanded", "true");
        document.getElementById("btn-key-close").onclick = function () {
          keyPanel.hidden = true;
          keyButton.setAttribute("aria-expanded", "false");
          keyButton.focus();
        };
        document.getElementById("btn-key-close").focus();
      } else {
        keyPanel.hidden = true;
        keyButton.setAttribute("aria-expanded", "false");
      }
    };
  }

  /* ---------------- Question screens ---------------- */
  function fmt(sec) {
    var total = Math.ceil(Math.max(0, sec));
    var m = Math.floor(total / 60), s = total % 60;
    return (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
  }

  function renderQuestion(i) {
    stopTimer();
    pauseAudio();
    state.cur = i;
    state.timerStarted = false;
    var b = blocks[i];
    var totalSec = parseFloat(b.timer) || 60;
    state.timeLeft = totalSec;
    state.totalSec = totalSec;

    var hasAudio = !!(b.media && b.media.media_audio);
    var html = '<div class="card">' +
      '<div class="q-top">' +
        '<div class="q-progress">Frage ' + (i + 1) + "/" + blocks.length + "</div>" +
        '<div class="timer-wrap">' +
          (hasAudio ? '<button class="play-btn" id="btn-play" title="anhören">' + ICON_PLAY + "</button>" : "") +
          ringHTML(totalSec) +
        "</div>" +
      "</div>";

    if (hasAudio) html += '<audio id="q-audio" src="' + esc(b.media.media_audio) + '" preload="auto"></audio>';
    html += '<div class="q-instruction">' + b.field_question_description + "</div>";
    if (b.field_que_additional_desc) html += '<div class="q-reading">' + b.field_que_additional_desc + "</div>";

    b.question_data.forEach(function (sub, j) {
      html += '<div class="sub-block" data-sub="' + j + '">';
      if (sub.field_question_type === "Gap with choices") html += renderGapChoices(sub, i, j);
      else if (sub.field_question_type === "Fill in the blanks") html += renderFillBlanks(sub, i, j);
      else {
        html += '<div class="sub-question">' + esc(sub.question_text) + "</div>";
        html += '<div class="choices" data-sub="' + j + '">';
        sub.multiple_choices.forEach(function (c) {
          html += '<button class="choice-btn" data-sub="' + j + '" data-value="' + esc(c) + '">' + esc(c) + "</button>";
        });
        html += "</div>";
      }
      html += "</div>";
    });

    html += '<div class="q-footer"><button class="btn" id="btn-next" disabled>' +
      (i === blocks.length - 1 ? "Test beenden" : "Nächste Frage") + "</button></div></div>";
    app.innerHTML = html;

    wireChoices(i);
    if (hasAudio) wireAudio(i);
    if (b.question_data.some(function (s) { return s.field_question_type === "Fill in the blanks"; })) wireBlanks(i);
    if (b.question_data.some(function (s) { return s.field_question_type === "Gap with choices"; })) wireGapChoices(i);

    document.getElementById("btn-next").onclick = function () {
      if (i === blocks.length - 1) renderResult();
      else renderQuestion(i + 1);
    };
    if (!hasAudio) startTimer(i);
  }

  var ICON_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  var ICON_PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';

  function ringHTML(total) {
    var r = 24, c = 2 * Math.PI * r;
    return '<svg class="timer-ring" viewBox="0 0 56 56">' +
      '<circle class="trail" cx="28" cy="28" r="' + r + '"></circle>' +
      '<circle class="path" id="ring-path" cx="28" cy="28" r="' + r + '" stroke-dasharray="' + c + '" stroke-dashoffset="0"></circle>' +
      '<text id="ring-text" x="28" y="29">' + fmt(total) + "</text></svg>";
  }

  function startTimer(blockIdx) {
    stopTimer();
    var path = document.getElementById("ring-path");
    var label = document.getElementById("ring-text");
    var c = 2 * Math.PI * 24;
    state.timer = setInterval(function () {
      state.timeLeft -= 0.2;
      if (state.timeLeft <= 0) {
        state.timeLeft = 0;
        stopTimer();
        if (blockIdx === blocks.length - 1) renderResult();
        else renderQuestion(blockIdx + 1);
        return;
      }
      if (path) path.setAttribute("stroke-dashoffset", String(c * (1 - state.timeLeft / state.totalSec)));
      if (label) label.textContent = fmt(state.timeLeft);
    }, 200);
  }
  function stopTimer() { if (state.timer) { clearInterval(state.timer); state.timer = null; } }

  function wireAudio(blockIdx) {
    var btn = document.getElementById("btn-play");
    var audio = document.getElementById("q-audio");
    btn.onclick = function () {
      if (audio.paused) {
        audio.play();
        btn.innerHTML = ICON_PAUSE;
        if (!state.timerStarted) { state.timerStarted = true; startTimer(blockIdx); }
      } else { audio.pause(); btn.innerHTML = ICON_PLAY; }
    };
    audio.onended = function () { btn.innerHTML = ICON_PLAY; };
  }
  function pauseAudio() {
    var a = document.getElementById("q-audio");
    if (a) { a.pause(); }
  }

  function wireChoices(blockIdx) {
    app.querySelectorAll(".choice-btn").forEach(function (btn) {
      btn.onclick = function () {
        var j = +btn.dataset.sub;
        state.answers[blockIdx][j].value = btn.dataset.value;
        app.querySelectorAll('.choice-btn[data-sub="' + j + '"]').forEach(function (x) { x.classList.remove("selected"); });
        btn.classList.add("selected");
        updateNext();
      };
    });
  }

  function renderGapChoices(sub, blockIdx, subIdx) {
    var html = sub.question_text.replace(/\[GAP_(\d+)\]/g, function (_, n) {
      return '<button class="gap-btn" data-sub="' + subIdx + '" data-gap="' + n + '">&nbsp;</button>';
    });
    html += '<div class="pool" data-sub="' + subIdx + '">';
    sub.multiple_choices.forEach(function (w) {
      html += '<button class="pool-chip" data-sub="' + subIdx + '" data-word="' + esc(w) + '">' + esc(w) + "</button>";
    });
    html += "</div>";
    return html;
  }

  function wireGapChoices(blockIdx) {
    var active = null;
    app.querySelectorAll(".gap-btn").forEach(function (g) {
      g.onclick = function () {
        var j = +g.dataset.sub, n = +g.dataset.gap;
        var cur = state.answers[blockIdx][j].values[n - 1];
        if (cur) { // clear
          state.answers[blockIdx][j].values[n - 1] = null;
          g.innerHTML = "&nbsp;";
          if (g._chip) g._chip.classList.remove("used");
          g._chip = null;
          delete g.dataset.filled;
          updateNext();
          return;
        }
        active = g;
        app.querySelectorAll(".gap-btn").forEach(function (x) { x.classList.remove("active"); });
        g.classList.add("active");
      };
    });
    app.querySelectorAll(".pool-chip").forEach(function (chip) {
      chip.onclick = function () {
        var target = active || app.querySelector('.gap-btn[data-sub="' + chip.dataset.sub + '"]:not([data-filled])');
        if (!target) return;
        var j = +target.dataset.sub, n = +target.dataset.gap;
        if (target._chip) target._chip.classList.remove("used");
        state.answers[blockIdx][j].values[n - 1] = chip.dataset.word;
        target.textContent = chip.dataset.word;
        target.dataset.filled = "1";
        target._chip = chip;
        target.classList.remove("active");
        chip.classList.add("used");
        active = null;
        updateNext();
      };
    });
  }

  function renderFillBlanks(sub, blockIdx, subIdx) {
    var html = sub.question_text.replace(/\[GAP_(\d+)\]/g, function (_, n) {
      var ans = Array.isArray(sub.actual_answer) ? sub.actual_answer[+n - 1] : sub.actual_answer;
      var w = ans ? Math.max(4, ans.length + 2) : 4;
      return '<input class="blank-input" data-sub="' + subIdx + '" data-gap="' + n + '" size="' + w + '" autocomplete="off" spellcheck="false">';
    });
    return '<div class="gap-text">' + html + "</div>";
  }

  function wireBlanks(blockIdx) {
    app.querySelectorAll(".blank-input").forEach(function (inp) {
      inp.oninput = function () {
        var j = +inp.dataset.sub, n = +inp.dataset.gap;
        state.answers[blockIdx][j].values[n - 1] = inp.value.trim();
        updateNext();
      };
      inp.onchange = inp.oninput; // AX setValue / autofill memicu change, bukan input
    });
  }

  function subComplete(blockIdx, subIdx) {
    var a = state.answers[blockIdx][subIdx];
    if (a.type === "choice") return !!a.value;
    var sub = blocks[blockIdx].question_data[subIdx];
    return a.values.every(function (v, idx) {
      var ans = Array.isArray(sub.actual_answer) ? sub.actual_answer[idx] : sub.actual_answer;
      if (ans == null) return true; // ungraded gap
      return !!v;
    });
  }
  function updateNext() {
    var i = state.cur;
    var done = state.answers[i].every(function (_, j) { return subComplete(i, j); });
    document.getElementById("btn-next").disabled = !done;
  }

  /* ---------------- Result ---------------- */
  function renderResult() {
    stopTimer(); pauseAudio();
    var score = { hören: 0, lesen: 0, grammar: 0 };
    var max = { hören: 0, lesen: 0, grammar: 0 };
    var review = [];
    blocks.forEach(function (b, i) {
      b.question_data.forEach(function (sub, j) {
        var cat = catKey(b.field_question_category);
        var a = state.answers[i][j];
        if (a.type === "choice") {
          max[cat]++;
          var ok = a.value && a.value.toLowerCase().trim() === String(sub.actual_answer).toLowerCase().trim();
          if (ok) score[cat]++;
          review.push({ q: plainQuestion(sub.question_text).slice(0, 80), given: a.value || "—", correct: sub.actual_answer, ok: ok });
        } else {
          sub.actual_answer.forEach(function (ans, gi) {
            if (ans == null) return;
            max[cat]++;
            var g = a.values[gi] || "";
            var ok2 = g.toLowerCase().trim() === String(ans).toLowerCase().trim();
            if (ok2) score[cat]++;
            review.push({ q: "… " + plainQuestion(sub.question_text).slice(0, 60) + " [Lücke " + (gi + 1) + "]", given: g || "—", correct: ans, ok: ok2 });
          });
        }
      });
    });
    var total = score.hören + score.lesen + score.grammar;
    var level = "A1";
    Object.keys(QUIZ.cefr).forEach(function (range) {
      var p = range.split("-").map(Number);
      if (total >= p[0] && total <= p[1]) level = QUIZ.cefr[range];
    });

    var html = '<div class="result-head"><h1>Vielen Dank für deine Teilnahme.</h1>' +
      '<p>Deine Niveaustufe ist</p><div class="level">' + level + "</div></div>" +
      '<div class="score-row">' +
        '<div class="score-box"><h3>Lesen</h3><div class="marks">' + score.lesen + "/" + max.lesen + "</div></div>" +
        '<div class="score-box"><h3>Hören</h3><div class="marks">' + score.hören + "/" + max.hören + "</div></div>" +
        '<div class="score-box"><h3>Wortschatz</h3><div class="marks">' + score.grammar + "/" + max.grammar + "</div></div>" +
      "</div>" +
      '<div style="text-align:center"><button class="btn" onclick="location.reload()">Test wiederholen</button></div>' +
      '<div class="review card"><h3>Deine Auswertung im Detail</h3>';
    review.forEach(function (r) {
      html += '<div class="review-item"><span class="' + (r.ok ? "ok" : "bad") + '">' + (r.ok ? "✓" : "✗") + "</span>" +
        '<span class="q">' + esc(r.q) + '</span><span class="a">dein: ' + esc(r.given) + " | richtig: " + esc(r.correct) + "</span></div>";
    });
    html += "</div>";
    app.innerHTML = html;
  }

  renderStart();
})();
