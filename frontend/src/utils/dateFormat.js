/**
 * Single source of truth for dd/mm/yyyy parsing/formatting on the frontend.
 *
 * Business date fields (fir_date, occurrence_date, dob fields, gd_date, etc.)
 * are dd/mm/yyyy end-to-end — API responses, form inputs, and display. Do not
 * use `new Date(str)` or `dayjs(str)` on these without an explicit format;
 * both misparse ambiguous slash-separated dates.
 */

const pad2 = (n) => String(n).padStart(2, '0');

/** Parse a 'DD/MM/YYYY' (or D/M/YY, D-M-Y, D.M.Y) string into a JS Date, or null. */
export const parseDMY = (str) => {
  if (!str) return null;
  if (str instanceof Date) return isNaN(str.getTime()) ? null : str;
  const m = String(str).trim().match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (!m) return null;
  let [, d, mo, y] = m;
  if (y.length === 2) y = '20' + y;
  const date = new Date(+y, +mo - 1, +d);
  if (isNaN(date.getTime()) || date.getFullYear() !== +y || date.getMonth() !== +mo - 1) return null;
  return date;
};

/** Format a JS Date (or ISO string) as 'DD/MM/YYYY'. */
export const formatDMY = (date) => {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (!d || isNaN(d.getTime())) return '';
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
};

/** Format a JS Date (or ISO string) as 'DD/MM/YYYY HH:mm'. */
export const formatDMYTime = (date) => {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (!d || isNaN(d.getTime())) return '';
  return `${formatDMY(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

/**
 * Best-effort parse of either a dd/mm/yyyy business date or an ISO
 * timestamp (created_at/updated_at-style values), for shared display helpers.
 */
export const parseAnyDate = (val) => {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  const dmy = parseDMY(val);
  if (dmy) return dmy;
  const iso = new Date(val);
  return isNaN(iso.getTime()) ? null : iso;
};
