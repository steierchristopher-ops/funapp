import { MousewarEngine, Phase, GameEvents, MAX_MULTIPLIER } from './game.js';
import { pickTargetPosition, clampTargetPosition } from './position.js';
import {
  loadBest,
  saveBest,
  loadLeaderboard,
  saveLeaderboard,
  qualifiesForLeaderboard,
  computeTopTen,
  sanitizeName,
  MAX_NAME_LENGTH,
} from './storage.js';
import { SoundEvent, playSound } from './sound.js';

// --- DOM refs ------------------------------------------------------------

// Note: deliberately excludes [data-screen="tooSmall"] — that overlay is
// controlled independently by checkViewportSize(), not by showScreen().
const screens = document.querySelectorAll('.screen[data-screen]:not([data-screen="tooSmall"])');
const screenTooSmall = document.querySelector('[data-screen="tooSmall"]');

const btnPlay = document.getElementById('btn-play');
const btnOpenLeaderboard = document.getElementById('btn-open-leaderboard');
const countdownLabel = document.getElementById('countdown-label');

const playArea = document.getElementById('play-area');
const hudScore = document.getElementById('hud-score');
const hudTime = document.getElementById('hud-time');
const hudTimeWrap = document.querySelector('.hud-time');
const hudBest = document.getElementById('hud-best');
const comboDisplay = document.getElementById('combo-display');
const comboMultiplierEl = document.getElementById('combo-multiplier');
const hitsDisplay = document.getElementById('hits-display');
const targetEl = document.getElementById('target');
const feedbackLayer = document.getElementById('feedback-layer');

const resultScore = document.getElementById('result-score');
const resultPerfect = document.getElementById('result-perfect');
const resultHits = document.getElementById('result-hits');
const resultMaxCombo = document.getElementById('result-maxcombo');
const btnPlayAgain = document.getElementById('btn-play-again');
const btnViewLeaderboard = document.getElementById('btn-view-leaderboard');

const nameEntryScore = document.getElementById('nameEntry-score');
const nameEntrySlots = document.getElementById('nameEntry-slots');
const nameEntrySlotEls = nameEntrySlots.querySelectorAll('.nameEntry-slot');
const btnSaveName = document.getElementById('btn-save-name');

const leaderboardList = document.getElementById('leaderboard-list');
const btnLeaderboardPlay = document.getElementById('btn-leaderboard-play');
const btnLeaderboardBack = document.getElementById('btn-leaderboard-back');

// --- Screen switching ------------------------------------------------------

function showScreen(name) {
  for (const screen of screens) {
    screen.hidden = screen.dataset.screen !== name;
  }
}

// --- Viewport guard (desktop-first; no crash on unusual sizes) -----------

const MIN_WIDTH = 760;
const MIN_HEIGHT = 480;

function checkViewportSize() {
  const tooSmall = window.innerWidth < MIN_WIDTH || window.innerHeight < MIN_HEIGHT;
  screenTooSmall.hidden = !tooSmall;
}
window.addEventListener('resize', checkViewportSize);
checkViewportSize();

// --- Engine + sound wiring -------------------------------------------------

let enteredName = '';
let currentRunResult = null; // snapshot used by result / name-entry / leaderboard screens

const engine = new MousewarEngine({ onEvent: handleEngineEvent });

function handleEngineEvent(type, payload) {
  switch (type) {
    case GameEvents.COUNTDOWN_STEP:
      playSound(SoundEvent.COUNTDOWN, payload);
      renderCountdown(payload.label);
      break;
    case GameEvents.GAME_START:
      playSound(SoundEvent.GAME_START, payload);
      onRunStart();
      break;
    case GameEvents.TARGET_HIT:
      playSound(SoundEvent.TARGET_HIT, payload);
      spawnFeedbackPop(`+${payload.gained}`, 'hit');
      spawnNextTarget();
      break;
    case GameEvents.COMBO_INCREASE:
      playSound(SoundEvent.COMBO_INCREASE, payload);
      pulseCombo();
      break;
    case GameEvents.COMBO_MILESTONE:
      playSound(SoundEvent.COMBO_MILESTONE, payload);
      break;
    case GameEvents.MAX_COMBO_REACHED:
      playSound(SoundEvent.MAXIMUM_COMBO, payload);
      break;
    case GameEvents.MISS_CLICK:
      if (payload.penalty > 0) spawnFeedbackPop(`-${payload.penalty}`, 'miss');
      break;
    case GameEvents.COMBO_LOST:
      playSound(SoundEvent.COMBO_LOST, payload);
      breakCombo();
      break;
    case GameEvents.PERFECT_RUN:
      playSound(SoundEvent.PERFECT_RUN, payload);
      break;
    case GameEvents.GAME_OVER:
      playSound(SoundEvent.GAME_OVER, payload);
      onRunEnd();
      break;
    default:
      break;
  }
}

