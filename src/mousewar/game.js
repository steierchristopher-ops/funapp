// Mousewar core game engine.
//
// Pure-ish state machine: no DOM access, no timers of its own. The caller
// (src/mousewar/ui.js in the browser, or a test file in tests/) drives it
// forward by calling tick(now) on every animation frame and hitTarget(now) /
// missClick(now) in response to input, always passing a monotonic timestamp
// (performance.now() in the browser). This keeps round time and the combo
// window accurate regardless of frame-rate hiccups, per the project brief.

export const ROUND_DURATION_MS = 30_000;
export const COMBO_WINDOW_MS = 1_000;
export const HIT_BASE_SCORE = 100;
export const MAX_MULTIPLIER = 10;
export const MISS_PENALTY = 100;
export const PERFECT_RUN_BONUS = 5_000;

// 3, 2, 1, GO! — durations in ms for each countdown step.
const COUNTDOWN_STEPS = [
  { label: '3', duration: 700 },
  { label: '2', duration: 700 },
  { label: '1', duration: 700 },
  { label: 'GO!', duration: 500 },
];
const COUNTDOWN_TOTAL_MS = COUNTDOWN_STEPS.reduce((sum, s) => sum + s.duration, 0);

export const Phase = Object.freeze({
  IDLE: 'idle',
  COUNTDOWN: 'countdown',
  PLAYING: 'playing',
  GAME_OVER: 'gameOver',
});

// Event names the engine emits via the onEvent callback passed to the
// constructor. These are the seams where sound effects belong later —
// see src/mousewar/sound.js for the (currently silent) hook points.
export const GameEvents = Object.freeze({
  COUNTDOWN_STEP: 'countdownStep',
  GAME_START: 'gameStart',
  TARGET_HIT: 'targetHit',
  COMBO_INCREASE: 'comboIncrease',
  COMBO_MILESTONE: 'comboMilestone',
  MAX_COMBO_REACHED: 'maximumCombo',
  MISS_CLICK: 'missClick',
  COMBO_LOST: 'comboLost',
  PERFECT_RUN: 'perfectRun',
  GAME_OVER: 'gameOver',
});

// Multiplier levels at which we consider a combo "milestone" worth extra
// fanfare (used by the UI for bigger animations and, later, sound).
const COMBO_MILESTONES = new Set([3, 5, 7, 10]);

export class MousewarEngine {
  constructor({ onEvent } = {}) {
    this.onEvent = onEvent || (() => {});
    this.reset();
  }

  reset() {
    this.phase = Phase.IDLE;
    this.countdownStart = 0;
    this.runStart = 0;
    this.score = 0;
    this.hits = 0;
    this.currentMultiplier = 1;
    this.maxMultiplier = 1;
    this.comboDeadline = null;
    this.hasMadeMistake = false;
    this.isPerfectRun = false;
    this.targetPosition = null;
  }

  emit(type, payload) {
    this.onEvent(type, payload);
  }

  // --- Countdown -----------------------------------------------------

  startCountdown(now) {
    this.reset();
    this.phase = Phase.COUNTDOWN;
    this.countdownStart = now;
    this.emit(GameEvents.COUNTDOWN_STEP, { label: COUNTDOWN_STEPS[0].label });
  }

  /** Returns the current countdown label ('3' | '2' | '1' | 'GO!' | null). */
  getCountdownLabel(now) {
    if (this.phase !== Phase.COUNTDOWN) return null;
    const elapsed = now - this.countdownStart;
    let acc = 0;
    for (const step of COUNTDOWN_STEPS) {
      acc += step.duration;
      if (elapsed < acc) return step.label;
    }
    return COUNTDOWN_STEPS[COUNTDOWN_STEPS.length - 1].label;
  }

  // --- Main loop -------------------------------------------------------

  /** Call every animation frame with a monotonic timestamp. */
  tick(now) {
    if (this.phase === Phase.COUNTDOWN) {
      this._tickCountdown(now);
      return;
    }
    if (this.phase === Phase.PLAYING) {
      this._expireComboIfNeeded(now);
      if (this.getRemainingMs(now) <= 0) {
        this._endRun();
      }
    }
  }

  _tickCountdown(now) {
    const elapsed = now - this.countdownStart;
    const stepIndex = this._countdownStepIndex(elapsed);
    if (stepIndex !== this._lastEmittedStep) {
      this._lastEmittedStep = stepIndex;
      if (stepIndex < COUNTDOWN_STEPS.length) {
        this.emit(GameEvents.COUNTDOWN_STEP, { label: COUNTDOWN_STEPS[stepIndex].label });
      }
    }
    if (elapsed >= COUNTDOWN_TOTAL_MS) {
      this._startRun(now);
    }
  }

