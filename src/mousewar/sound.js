// Sound hook points for Mousewar — intentionally silent in v1.
//
// The game engine (game.js) and UI (ui.js) call `playSound(event, payload)`
// at every moment a sound effect would make sense. Right now that function
// is a no-op, so nothing plays, but every call site is already wired up.
//
// To add real audio later:
//   1. Drop audio files somewhere like src/mousewar/assets/sfx/*.mp3.
//   2. Build an asset map here, e.g.:
//        const clips = {
//          [SoundEvent.TARGET_HIT]: new Audio('./assets/sfx/hit.mp3'),
//          ...
//        };
//   3. Replace the body of playSound() with something like:
//        const clip = clips[event];
//        if (clip) { clip.currentTime = 0; clip.play(); }
//   4. Optionally respect a user mute/volume preference (see the "Later"
//      note in the start screen copy in ui.js) by reading it here.
// No other file needs to change — every trigger point already calls
// playSound() with the right event name.

export const SoundEvent = Object.freeze({
  COUNTDOWN: 'countdown', // fires on every "3", "2", "1", "GO!" step
  GAME_START: 'gameStart', // fires the instant the round begins (GO!)
  TARGET_HIT: 'targetHit', // fires on every successful hit
  COMBO_INCREASE: 'comboIncrease', // fires whenever the multiplier goes up
  COMBO_MILESTONE: 'comboMilestone', // fires at notable multiplier levels (x3/x5/x7/x10)
  MAXIMUM_COMBO: 'maximumCombo', // fires the moment x10 is first reached
  COMBO_LOST: 'comboLost', // fires on miss-click or combo-window timeout
  PERFECT_RUN: 'perfectRun', // fires when a flawless run is confirmed at game over
  GAME_OVER: 'gameOver', // fires when the round ends (before result screen)
  NEW_HIGHSCORE: 'newHighscore', // fires when a run qualifies for the top 10
});

/** No-op today; see file header for how to wire real playback in later. */
export function playSound(_event, _payload) {
  // Intentionally empty for v1.
}