// --- Rendering: countdown --------------------------------------------------

function renderCountdown(label) {
  countdownLabel.textContent = label;
  // Restart the CSS pop animation on every step.
  countdownLabel.style.animation = 'none';
  // Force reflow so removing/re-adding the animation actually replays it.
  void countdownLabel.offsetWidth;
  countdownLabel.style.animation = '';
}

// --- Rendering: HUD + target -----------------------------------------------

function getPlayAreaBounds() {
  const rect = playArea.getBoundingClientRect();
  return { width: rect.width, height: rect.height };
}

function positionTargetElement(pos) {
  targetEl.style.left = `${pos.x}px`;
  targetEl.style.top = `${pos.y}px`;
}

function spawnNextTarget() {
  const pos = pickTargetPosition(getPlayAreaBounds());
  engine.spawnTarget(pos);
  positionTargetElement(pos);
  // Restart the spawn-in animation.
  targetEl.style.animation = 'none';
  void targetEl.offsetWidth;
  targetEl.style.animation = '';
  targetEl.hidden = false;
}

function formatScore(n) {
  return Math.round(n).toLocaleString('en-US');
}

function formatTime(ms) {
  return (ms / 1000).toFixed(2);
}

function renderHud(state) {
  hudScore.textContent = formatScore(state.score);
  hudTime.textContent = formatTime(state.remainingMs);
  hudTimeWrap.classList.toggle('hud-time-low', state.remainingMs <= 5000);
  hudBest.textContent = formatScore(Math.max(loadBest(), state.score));
  hitsDisplay.textContent = `${state.hits} HITS`;

  comboMultiplierEl.textContent = `x${state.currentMultiplier}`;
  for (let level = 1; level <= MAX_MULTIPLIER; level++) {
    comboDisplay.classList.toggle(`combo-level-${level}`, state.currentMultiplier === level);
  }
}

function pulseCombo() {
  comboDisplay.classList.remove('combo-pulse');
  void comboDisplay.offsetWidth;
  comboDisplay.classList.add('combo-pulse');
}

function breakCombo() {
  comboDisplay.classList.remove('combo-broken');
  void comboDisplay.offsetWidth;
  comboDisplay.classList.add('combo-broken');
}

