// All dates are shown in India time, whatever timezone the computer is set to (keep in step with
// server/src/utils/indiaTime.js). India has no daylight saving, so IST is always UTC+05:30.
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

// { year, month (1-12), day } of the given moment on an Indian calendar.
export function istParts(date = new Date()) {
  const d = new Date(new Date(date).getTime() + IST_OFFSET_MS);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

// DD/MM/YYYY everywhere, regardless of the browser's locale.
export function formatDate(date) {
  const { year, month, day } = istParts(date);
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
}

export function formatDateTime(date) {
  const time = new Date(date).toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${formatDate(date)} ${time}`;
}

// YYYY-MM-DD (India date), the format <input type="date"> values need.
export function toDateInputValue(date) {
  const { year, month, day } = istParts(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
