// Number of decimal places every amount is shown with in the admin app. Change it here to change
// it across the app. Keep AMOUNT_DECIMALS in server/src/utils/money.js in sync.
export const AMOUNT_DECIMALS = 2;

const FACTOR = 10 ** AMOUNT_DECIMALS;

// Mirrors roundAmount in server/src/utils/money.js.
export function roundAmount(n) {
  const num = Number(n) || 0;
  return Math.round((num + Number.EPSILON * Math.sign(num)) * FACTOR) / FACTOR;
}

// With 1 decimal: 12 -> "12", 12.5 -> "12.5", 12.35 -> "12.4"
export function formatAmount(n) {
  return String(roundAmount(n));
}

// With the rupee sign and Indian digit grouping: 125000 -> "₹1,25,000"
export function formatRupees(n) {
  return `₹${roundAmount(n).toLocaleString("en-IN", { maximumFractionDigits: AMOUNT_DECIMALS })}`;
}
