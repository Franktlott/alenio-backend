/**
 * The shortest side a display needs before the app will rotate with it.
 *
 * Measured against the shortest side rather than the width because that is
 * the one number a rotation cannot change, so the decision does not flip as
 * the device turns. A phone is comfortably below the line (the largest iPhone
 * is 430) and anything tablet-shaped or unfolded is comfortably above it,
 * which leaves room for hardware we have not seen.
 */
const ROTATES_ABOVE = 500;

/** Whether a display is big enough that landscape is worth having. */
export function screenRotates(width: number, height: number): boolean {
  return Math.min(width, height) >= ROTATES_ABOVE;
}
