// Number of decimal places every amount is stored and shown with (e.g. with 1: 12.35 -> 12.4,
// 12 stays 12). Change it here to change it across the server — database saves, GST, reports and
// the invoice PDF. Keep AMOUNT_DECIMALS in admin-client/src/utils/formatAmount.js in sync.
export const AMOUNT_DECIMALS = 2;

const FACTOR = 10 ** AMOUNT_DECIMALS;

// EPSILON nudges values like 1.05 (really 1.04999… in floating point) to round up as expected.
export function roundAmount(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return n;
  return Math.round((num + Number.EPSILON * Math.sign(num)) * FACTOR) / FACTOR;
}

// Mongoose schema option for money fields, so every save/update is rounded automatically.
export const money = { type: Number, set: roundAmount };
