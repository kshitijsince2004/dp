import { toDMY } from '../../../utils/dateFormat.js';

/**
 * Period Resolver for Pharos Reporting Engine.
 * Supports DAY, DAY_PREVIOUS, FORTNIGHT (current, previous, corresponding last year),
 * WEEK_TO_DATE, and UPTO_DATE with year offsets and leap-year snapping.
 */

function formatISO(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addYearsSnappingLeap(dateObj, yearsOffset) {
  const targetYear = dateObj.getFullYear() + yearsOffset;
  const month = dateObj.getMonth();
  const day = dateObj.getDate();

  // Handle Feb 29 snapping to Feb 28 in non-leap year
  const isFeb29 = month === 1 && day === 29;
  if (isFeb29) {
    const isTargetLeap = (targetYear % 4 === 0 && targetYear % 100 !== 0) || (targetYear % 400 === 0);
    if (!isTargetLeap) {
      return new Date(targetYear, 1, 28);
    }
  }
  return new Date(targetYear, month, day);
}

function parseBaseDate(val) {
  if (!val) return new Date();
  if (val instanceof Date) return isNaN(val.getTime()) ? new Date() : new Date(val);
  const str = String(val).trim();
  if (/^\d{1,2}[\/-]\d{1,2}[\/-]\d{4}$/.test(str)) {
    const parts = str.split(/[\/-]/);
    return new Date(Date.UTC(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0])));
  }
  if (/^\d{4}[\/-]\d{1,2}[\/-]\d{1,2}$/.test(str)) {
    const parts = str.split(/[\/-]/);
    return new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
  }
  const parsed = new Date(str);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
}

export function resolvePeriod(expression = 'DURING_DAY', baseDateStr = new Date().toISOString().split('T')[0], yearOffset = 0) {
  const baseDate = parseBaseDate(baseDateStr);

  // Apply year offset first
  const refDate = yearOffset !== 0 ? addYearsSnappingLeap(baseDate, yearOffset) : baseDate;
  const expr = expression.toUpperCase().trim();

  let fromDate = new Date(refDate);
  let toDate = new Date(refDate);

  if (expr === 'DURING_DAY' || expr === 'DAY' || expr === 'DAY_CURRENT') {
    fromDate = new Date(refDate);
    toDate = new Date(refDate);
  } else if (expr === 'DAY_PREVIOUS' || expr === 'PREVIOUS_DAY') {
    refDate.setDate(refDate.getDate() - 1);
    fromDate = new Date(refDate);
    toDate = new Date(refDate);
  } else if (expr === 'FORTNIGHT' || expr === 'FORTNIGHT_CURRENT') {
    // 14 days ending on refDate
    toDate = new Date(refDate);
    fromDate = new Date(refDate);
    fromDate.setDate(fromDate.getDate() - 13);
  } else if (expr === 'FORTNIGHT_PREVIOUS') {
    // 14 days prior to FORTNIGHT_CURRENT
    toDate = new Date(refDate);
    toDate.setDate(toDate.getDate() - 14);
    fromDate = new Date(toDate);
    fromDate.setDate(fromDate.getDate() - 13);
  } else if (expr === 'FORTNIGHT_CORRESPONDING_LAST_YEAR') {
    // Same 14 days in refDate - 1 year
    const lastYearRef = addYearsSnappingLeap(refDate, -1);
    toDate = new Date(lastYearRef);
    fromDate = new Date(lastYearRef);
    fromDate.setDate(fromDate.getDate() - 13);
  } else if (expr === 'WEEK_TO_DATE' || expr === 'WEEK') {
    // 7 days ending on refDate
    toDate = new Date(refDate);
    fromDate = new Date(refDate);
    fromDate.setDate(fromDate.getDate() - 6);
  } else if (expr === 'UPTO_DATE' || expr === 'YEAR_TO_DATE') {
    toDate = new Date(refDate);
    fromDate = new Date(refDate.getFullYear(), 0, 1);
  } else if (expr.startsWith('CUSTOM')) {
    const match = expr.match(/CUSTOM\(([^,]+),([^)]+)\)/i);
    if (match) {
      fromDate = new Date(match[1].trim() + 'T00:00:00Z');
      toDate = new Date(match[2].trim() + 'T00:00:00Z');
    }
  }

  const fromStr = formatISO(fromDate);
  const toStr = formatISO(toDate);

  return {
    from: fromStr,
    to: toStr,
    fromDMY: toDMY(fromStr),
    toDMY: toDMY(toStr),
    year: refDate.getFullYear()
  };
}
