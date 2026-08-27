import { logger } from '../../../utils/logger.js';

export class ReportGenerationError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'ReportGenerationError';
    this.code = code;
    this.details = details;
  }
}

/**
 * After a sheet's rows are computed, verify every subtotal actually equals
 * the sum of the rows it claims to summarize.
 */
export function reconcileSubtotals(sheetRows, assertions = []) {
  const failures = [];
  if (!Array.isArray(assertions) || assertions.length === 0) return failures;

  for (const rule of assertions) {
    if (rule.type !== 'SUBTOTAL') continue;

    const memberRows = (rule.member_rows || []).map((r) => Number(sheetRows[r]?.value ?? sheetRows[r] ?? 0));
    const claimedTotal = Number(sheetRows[rule.total_row]?.value ?? sheetRows[rule.total_row] ?? 0);
    const actualSum = memberRows.reduce((a, b) => a + b, 0);

    if (claimedTotal !== actualSum) {
      failures.push({
        rule: rule.rule,
        description: rule.description,
        totalRow: rule.total_row,
        expected: actualSum,
        got: claimedTotal,
        diff: claimedTotal - actualSum,
      });
    }
  }

  return failures;
}

/**
 * Runs subtotal reconciliation as a mandatory quality gate.
 * Throws ReportGenerationError if any assertion fails.
 */
export function assertSubtotalsReconciled(sheetId, sheetRows, assertions = []) {
  const failures = reconcileSubtotals(sheetRows, assertions);
  if (failures.length > 0) {
    logger.error(`[ReconciliationGate] Sheet ${sheetId} failed subtotal reconciliation`, { failures });
    throw new ReportGenerationError(
      'RECONCILIATION_FAILED',
      `Sheet ${sheetId} failed self-check: ${failures.map((f) => `${f.rule} (Expected: ${f.expected}, Got: ${f.got})`).join('; ')}`,
      { failures }
    );
  }
  return true;
}

/**
 * Resolves expression strings (e.g., "PHQ_DIARY.Upto_Date.grand_total") against full report output object.
 */
function resolveExpression(expr, fullReportOutput) {
  if (typeof expr === 'number') return expr;
  if (!expr || typeof expr !== 'string') return 0;

  // Handle simple additions / subtractions
  if (expr.includes(' + ') || expr.includes(' - ')) {
    const parts = expr.split(/\s*([+-])\s*/);
    let total = 0;
    let currentOp = '+';
    for (const part of parts) {
      if (part === '+' || part === '-') {
        currentOp = part;
      } else {
        const val = resolveExpression(part.trim(), fullReportOutput);
        total = currentOp === '+' ? total + val : total - val;
      }
    }
    return total;
  }

  const pathParts = expr.split('.');
  let curr = fullReportOutput;
  for (const p of pathParts) {
    if (curr === undefined || curr === null) return 0;
    curr = curr[p];
  }
  return Number(curr ?? 0);
}

/**
 * Run all cross-sheet invariants across a complete report set.
 */
export function checkCrossSheetInvariants(fullReportOutput, invariants = []) {
  const failures = [];
  for (const inv of invariants) {
    const leftVal = resolveExpression(inv.left, fullReportOutput);
    const rightVal = resolveExpression(inv.right, fullReportOutput);
    if (leftVal !== rightVal) {
      failures.push({
        id: inv.id,
        description: inv.description,
        leftVal,
        rightVal,
        diff: leftVal - rightVal,
      });
    }
  }
  return failures;
}
