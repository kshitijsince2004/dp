export function computeVariation(curr, prev) {
  if (prev === 0) {
    if (curr === 0) return null;
    return null; // Return null when prev is 0 (or Infinity) to render nicely in Excel
  }
  return (curr - prev) / prev;
}

export function computeDetection(solved, total) {
  if (!total || total === 0) return null;
  return solved / total;
}

export function computeNotWorkedOut(total, workedOut) {
  const t = Number(total || 0);
  const w = Number(workedOut || 0);
  return Math.max(0, t - w);
}
