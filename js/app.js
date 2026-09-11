/**
 * Japanese Walking Timer — treadmill interval timer
 *
 * A self-contained interval timer for the "Japanese Walking" (interval
 * walking training) method. Announces speed / incline changes by voice
 * and beep, and lets the user build a fully custom program.
 *
 * Sections in this file:
 *   1. Config & state
 *   2. DOM references
 *   3. Formatting helpers
 *   4. Run-view rendering
 *   5. Audio (beeps + speech)
 *   6. Timer engine (tick / start / pause / reset / finish)
 *   7. Edit view (custom program builder)
 *   8. Event wiring
 */

(function () {
  "use strict";

  /* =========================================================
     1. Config & state
     ========================================================= */

  /** Default 30-minute Japanese Walking program. */
  const DEFAULT_PROGRAM = [
    { name: "Pemanasan", minutes: 3, speed: 4, incline: 0 },
    { name: "Jalan Santai", minutes: 3, speed: 5, incline: 0 },
    { name: "Jalan Cepat", minutes: 4, speed: 6, incline: 0 },
    { name: "Jogging", minutes: 6, speed: 8, incline: 0 },
    { name: "Jalan Cepat", minutes: 3, speed: 6, incline: 0 },
    { name: "Jogging", minutes: 6, speed: 8, incline: 0 },
    { name: "Jalan Santai", minutes: 3, speed: 5, incline: 0 },
    { name: "Pendinginan", minutes: 2, speed: 4, incline: 0 },
  ];

  /** How many seconds before a segment ends to start the countdown beep. */
  const WARN_AT_SECONDS = 5;

  /** Map a treadmill speed to an accent color used throughout the UI. */
  function colorForSpeed(speed) {
    if (speed <= 4) return "var(--c-warmup)";
    if (speed <= 5) return "var(--c-santai)";
    if (speed <= 6) return "var(--c-cepat)";
    return "var(--c-jog)";
  }

  /** Attach `seconds` (rounded, minimum 1) and a `color` to each segment. */
  function buildSegments(list) {
    return list.map((s) => ({
      ...s,
      seconds: Math.max(1, Math.round(s.minutes * 60)),
      color: colorForSpeed(s.speed),
    }));
  }

  function sumSeconds(list) {
    return list.reduce((total, s) => total + s.seconds, 0);
  }

  const state = {
    segments: buildSegments(DEFAULT_PROGRAM),
    draft: DEFAULT_PROGRAM.map((s) => ({ ...s })), // working copy while editing
    totalSeconds: 0,
    idx: 0,
    remainInSeg: 0,
    elapsed: 0,
    running: false,
    timerId: null,
    soundOn: true,
    warnedThisSeg: false,
    editing: false,
  };
  state.totalSeconds = sumSeconds(state.segments);
  state.remainInSeg = state.segments[0].seconds;

  /* =========================================================
     2. DOM references
     ========================================================= */

  const els = {
    timeline: document.getElementById("timeline"),
    phaseTag: document.getElementById("phaseTag"),
    segName: document.getElementById("segName"),
    timeLeft: document.getElementById("timeLeft"),
    speedNow: document.getElementById("speedNow"),
    inclineNow: document.getElementById("inclineNow"),
    ringFg: document.getElementById("ringFg"),
    nextUp: document.getElementById("nextUp"),
    elapsedTotal: document.getElementById("elapsedTotal"),
    remainTotal: document.getElementById("remainTotal"),
    startBtn: document.getElementById("startBtn"),
    resetBtn: document.getElementById("resetBtn"),
    soundBtn: document.getElementById("soundBtn"),
    listBody: document.getElementById("listBody"),
    doneBanner: document.getElementById("doneBanner"),
    card: document.querySelector(".dial-card"),

    viewRun: document.getElementById("viewRun"),
    viewEdit: document.getElementById("viewEdit"),
    editToggleBtn: document.getElementById("editToggleBtn"),
    editBody: document.getElementById("editBody"),
    addRowBtn: document.getElementById("addRowBtn"),
    editCount: document.getElementById("editCount"),
    editTotal: document.getElementById("editTotal"),
    editDefaultBtn: document.getElementById("editDefaultBtn"),
    editSaveBtn: document.getElementById("editSaveBtn"),
  };

  const RING_CIRCUMFERENCE = 2 * Math.PI * 104;

  /* =========================================================
     3. Formatting helpers
     ========================================================= */

  /** Format seconds as mm:ss. */
  function fmt(seconds) {
    const s = Math.max(0, Math.round(seconds));
    const m = Math.floor(s / 60)
      .toString()
      .padStart(2, "0");
    const r = Math.floor(s % 60)
      .toString()
      .padStart(2, "0");
    return `${m}:${r}`;
  }

  /* =========================================================
     4. Run-view rendering
     ========================================================= */

  function buildTimeline() {
    els.timeline.innerHTML = "";
    state.segments.forEach((s) => {
      const track = document.createElement("div");
      track.className = "tl-seg";
      track.style.setProperty("--seg-color", s.color);
      track.style.flexGrow = s.seconds;

      const fill = document.createElement("div");
      fill.className = "fill";
      track.appendChild(fill);

      els.timeline.appendChild(track);
    });
  }

  function buildList() {
    els.listBody.innerHTML = "";
    state.segments.forEach((s, i) => {
      const row = document.createElement("div");
      row.className = "list-row";
      row.id = "row-" + i;

      const inclineTxt = s.incline ? ` · incline ${s.incline}%` : "";
      row.innerHTML = `
        <span class="dot" style="--seg-color:${s.color}"></span>
        <span class="rname">${s.name}</span>
        <span class="rmeta">${s.minutes} mnt · speed ${s.speed}${inclineTxt}</span>`;

      els.listBody.appendChild(row);
    });
  }

  function updateListStates() {
    state.segments.forEach((s, i) => {
      const row = document.getElementById("row-" + i);
      if (!row) return;
      const isCurrent =
        i === state.idx && (state.running || state.elapsed > 0) && state.idx < state.segments.length;
      row.classList.toggle("current", isCurrent);
      row.classList.toggle("past", i < state.idx);
    });
  }

  /** Redraw everything that depends on the current timer state. */
  function render() {
    const seg = state.segments[state.idx];
    els.card.style.setProperty("--seg-color", seg ? seg.color : "var(--c-santai)");

    if (seg) {
      els.phaseTag.textContent = `TAHAP ${state.idx + 1}/${state.segments.length}`;
      els.segName.textContent = seg.name;
      els.speedNow.textContent = seg.speed;
      els.inclineNow.textContent = (seg.incline || 0) + "%";
      els.timeLeft.textContent = fmt(state.remainInSeg);

      const fractionRemaining = state.remainInSeg / seg.seconds;
      els.ringFg.setAttribute("stroke-dasharray", RING_CIRCUMFERENCE);
      els.ringFg.setAttribute("stroke-dashoffset", RING_CIRCUMFERENCE * fractionRemaining);

      const next = state.segments[state.idx + 1];
      els.nextUp.innerHTML = next
        ? `Berikutnya: <b>${next.name} · speed ${next.speed}${
            next.incline ? " · incline " + next.incline + "%" : ""
          }</b>`
        : "Ini tahap terakhir";
    }

    els.elapsedTotal.textContent = fmt(state.elapsed);
    els.remainTotal.textContent = fmt(state.totalSeconds - state.elapsed);

    const tracks = els.timeline.children;
    state.segments.forEach((s, i) => {
      const fillEl = tracks[i] && tracks[i].querySelector(".fill");
      if (!fillEl) return;
      if (i < state.idx) fillEl.style.width = "100%";
      else if (i === state.idx) fillEl.style.width = `${((s.seconds - state.remainInSeg) / s.seconds) * 100}%`;
      else fillEl.style.width = "0%";
    });

    updateListStates();
  }

  /* =========================================================
     5. Audio (beeps + speech)
     ========================================================= */

  let audioCtx = null;
  function getAudioContext() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
  }

  function beep(freq = 880, dur = 0.12, delay = 0, vol = 0.18) {
    if (!state.soundOn) return;
    const ctx = getAudioContext();
    const t0 = ctx.currentTime + delay;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;

    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + 0.015);
    gain.gain.linearRampToValueAtTime(0, t0 + dur);

    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  const countdownBeep = () => beep(660, 0.09, 0, 0.15);
  const segmentStartChime = () => {
    beep(520, 0.1, 0);
    beep(780, 0.14, 0.12);
  };
  const finishChime = () => {
    beep(660, 0.12, 0);
    beep(880, 0.12, 0.14);
    beep(1046, 0.2, 0.28);
  };

  function speak(text) {
    if (!state.soundOn || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "id-ID";
    utterance.rate = 1.0;
    utterance.volume = 1;
    window.speechSynthesis.speak(utterance);
  }

  /** Announce a segment change: speed always, incline only if it changed. */
  function announceSegment(seg, prevSeg) {
    segmentStartChime();
    const verb = prevSeg ? "Ubah kecepatan ke" : "Mulai kecepatan";
    let text = `${seg.name}. ${verb} ${seg.speed}`;
    if (seg.incline && seg.incline !== (prevSeg ? prevSeg.incline : 0)) {
      text += `, incline ${seg.incline} persen`;
    }
    speak(text + ".");
  }

  /* =========================================================
     6. Timer engine
     ========================================================= */

  function tick() {
    state.remainInSeg -= 1;
    state.elapsed += 1;

    if (!state.warnedThisSeg && state.remainInSeg > 0 && state.remainInSeg <= WARN_AT_SECONDS) {
      countdownBeep();
      state.warnedThisSeg = state.remainInSeg === 1;
    }

    if (state.remainInSeg <= 0) {
      const prevSeg = state.segments[state.idx];
      state.idx += 1;

      if (state.idx >= state.segments.length) {
        finish();
        return;
      }

      state.remainInSeg = state.segments[state.idx].seconds;
      state.warnedThisSeg = false;
      announceSegment(state.segments[state.idx], prevSeg);
    }

    render();
  }

  function startTicking() {
    state.timerId = setInterval(() => {
      if (state.running) tick();
    }, 1000);
  }

  function start() {
    if (state.running) return;
    getAudioContext(); // unlock audio on user gesture (autoplay policy)

    const isFreshStart =
      state.elapsed === 0 && state.idx === 0 && state.remainInSeg === state.segments[0].seconds;
    if (isFreshStart) announceSegment(state.segments[0], null);

    state.running = true;
    els.startBtn.textContent = "Jeda";
    if (!state.timerId) startTicking();
    render();
  }

  function pause() {
    state.running = false;
    els.startBtn.textContent = "Lanjut";
  }

  function reset() {
    state.running = false;
    clearInterval(state.timerId);
    state.timerId = null;

    state.idx = 0;
    state.remainInSeg = state.segments[0].seconds;
    state.elapsed = 0;
    state.warnedThisSeg = false;

    els.startBtn.textContent = "Mulai";
    els.doneBanner.classList.remove("show");
    els.phaseTag.textContent = "SIAP";
    els.segName.textContent = "Tekan Mulai";
    render();
  }

  function finish() {
    state.running = false;
    clearInterval(state.timerId);
    state.timerId = null;

    finishChime();
    speak("Selesai. Kerja bagus.");

    els.doneBanner.classList.add("show");
    els.phaseTag.textContent = "SELESAI";
    els.segName.textContent = "Latihan Selesai";
    els.startBtn.textContent = "Mulai";
    state.idx = state.segments.length; // mark every row as "past"
    render();
  }

  /* =========================================================
     7. Edit view (custom program builder)
     ========================================================= */

  function renderEditBody() {
    els.editBody.innerHTML = "";

    state.draft.forEach((s, i) => {
      const row = document.createElement("div");
      row.className = "erow";
      row.innerHTML = `
        <span class="dot eidx" style="width:9px;height:9px;border-radius:50%;background:${colorForSpeed(
          s.speed
        )}"></span>
        <input type="text" value="${s.name}" data-i="${i}" data-f="name" maxlength="24" />
        <button class="edel" data-i="${i}" type="button" title="Hapus">🗑</button>
        <div class="efields">
          <div class="efield">
            <label>MENIT</label>
            <input type="number" min="1" step="1" value="${s.minutes}" data-i="${i}" data-f="minutes" />
          </div>
          <div class="efield">
            <label>SPEED</label>
            <input type="number" min="1" step="0.5" value="${s.speed}" data-i="${i}" data-f="speed" />
          </div>
          <div class="efield">
            <label>INCLINE %</label>
            <input type="number" min="0" step="0.5" value="${s.incline || 0}" data-i="${i}" data-f="incline" />
          </div>
        </div>`;
      els.editBody.appendChild(row);
    });

    updateEditSummary();

    els.editBody.querySelectorAll("input").forEach((input) => {
      input.addEventListener("input", () => onDraftFieldChange(input));
    });
    els.editBody.querySelectorAll(".edel").forEach((btn) => {
      btn.addEventListener("click", () => onDraftRowDelete(btn));
    });
  }

  function updateEditSummary() {
    els.editCount.textContent = state.draft.length;
    const total = state.draft.reduce((sum, s) => sum + Math.round((s.minutes || 0) * 60), 0);
    els.editTotal.textContent = fmt(total);
  }

  function onDraftFieldChange(input) {
    const i = Number(input.dataset.i);
    const field = input.dataset.f;

    if (field === "name") {
      state.draft[i].name = input.value || "Tahap";
    } else {
      let value = parseFloat(input.value);
      if (isNaN(value) || value < 0) value = 0;
      state.draft[i][field] = value;

      if (field === "speed") {
        const dot = els.editBody.querySelectorAll(".erow")[i].querySelector(".eidx");
        dot.style.background = colorForSpeed(value);
      }
    }
    updateEditSummary();
  }

  function onDraftRowDelete(btn) {
    if (state.draft.length <= 1) return; // keep at least one segment
    state.draft.splice(Number(btn.dataset.i), 1);
    renderEditBody();
  }

  function openEdit() {
    state.editing = true;
    state.draft = state.segments.map((s) => ({
      name: s.name,
      minutes: s.minutes,
      speed: s.speed,
      incline: s.incline || 0,
    }));

    els.viewRun.classList.add("hide");
    els.viewEdit.classList.add("show");
    els.editToggleBtn.textContent = "Batal";
    renderEditBody();
  }

  function closeEdit() {
    state.editing = false;
    els.viewRun.classList.remove("hide");
    els.viewEdit.classList.remove("show");
    els.editToggleBtn.textContent = "Atur Program";
  }

  function saveEditAndStart() {
    const clean = state.draft
      .filter((s) => s.minutes > 0 && s.speed > 0)
      .map((s) => ({
        name: s.name || "Tahap",
        minutes: s.minutes,
        speed: s.speed,
        incline: s.incline || 0,
      }));
    if (clean.length === 0) return;

    state.segments = buildSegments(clean);
    state.totalSeconds = sumSeconds(state.segments);

    buildTimeline();
    buildList();
    reset();
    closeEdit();
  }

  /* =========================================================
     8. Event wiring
     ========================================================= */

  els.editToggleBtn.addEventListener("click", () => (state.editing ? closeEdit() : openEdit()));

  els.addRowBtn.addEventListener("click", () => {
    state.draft.push({ name: "Tahap Baru", minutes: 2, speed: 5, incline: 0 });
    renderEditBody();
  });

  els.editDefaultBtn.addEventListener("click", () => {
    state.draft = DEFAULT_PROGRAM.map((s) => ({ ...s }));
    renderEditBody();
  });

  els.editSaveBtn.addEventListener("click", saveEditAndStart);

  els.startBtn.addEventListener("click", () => (state.running ? pause() : start()));
  els.resetBtn.addEventListener("click", reset);

  els.soundBtn.addEventListener("click", () => {
    state.soundOn = !state.soundOn;
    els.soundBtn.textContent = state.soundOn ? "🔔" : "🔕";
    els.soundBtn.classList.toggle("active", state.soundOn);
  });

  /* =========================================================
     Init
     ========================================================= */

  buildTimeline();
  buildList();
  render();
})();
