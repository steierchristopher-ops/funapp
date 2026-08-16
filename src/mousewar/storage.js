// Local persistence for Mousewar: personal best + top-10 leaderboard.
//
// Uses localStorage in the browser. A `backend` (anything with getItem/
// setItem, like localStorage) can be injected — this is how tests run
// without a DOM, and it doubles as a graceful fallback if localStorage is
// unavailable (e.g. private browsing throwing on access).

const BEST_KEY = 'mousewar:best';
const LEADERBOARD_KEY = 'mousewar:leaderboard';
export const LEADERBOARD_LIMIT = 10;
export const MAX_NAME_LENGTH = 3;

function memoryBackend() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
  };
}

// Shared fallback so accidental multiple calls without an explicit backend
// still behave consistently within a single page/process lifetime.
const fallbackMemoryBackend = memoryBackend();

function resolveBackend(backend) {
  if (backend) return backend;
  if (typeof localStorage !== 'undefined') {
    try {
      // Touch it once to make sure it's actually usable.
      localStorage.getItem(BEST_KEY);
      return localStorage;
    } catch {
      // Fall through to memory backend (e.g. blocked storage access).
    }
  }
  return fallbackMemoryBackend;
}

export function loadBest(backend) {
  const raw = resolveBackend(backend).getItem(BEST_KEY);
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

export function saveBest(score, backend) {
  resolveBackend(backend).setItem(BEST_KEY, String(score));
}

export function loadLeaderboard(backend) {
  const raw = resolveBackend(backend).getItem(LEADERBOARD_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveLeaderboard(entries, backend) {
  resolveBackend(backend).setItem(LEADERBOARD_KEY, JSON.stringify(entries));
}

/** Sanitizes free-text input into an uppercase A-Z0-9 name, max 3 chars. */
export function sanitizeName(input) {
  return (input || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, MAX_NAME_LENGTH);
}

/** Pure: does `score` earn a spot among the top LEADERBOARD_LIMIT entries? */
export function qualifiesForLeaderboard(entries, score, limit = LEADERBOARD_LIMIT) {
  if (entries.length < limit) return true;
  const lowest = [...entries].sort((a, b) => a.score - b.score)[0];
  return score > (lowest ? lowest.score : -Infinity);
}

/**
 * Pure: merges a new entry into the existing list, sorts descending by
 * score (ties broken by higher max combo), and trims to `limit`.
 * Returns { list, rank } where rank is the 0-based index of newEntry in the
 * trimmed list, or -1 if it didn't make the cut.
 */
export function computeTopTen(entries, newEntry, limit = LEADERBOARD_LIMIT) {
  const combined = newEntry ? [...entries, newEntry] : [...entries];
  combined.sort((a, b) => b.score - a.score || b.maxCombo - a.maxCombo);
  const list = combined.slice(0, limit);
  const rank = newEntry ? list.indexOf(newEntry) : -1;
  return { list, rank };
}
