const STORAGE_KEYS = {
  script: "sayitoutloud.script",
  speed: "sayitoutloud.speed",
  font: "sayitoutloud.font",
  padding: "sayitoutloud.padding",
};

const SPEED_MIN = 60;
const SPEED_MAX = 280;
const SPEED_STEP = 10;
const FONT_MIN = 28;
const FONT_MAX = 96;
const FONT_STEP = 4;
const PAD_MIN = 0;
const PAD_MAX = 240;
const PAD_STEP = 8;
const WINDOW_WORDS = 8;
const DEFAULT_PADDING = { top: 0, right: 24, bottom: 24, left: 24 };

const editor = document.getElementById("editor");
const prompter = document.getElementById("prompter");
const scriptInput = document.getElementById("script");
const startBtn = document.getElementById("start-btn");
const editBtn = document.getElementById("edit-btn");
const restartBtn = document.getElementById("restart-btn");
const playBtn = document.getElementById("play-btn");
const playIcon = playBtn.querySelector(".icon-play");
const pauseIcon = playBtn.querySelector(".icon-pause");
const speedDown = document.getElementById("speed-down");
const speedUp = document.getElementById("speed-up");
const fontDown = document.getElementById("font-down");
const fontUp = document.getElementById("font-up");
const speedLabel = document.getElementById("speed-label");
const fontLabel = document.getElementById("font-label");
const track = document.getElementById("track");
const viewport = document.getElementById("viewport");
const hud = document.getElementById("hud");
const padPanel = document.getElementById("pad-panel");
const padBtn = document.getElementById("pad-btn");
const camBtn = document.getElementById("cam-btn");
const camPanel = document.getElementById("cam-panel");
const isCameraPage = new URLSearchParams(window.location.search).has("cam");
const progressFill = document.getElementById("progress-fill");
const recPill = document.getElementById("rec-pill");
const timerEl = document.getElementById("timer");
const statusBar = document.getElementById("status-bar");
const padLabels = {
  top: document.getElementById("pad-top-label"),
  right: document.getElementById("pad-right-label"),
  bottom: document.getElementById("pad-bottom-label"),
  left: document.getElementById("pad-left-label"),
};

