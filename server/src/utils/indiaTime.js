// Every calendar date in the app (bill dates, report filters, financial year, ageing) is India
// time, whatever timezone the server runs in (Render runs in UTC). India has no daylight saving,
// so IST is always UTC+05:30.
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// { year, month (1-12), day } of the given moment on an Indian calendar.
export function istParts(date = new Date()) {
  const d = new Date(new Date(date).getTime() + IST_OFFSET_MS);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

// DD/MM/YYYY in India time.
export function formatIstDate(date) {
  const { year, month, day } = istParts(date);
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
}

// Counts Indian calendar days, so the difference between two moments is "how many dates apart".
export function istDayNumber(date) {
  return Math.floor((new Date(date).getTime() + IST_OFFSET_MS) / DAY_MS);
}

// { $gte, $lte } for a from/to pair of YYYY-MM-DD dates (Indian days, start of `from` to end of
// `to`), or undefined when neither is given.
export function istDateRange(from, to) {
  if (!from && !to) return undefined;
  const range = {};
  if (from) range.$gte = new Date(`${from}T00:00:00.000+05:30`);
  if (to) range.$lte = new Date(`${to}T23:59:59.999+05:30`);
  return range;
}
