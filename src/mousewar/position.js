// Pure geometry helpers for placing the target circle inside the play area.
// No DOM access here so this stays trivially unit-testable; the caller
// supplies the play area's own bounding box (already excluding the HUD,
// since the HUD lives in a separate flex row above the play area).

export const TARGET_DIAMETER = 64; // px, matches --mw-target-size in CSS
export const EDGE_MARGIN = 16; // px, safety margin from the play area edge
export const TOP_RESERVED = 140; // px, clears the combo overlay even at x10 (largest text + hits line)

/**
 * Picks a random top-left position (in px, relative to the play area) for
 * the target circle such that it always fits fully inside the given bounds.
 * Falls back to the top-left safe corner if the play area is too small to
 * satisfy the margins (e.g. a very small window).
 */
export function pickTargetPosition(bounds, options = {}) {
  const diameter = options.diameter ?? TARGET_DIAMETER;
  const margin = options.margin ?? EDGE_MARGIN;
  const topReserved = options.topReserved ?? TOP_RESERVED;

  const minX = margin;
  const maxX = Math.max(minX, bounds.width - diameter - margin);
  const minY = Math.max(margin, topReserved);
  const maxY = Math.max(minY, bounds.height - diameter - margin);

  const x = minX + Math.random() * (maxX - minX);
  const y = minY + Math.random() * (maxY - minY);
  return { x, y };
}

/**
 * Keeps an existing target position inside new bounds (e.g. after a window
 * resize) without re-randomizing it, so a resize never strands the target
 * off-screen or ends a run early.
 */
export function clampTargetPosition(pos, bounds, options = {}) {
  const diameter = options.diameter ?? TARGET_DIAMETER;
  const margin = options.margin ?? EDGE_MARGIN;
  const topReserved = options.topReserved ?? TOP_RESERVED;

  const minX = margin;
  const maxX = Math.max(minX, bounds.width - diameter - margin);
  const minY = Math.max(margin, topReserved);
  const maxY = Math.max(minY, bounds.height - diameter - margin);

  return {
    x: Math.min(Math.max(pos.x, minX), maxX),
    y: Math.min(Math.max(pos.y, minY), maxY),
  };
}