function spawnFeedbackPop(text, kind) {
  const el = document.createElement('div');
  el.className = 'feedback-pop';
  el.textContent = text;
  const rect = targetEl.getBoundingClientRect();
  const areaRect = playArea.getBoundingClientRect();
  el.style.left = `${rect.left - areaRect.left + rect.width / 2}px`;
  el.style.top = `${rect.top - areaRect.top}px`;
  if (kind === 'hit') {
    el.style.color = 'var(--mw-cyan)';
    el.style.textShadow = '0 0 10px rgba(0, 246, 255, 0.7)';
  }
  feedbackLayer.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

// --- Game loop ---------------------------------------------------------

let rafHandle = null;

function loop(now) {
  engine.tick(now);
  if (engine.phase === Phase.COUNTDOWN) {
    // Label rendering is event-driven (COUNTDOWN_STEP); nothing else to do.
  } else if (engine.phase === Phase.PLAYING) {
    renderHud(engine.getState(now));
  }
  if (engine.phase === Phase.COUNTDOWN || engine.phase === Phase.PLAYING) {
    rafHandle = requestAnimationFrame(loop);
  } else {
    rafHandle = null;
  }
}

function startLoopIfNeeded() {
  if (rafHandle === null) {
    rafHandle = requestAnimationFrame(loop);
  }
}

// --- Run lifecycle -------------------------------------------------------

function beginRun() {
  showScreen('countdown');
  targetEl.hidden = true;
  feedbackLayer.replaceChildren();
  engine.startCountdown(performance.now());
  startLoopIfNeeded();
}

function onRunStart() {
  showScreen('play');
  renderHud(engine.getState(performance.now()));
  spawnNextTarget();
}

function onRunEnd() {
  targetEl.hidden = true;
  const state = engine.getState(performance.now());
  const previousBest = loadBest();
  if (state.score > previousBest) {
    saveBest(state.score);
  }

  currentRunResult = {
    score: state.score,
    hits: state.hits,
    maxMultiplier: state.maxMultiplier,
    isPerfectRun: state.isPerfectRun,
  };

  const leaderboard = loadLeaderboard();
  const qualifies = qualifiesForLeaderboard(leaderboard, currentRunResult.score);

  if (qualifies) {
    playSound(SoundEvent.NEW_HIGHSCORE, currentRunResult);
    openNameEntry(currentRunResult);
  } else {
    renderResultScreen(currentRunResult, Math.max(previousBest, currentRunResult.score));
    showScreen('result');
  }
}

function renderResultScreen(run, best) {
  resultScore.textContent = formatScore(run.score);
  resultHits.textContent = String(run.hits);
  resultMaxCombo.textContent = `x${run.maxMultiplier}`;
  resultPerfect.hidden = !run.isPerfectRun;
  hudBest.textContent = formatScore(best);
}

// --- Name entry ------------------------------------------------------------

function openNameEntry(run) {
  enteredName = '';
  nameEntryScore.textContent = formatScore(run.score);
  renderNameSlots();
  showScreen('nameEntry');
  nameEntrySlots.focus();
}

function renderNameSlots() {
  nameEntrySlotEls.forEach((slot, i) => {
    slot.textContent = enteredName[i] ?? '_';
    slot.classList.toggle('is-active', i === enteredName.length);
  });
}

function handleNameEntryKeydown(e) {
  if (document.querySelector('[data-screen="nameEntry"]').hidden) return;

  if (/^[a-zA-Z0-9]$/.test(e.key) && enteredName.length < MAX_NAME_LENGTH) {
    enteredName += e.key.toUpperCase();
    renderNameSlots();
    e.preventDefault();
  } else if (e.key === 'Backspace') {
    enteredName = enteredName.slice(0, -1);
    renderNameSlots();
    e.preventDefault();
  } else if (e.key === 'Enter') {
    saveNameEntry();
    e.preventDefault();
  }
}

function saveNameEntry() {
  const name = sanitizeName(enteredName);
  if (name.length === 0 || !currentRunResult) return;

  const entry = {
    name,
    score: currentRunResult.score,
    maxCombo: currentRunResult.maxMultiplier,
    date: Date.now(),
  };
  const existing = loadLeaderboard();
  const { list, rank } = computeTopTen(existing, entry);
  saveLeaderboard(list);
  renderLeaderboard(list, rank);
  showScreen('leaderboard');
}

// --- Leaderboard -------------------------------------------------------

function renderLeaderboard(entries, highlightRank = -1) {
  leaderboardList.replaceChildren();
  if (entries.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'leaderboard-empty';
    empty.textContent = 'NO SCORES YET — BE THE FIRST';
    leaderboardList.appendChild(empty);
    return;
  }
  entries.forEach((entry, i) => {
    const row = document.createElement('li');
    row.className = 'leaderboard-row' + (i === highlightRank ? ' is-current' : '');
    row.innerHTML = `
      <span class="rank">${String(i + 1).padStart(2, '0')}</span>
      <span class="name">${entry.name}</span>
      <span class="score">${formatScore(entry.score)}</span>
    `;
    leaderboardList.appendChild(row);
  });
}

function openLeaderboard() {
  renderLeaderboard(loadLeaderboard(), -1);
  showScreen('leaderboard');
}

// --- Resize handling during play (never strand the target off-screen) -----

window.addEventListener('resize', () => {
  if (engine.phase === Phase.PLAYING && engine.targetPosition) {
    const clamped = clampTargetPosition(engine.targetPosition, getPlayAreaBounds());
    engine.spawnTarget(clamped);
    positionTargetElement(clamped);
  }
});

// --- Input: clicking the play area ------------------------------------

targetEl.addEventListener('click', (e) => {
  e.stopPropagation();
  engine.hitTarget(performance.now());
});

playArea.addEventListener('click', () => {
  // Bubbled clicks on the play area itself (not the target) are misses.
  engine.missClick(performance.now());
});

// --- Button wiring -------------------------------------------------------

btnPlay.addEventListener('click', beginRun);
btnOpenLeaderboard.addEventListener('click', openLeaderboard);
btnPlayAgain.addEventListener('click', beginRun);
btnViewLeaderboard.addEventListener('click', openLeaderboard);
btnSaveName.addEventListener('click', saveNameEntry);
btnLeaderboardPlay.addEventListener('click', beginRun);
btnLeaderboardBack.addEventListener('click', () => showScreen('start'));
nameEntrySlots.addEventListener('click', () => nameEntrySlots.focus());
document.addEventListener('keydown', handleNameEntryKeydown);

// --- Initial paint ---------------------------------------------------------

hudBest.textContent = formatScore(loadBest());
showScreen('start');
