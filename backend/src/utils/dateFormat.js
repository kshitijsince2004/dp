/**
 * Single source of truth for date parsing/formatting across the backend.
 *
 * Standard: every date that crosses an API/UI/file boundary (Excel cells,
 * API request/response bodies, records.data JSON fields) is dd/mm/yyyy.
 * Native Postgres DATE columns (records.record_date, compilations.period,
 * warehouse fact_* date columns) stay DATE-typed internally and only need
 * ISO strings at the point they're written to/compared against the DB.
 */

const pad2 = (n) => String(n).padStart(2, '0');

/**
 * Parse a flexible date input (Excel Date object, yyyy-mm-dd, or
 * d/m/y | d-m-y | d.m.y with 2-or-4-digit year) into both representations.
 * @returns {{ iso: string, dmy: string } | null}
 */
export const parseFlexibleDate = (val) => {
  if (val === null || val === undefined || val === '') return null;

  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    const iso = val.toISOString().split('T')[0];
    const [y, mo, d] = iso.split('-');
    return { iso, dmy: `${d}/${mo}/${y}` };
  }

  let s = String(val).trim();
  if (!s) return null;

  const range = s.split(/\s+TO\s+/i);
  if (range.length > 1) s = range[0].trim();

  // Already dd/mm/yyyy (or -/. separated) — the primary expected input format.
  let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) {
    let d = m[1], mo = m[2], y = m[3];
    if (y.length === 2) y = '20' + y;
    d = pad2(d);
    mo = pad2(mo);
    if (+mo >= 1 && +mo <= 12 && +d >= 1 && +d <= 31) {
      return { iso: `${y}-${mo}-${d}`, dmy: `${d}/${mo}/${y}` };
    }
  }

  // yyyy-mm-dd (ISO) — still accepted on input (e.g. legacy data, native DATE
  // column round-trips), but never produced as output going forward.
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const [, y, mo, d] = m;
    return { iso: `${y}-${mo}-${d}`, dmy: `${d}/${mo}/${y}` };
  }

  const dt = new Date(s);
  if (!isNaN(dt.getTime())) {
    const iso = dt.toISOString().split('T')[0];
    const [y, mo, d] = iso.split('-');
    return { iso, dmy: `${d}/${mo}/${y}` };
  }

  return null;
};

/** Parse any supported input, return yyyy-mm-dd (for native DATE columns). */
export const toISO = (val) => parseFlexibleDate(val)?.iso ?? null;

/** Parse any supported input, return dd/mm/yyyy (for JSON storage/API/display). */
export const toDMY = (val) => parseFlexibleDate(val)?.dmy ?? null;