  _countdownStepIndex(elapsed) {
    let acc = 0;
    for (let i = 0; i < COUNTDOWN_STEPS.length; i++) {
      acc += COUNTDOWN_STEPS[i].duration;
      if (elapsed < acc) return i;
    }
    return COUNTDOWN_STEPS.length;
  }

  _startRun(now) {
    this.phase = Phase.PLAYING;
    this.runStart = now;
    this.score = 0;
    this.hits = 0;
    this.currentMultiplier = 1;
    this.maxMultiplier = 1;
    this.comboDeadline = null;
    this.hasMadeMistake = false;
    this.isPerfectRun = false;
    this.emit(GameEvents.GAME_START, {});
  }

  getRemainingMs(now) {
    if (this.phase === Phase.IDLE || this.phase === Phase.COUNTDOWN) return ROUND_DURATION_MS;
    if (this.phase === Phase.GAME_OVER) return 0;
    return Math.max(0, ROUND_DURATION_MS - (now - this.runStart));
  }

  // --- Target lifecycle --------------------------------------------------

  /** UI calls this once at run start and again after every hit. */
  spawnTarget(position) {
    this.targetPosition = position;
  }

  // --- Combo window ------------------------------------------------------

  _expireComboIfNeeded(now) {
    if (this.comboDeadline !== null && now > this.comboDeadline) {
      const wasAboveOne = this.currentMultiplier > 1;
      this.currentMultiplier = 1;
      this.comboDeadline = null;
      this.hasMadeMistake = true;
      if (wasAboveOne) {
        this.emit(GameEvents.COMBO_LOST, { reason: 'timeout' });
      }
    }
  }

  // --- Input ---------------------------------------------------------

  /** Successful click on the target. */
  hitTarget(now) {
    if (this.phase !== Phase.PLAYING) return null;
    this._expireComboIfNeeded(now);

    const isComboHit = this.comboDeadline !== null && now <= this.comboDeadline;
    if (isComboHit && this.currentMultiplier < MAX_MULTIPLIER) {
      this.currentMultiplier += 1;
      this.emit(GameEvents.COMBO_INCREASE, { multiplier: this.currentMultiplier });
      if (COMBO_MILESTONES.has(this.currentMultiplier)) {
        this.emit(GameEvents.COMBO_MILESTONE, { multiplier: this.currentMultiplier });
      }
      if (this.currentMultiplier === MAX_MULTIPLIER) {
        this.emit(GameEvents.MAX_COMBO_REACHED, {});
      }
    }

    const gained = HIT_BASE_SCORE * this.currentMultiplier;
    this.score += gained;
    this.hits += 1;
    this.maxMultiplier = Math.max(this.maxMultiplier, this.currentMultiplier);
    this.comboDeadline = now + COMBO_WINDOW_MS;

    this.emit(GameEvents.TARGET_HIT, { gained, multiplier: this.currentMultiplier });
    return { gained, multiplier: this.currentMultiplier };
  }

  /** Click that missed the target. */
  missClick(now) {
    if (this.phase !== Phase.PLAYING) return null;
    this._expireComboIfNeeded(now);

    let penalty = 0;
    const hadMultiplier = this.currentMultiplier > 1;
    if (hadMultiplier) {
      this.currentMultiplier = 1;
    } else {
      penalty = Math.min(MISS_PENALTY, this.score);
      this.score -= penalty;
    }
    this.hasMadeMistake = true;
    this.comboDeadline = null;

    this.emit(GameEvents.MISS_CLICK, { penalty, hadMultiplier });
    if (hadMultiplier) {
      this.emit(GameEvents.COMBO_LOST, { reason: 'miss' });
    }
    return { penalty, hadMultiplier };
  }

  // --- End of round ----------------------------------------------------

  _endRun() {
    this.phase = Phase.GAME_OVER;
    this.isPerfectRun = !this.hasMadeMistake;
    if (this.isPerfectRun) {
      this.score += PERFECT_RUN_BONUS;
      this.emit(GameEvents.PERFECT_RUN, { bonus: PERFECT_RUN_BONUS });
    }
    this.emit(GameEvents.GAME_OVER, { score: this.score });
  }

  getState(now) {
    return {
      phase: this.phase,
      score: this.score,
      remainingMs: this.getRemainingMs(now),
      hits: this.hits,
      currentMultiplier: this.currentMultiplier,
      maxMultiplier: this.maxMultiplier,
      targetPosition: this.targetPosition,
      hasMadeMistake: this.hasMadeMistake,
      isPerfectRun: this.isPerfectRun,
      countdownLabel: this.getCountdownLabel(now),
    };
  }
}
