// DD/MM/YYYY everywhere, regardless of the browser's locale.
export function formatDate(date) {
  const d = new Date(date);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export function formatDateTime(date) {
  const d = new Date(date);
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return `${formatDate(d)} ${time}`;
}

// YYYY-MM-DD, the format <input type="date"> values need.
export function toDateInputValue(date) {
  const d = new Date(date);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
