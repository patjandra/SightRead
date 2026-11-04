/** Small numeric helpers for calibration sampling. */

export function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export function stddev(values) {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Drop the lowest and highest `fraction` of values (each side), keeping the
 * middle. Stray frames at either end no longer pull the result.
 */
export function trimmed(values, fraction = 0.2) {
  const sorted = [...values].sort((a, b) => a - b);
  const cut = Math.floor(sorted.length * fraction);
  return cut > 0 && sorted.length - 2 * cut > 0 ? sorted.slice(cut, sorted.length - cut) : sorted;
}

/** Mean of what's left after dropping the lowest and highest `fraction` of values. */
export function trimmedMean(values, fraction = 0.2) {
  const kept = trimmed(values, fraction);
  return kept.reduce((a, b) => a + b, 0) / kept.length;
}

export const trimmedMedian = (values, fraction = 0.2) => median(trimmed(values, fraction));
