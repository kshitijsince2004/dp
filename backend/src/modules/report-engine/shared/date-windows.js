export function parseToISO(dateStr) {
  if (!dateStr) return new Date().toISOString().slice(0, 10);
  let str = String(dateStr).trim();
  if (/^\d{1,2}[\/-]\d{1,2}[\/-]\d{4}$/.test(str)) {
    const parts = str.split(/[\/-]/);
    const day = parts[0].padStart(2, '0');
    const month = parts[1].padStart(2, '0');
    const year = parts[2];
    str = `${year}-${month}-${day}`;
  }
  if (str.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(str)) {
    str = str.slice(0, 10);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    throw new Error(`Invalid date format '${dateStr}'. Expected YYYY-MM-DD.`);
  }
  return str;
}

function toDateObj(dateStr) {
  const iso = parseToISO(dateStr);
  const d = new Date(iso + 'T00:00:00Z');
  if (isNaN(d.getTime())) return new Date();
  return d;
}

export function addDays(dateStr, n) {
  const d = toDateObj(dateStr);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function addYears(dateStr, n) {
  const d = toDateObj(dateStr);
  const y = d.getUTCFullYear() + n;
  d.setUTCFullYear(y);
  return d.toISOString().slice(0, 10);
}

export function buildDateWindows(cutoffStr) {
  const cutoff = parseToISO(cutoffStr);
  const yearNum = parseInt(cutoff.slice(0, 4), 10);
  const jan1Curr = `${yearNum}-01-01`;
  const cutoffLY = addYears(cutoff, -1);
  const jan1LY  = `${yearNum - 1}-01-01`;
  const cutoffL2Y = addYears(cutoff, -2);
  const jan1L2Y = `${yearNum - 2}-01-01`;
  const yesterday = addDays(cutoff, -1);
  const yesterdayLY = addYears(yesterday, -1);

  return {
    cutoff,
    jan1Curr,
    cutoffLY,
    jan1LY,
    cutoffL2Y,
    jan1L2Y,
    yesterday,
    yesterdayLY,
    yearNum,
  };
}