const state = {
  words: [],
  index: 0,
  playing: false,
  speed: 140,
  fontSize: 48,
  padding: { ...DEFAULT_PADDING },
  lastTick: 0,
  raf: 0,
  idleTimer: 0,
  elapsedMs: 0,
  playStartedAt: 0,
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function loadSettings() {
  const savedScript = localStorage.getItem(STORAGE_KEYS.script);
  const savedSpeed = Number(localStorage.getItem(STORAGE_KEYS.speed));
  const savedFont = Number(localStorage.getItem(STORAGE_KEYS.font));

  if (savedScript) scriptInput.value = savedScript;
  if (savedSpeed) state.speed = clamp(savedSpeed, SPEED_MIN, SPEED_MAX);
  if (savedFont) state.fontSize = clamp(savedFont, FONT_MIN, FONT_MAX);
  else state.fontSize = window.innerWidth < 720 ? 36 : 48;

  try {
    const savedPad = JSON.parse(localStorage.getItem(STORAGE_KEYS.padding) || "null");
    if (savedPad && typeof savedPad === "object") {
      for (const side of ["top", "right", "bottom", "left"]) {
        if (Number.isFinite(savedPad[side])) {
          state.padding[side] = clamp(savedPad[side], PAD_MIN, PAD_MAX);
        }
      }
    }
  } catch {
    state.padding = { ...DEFAULT_PADDING };
  }

  updateLabels();
}

function saveScript() {
  localStorage.setItem(STORAGE_KEYS.script, scriptInput.value);
}

function saveSettings() {
  localStorage.setItem(STORAGE_KEYS.speed, String(state.speed));
  localStorage.setItem(STORAGE_KEYS.font, String(state.fontSize));
  localStorage.setItem(STORAGE_KEYS.padding, JSON.stringify(state.padding));
}

function statusOffset() {
  if (!statusBar || !viewport) return 46;
  const viewportBox = viewport.getBoundingClientRect();
  const barBox = statusBar.getBoundingClientRect();
  if (!barBox.height) return 46;
  return Math.round(barBox.bottom - viewportBox.top + 6);
}

function applyPadding() {
  const { top, right, bottom, left } = state.padding;
  const base = statusOffset();
  viewport.style.setProperty("--pad-top", `${base + top}px`);
  viewport.style.setProperty("--pad-right", `${right}px`);
  viewport.style.setProperty("--pad-bottom", `${bottom}px`);
  viewport.style.setProperty("--pad-left", `${left}px`);
  viewport.style.setProperty("--focus-top", `${focusOffset()}px`);
}

function updateLabels() {
  speedLabel.textContent = `${state.speed} wpm`;
  fontLabel.textContent = `${state.fontSize} px`;
  for (const side of ["top", "right", "bottom", "left"]) {
    padLabels[side].textContent = `${state.padding[side]} px`;
  }
  track.style.setProperty("--script-size", `${state.fontSize}px`);
  document.querySelector(".focus-band").style.height = `${state.fontSize * 1.45 * 2}px`;
  applyPadding();
}

function tokenize(text) {
  return text
    .trim()
    .split(/\n+/)
    .map((paragraph) => paragraph.trim().split(/\s+/).filter(Boolean))
    .filter((words) => words.length);
}

function renderScript(text) {
  const paragraphs = tokenize(text);
  track.innerHTML = "";
  state.words = [];

  paragraphs.forEach((words) => {
    const p = document.createElement("p");
    p.className = "prompter-text";

    words.forEach((word, i) => {
      const span = document.createElement("span");
      span.className = "word is-upcoming";
      span.textContent = word;
      span.dataset.index = String(state.words.length);
      p.appendChild(span);
      if (i < words.length - 1) p.appendChild(document.createTextNode(" "));
      state.words.push(span);
    });

    track.appendChild(p);
  });

  state.words.forEach((word) => {
    word.addEventListener("click", () => {
      const next = Number(word.dataset.index);
      state.index = next;
      paintWords();
      syncScroll();
      updateProgress();
    });
  });
}

function paintWords() {
  const current = Math.floor(state.index);
  const end = current + WINDOW_WORDS;

  state.words.forEach((word, i) => {
    word.classList.remove("is-current", "is-past", "is-upcoming");
    if (i >= current && i < end) word.classList.add("is-current");
    else if (i < current) word.classList.add("is-past");
    else word.classList.add("is-upcoming");
  });
}

function focusOffset() {
  return statusOffset() + state.padding.top;
}

function currentWordEl() {
  const i = clamp(Math.floor(state.index), 0, Math.max(state.words.length - 1, 0));
  return state.words[i];
}

function syncScroll() {
  const word = currentWordEl();
  if (!word) return;

  const viewportBox = viewport.getBoundingClientRect();
  const wordBox = word.getBoundingClientRect();
  const currentY = wordBox.top - viewportBox.top;
  const next = getTranslateY() - (currentY - focusOffset());
  track.style.transform = `translateY(${next}px)`;
}

function getTranslateY() {
  const match = track.style.transform.match(/translateY\((-?[\d.]+)px\)/);
  return match ? Number(match[1]) : 0;
}

function updateProgress() {
  const total = Math.max(state.words.length - 1, 1);
  const pct = clamp(state.index / total, 0, 1);
  progressFill.style.width = `${pct * 100}%`;
}

function formatTime(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  if (hours > 0) return `${hours}:${mm}:${ss}`;
  return `${mm}:${ss}`;
}

function elapsedNow(now = performance.now()) {
  if (state.playing && state.playStartedAt) {
    return state.elapsedMs + (now - state.playStartedAt);
  }
  return state.elapsedMs;
}

function updateTimer(now) {
  timerEl.textContent = formatTime(elapsedNow(now));
}

function resetTimer() {
  state.elapsedMs = 0;
  state.playStartedAt = state.playing ? performance.now() : 0;
  updateTimer();
}

function setPlaying(playing) {
  if (playing && state.words.length && state.index >= state.words.length) {
    restart();
  }

  const wasPlaying = state.playing;
  state.playing = playing;
  playIcon.classList.toggle("hidden", playing);
  pauseIcon.classList.toggle("hidden", !playing);
  playBtn.setAttribute("aria-label", playing ? "Pause" : "Play");
  recPill.classList.toggle("is-live", playing);

  if (playing) {
    const now = performance.now();
    if (!wasPlaying) state.playStartedAt = now;
    state.lastTick = now;
    state.raf = requestAnimationFrame(tick);
    armIdle();
  } else {
    if (wasPlaying && state.playStartedAt) {
      state.elapsedMs += performance.now() - state.playStartedAt;
      state.playStartedAt = 0;
    }
    updateTimer();
    cancelAnimationFrame(state.raf);
    showControls();
  }
}

function tick(now) {
  if (!state.playing) return;

  const elapsed = now - state.lastTick;
  state.lastTick = now;

  const wordsPerMs = state.speed / 60000;
  state.index = Math.min(state.words.length, state.index + elapsed * wordsPerMs);

  paintWords();
  syncScroll();
  updateProgress();
  updateTimer(now);

  if (state.index >= state.words.length) {
    state.index = state.words.length;
    setPlaying(false);
    return;
  }

  state.raf = requestAnimationFrame(tick);
}

function startPrompter() {
  const text = scriptInput.value.trim();
  if (!text) {
    scriptInput.focus();
    scriptInput.style.borderColor = "rgba(244, 241, 234, 0.5)";
    setTimeout(() => {
      scriptInput.style.borderColor = "";
    }, 700);
    return;
  }

  saveScript();
  renderScript(text);
  state.index = 0;
  paintWords();
  updateProgress();

  editor.classList.add("hidden");
  prompter.classList.remove("hidden");
  updateLabels();
  track.style.transform = `translateY(${focusOffset()}px)`;
  setPlaying(false);
  resetTimer();
  showControls();

  requestAnimationFrame(() => {
    updateLabels();
    syncScroll();
  });
}

function closePadPanel() {
  padPanel.classList.add("hidden");
  padBtn.classList.remove("is-active");
  padBtn.setAttribute("aria-expanded", "false");
}

function closeCamPanel() {
  if (!camPanel) return;
  camPanel.classList.add("hidden");
  camBtn.classList.remove("is-active");
  camBtn.setAttribute("aria-expanded", "false");
}

function returnToEditor() {
  setPlaying(false);
  resetTimer();
  closePadPanel();
  closeCamPanel();
  prompter.classList.add("hidden");
  editor.classList.remove("hidden");
  scriptInput.focus();
  scriptInput.scrollTop = 0;
}

function restart() {
  state.index = 0;
  paintWords();
  syncScroll();
  updateProgress();
  resetTimer();
}

function changeSpeed(delta) {
  state.speed = clamp(state.speed + delta, SPEED_MIN, SPEED_MAX);
  updateLabels();
  saveSettings();
}

function changeFont(delta) {
  state.fontSize = clamp(state.fontSize + delta, FONT_MIN, FONT_MAX);
  updateLabels();
  saveSettings();
  requestAnimationFrame(() => syncScroll());
}

function changePadding(side, delta) {
  state.padding[side] = clamp(state.padding[side] + delta, PAD_MIN, PAD_MAX);
  updateLabels();
  saveSettings();
  requestAnimationFrame(() => syncScroll());
}

function togglePadPanel() {
  const open = padPanel.classList.contains("hidden");
  if (open) closeCamPanel();
  padPanel.classList.toggle("hidden", !open);
  padBtn.classList.toggle("is-active", open);
  padBtn.setAttribute("aria-expanded", String(open));
  showControls();
}

function showControls() {
  hud.classList.remove("is-idle");
  armIdle();
}

function armIdle() {
  window.clearTimeout(state.idleTimer);
  const holdOpen =
    !padPanel.classList.contains("hidden") || (camPanel && !camPanel.classList.contains("hidden"));
  if (!state.playing || holdOpen) return;
  state.idleTimer = window.setTimeout(() => {
    hud.classList.add("is-idle");
  }, 1800);
}

startBtn.addEventListener("click", startPrompter);
editBtn.addEventListener("click", returnToEditor);
restartBtn.addEventListener("click", restart);
playBtn.addEventListener("click", () => setPlaying(!state.playing));
speedDown.addEventListener("click", () => changeSpeed(-SPEED_STEP));
speedUp.addEventListener("click", () => changeSpeed(SPEED_STEP));
fontDown.addEventListener("click", () => changeFont(-FONT_STEP));
fontUp.addEventListener("click", () => changeFont(FONT_STEP));
padBtn.addEventListener("click", togglePadPanel);
document.getElementById("pad-top-down").addEventListener("click", () => changePadding("top", -PAD_STEP));
document.getElementById("pad-top-up").addEventListener("click", () => changePadding("top", PAD_STEP));
document.getElementById("pad-bottom-down").addEventListener("click", () => changePadding("bottom", -PAD_STEP));
document.getElementById("pad-bottom-up").addEventListener("click", () => changePadding("bottom", PAD_STEP));
document.getElementById("pad-left-down").addEventListener("click", () => changePadding("left", -PAD_STEP));
document.getElementById("pad-left-up").addEventListener("click", () => changePadding("left", PAD_STEP));
document.getElementById("pad-right-down").addEventListener("click", () => changePadding("right", -PAD_STEP));
document.getElementById("pad-right-up").addEventListener("click", () => changePadding("right", PAD_STEP));
scriptInput.addEventListener("input", saveScript);

prompter.addEventListener("mousemove", showControls);
prompter.addEventListener("touchstart", showControls, { passive: true });

document.addEventListener("keydown", (event) => {
  if (isCameraPage) return;
  const inEditor = !editor.classList.contains("hidden");
  const typing = event.target === scriptInput;

  if (event.code === "Space" && !typing) {
    event.preventDefault();
    if (inEditor) startPrompter();
    else setPlaying(!state.playing);
    return;
  }

  if (inEditor) return;

  if (event.key === "Escape") {
    if (!padPanel.classList.contains("hidden")) {
      closePadPanel();
      return;
    }
    if (camPanel && !camPanel.classList.contains("hidden")) {
      closeCamPanel();
      return;
    }
    returnToEditor();
    return;
  }

  if (event.key === "ArrowUp" || event.key === "=" || event.key === "+") {
    event.preventDefault();
    if (event.key === "ArrowUp") changeSpeed(SPEED_STEP);
    else changeFont(FONT_STEP);
  }

  if (event.key === "ArrowDown" || event.key === "-" || event.key === "_") {
    event.preventDefault();
    if (event.key === "ArrowDown") changeSpeed(-SPEED_STEP);
    else changeFont(-FONT_STEP);
  }

  if (event.key === "[" ) changeFont(-FONT_STEP);
  if (event.key === "]" ) changeFont(FONT_STEP);
});

window.addEventListener("resize", () => {
  if (prompter.classList.contains("hidden")) return;
  updateLabels();
  syncScroll();
});

if (!isCameraPage) {
  loadSettings();
  scriptInput.focus();
  scriptInput.setSelectionRange(0, 0);
  scriptInput.scrollTop = 0;
}
