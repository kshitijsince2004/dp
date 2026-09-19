export function computeVariation(curr, prev) {
  const c = Number(curr) || 0;
  const p = Number(prev) || 0;
  if (p === 0) return c === 0 ? null : Infinity;
  return ((c - p) / p) * 100;
}

export function varPct(curr, prev) {
  const v = computeVariation(curr, prev);
  if (v === null) return '-';
  if (v === Infinity || v === +Infinity) return '+∞';
  if (v === -Infinity) return '-∞';
  if (!isFinite(v)) return '-';
  return (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
}

export function computeDetection(solved, total) {
  const s = Number(solved) || 0;
  const t = Number(total) || 0;
  if (t === 0) return null;
  return s / t;
}

export function detPct(solved, total) {
  const s = Number(solved) || 0;
  const t = Number(total) || 0;
  if (t === 0) return '-';
  return ((s / t) * 100).toFixed(1) + '%';
}

export function computeNotWorkedOut(total, workedOut) {
  const t = Number(total || 0);
  const w = Number(workedOut || 0);
  return Math.max(0, t - w);
}

