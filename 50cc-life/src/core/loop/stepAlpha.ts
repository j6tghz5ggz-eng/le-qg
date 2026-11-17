/**
 * Position entre deux pas fixes, de 0 (dernier pas) à 1 (pas suivant).
 * Module pur.
 */
export function stepAlpha(accumulatorMs: number, stepMs: number): number {
  if (!Number.isFinite(accumulatorMs) || stepMs <= 0) return 1;
  return Math.min(Math.max(accumulatorMs / stepMs, 0), 1);
}
