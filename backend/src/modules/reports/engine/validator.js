/**
 * Validator module for Pharos Reporting Engine.
 * Asserts mathematical balance invariants:
 *   1. Registered = WorkedOut + Pending
 *   2. Scope Partition Invariants: LO_NORTH + LO_SOUTH + SPECIAL_UNITS = ALL_DELHI_TOTAL
 */

export function validateBalance(registered, workedOut, pending) {
  if (registered === '-' || workedOut === '-' || pending === '-') {
    return { isBalanced: true, error: null };
  }
  const reg = Number(registered || 0);
  const wo = Number(workedOut || 0);
  const pen = Number(pending || 0);

  const isBalanced = reg === (wo + pen);
  const error = isBalanced ? null : `Balance check failed: Registered (${reg}) != WorkedOut (${wo}) + Pending (${pen})`;

  return { isBalanced, error };
}

export function validatePartitionInvariants(northTotal, southTotal, specialTotal, delhiTotal) {
  if (northTotal === '-' || southTotal === '-' || specialTotal === '-' || delhiTotal === '-') {
    return { isBalanced: true, error: null };
  }
  const n = Number(northTotal || 0);
  const s = Number(southTotal || 0);
  const sp = Number(specialTotal || 0);
  const tot = Number(delhiTotal || 0);

  const isBalanced = (n + s + sp) === tot;
  const error = isBalanced ? null : `Scope partition check failed: LO_North (${n}) + LO_South (${s}) + Special (${sp}) != Total (${tot})`;

  return { isBalanced, error };
}
