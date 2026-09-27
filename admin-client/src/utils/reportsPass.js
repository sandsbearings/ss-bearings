// The "reports pass" the server gives after a correct Reports PIN. Kept in memory only (never in
// localStorage), so a refresh or closing the tab always asks for the PIN again. api/client.js sends
// it on /reports requests.
//
// Grace period: leaving Reports (another page, or another browser tab) starts a 5-minute clock.
// Coming back within it reopens Reports without the PIN; after it, the PIN is asked again.
const GRACE_MS = 5 * 60 * 1000;

let pass = null;
let leftAt = null; // when the user last left Reports; null while they're on it
let onLocked = null;

export function getReportsPass() {
  return pass;
}

export function setReportsPass(value) {
  pass = value;
  leftAt = null;
}

export function clearReportsPass() {
  pass = null;
  leftAt = null;
}

// Called when the user leaves Reports (page change or browser tab hidden).
export function markReportsLeft() {
  if (pass && leftAt === null) leftAt = Date.now();
}

// Called when the user comes back: true (and the clock stops) if they're within the grace period;
// otherwise the pass is thrown away and the PIN is needed.
export function resumeReports() {
  if (!pass) return false;
  if (leftAt !== null && Date.now() - leftAt > GRACE_MS) {
    clearReportsPass();
    return false;
  }
  leftAt = null;
  return true;
}

// The Reports page registers this to show the PIN screen again when the server says the pass is
// no longer valid (expired, or the PIN was changed).
export function setOnReportsLocked(callback) {
  onLocked = callback;
}

export function reportsLocked() {
  pass = null;
  leftAt = null;
  onLocked?.();
}
