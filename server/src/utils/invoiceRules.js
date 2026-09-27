import { istParts } from "./indiaTime.js";

// A tax invoice is one whose lines carry GST (every line shares the same rate).
export function isTaxInvoice(invoice) {
  return invoice.items.some((item) => item.gstRate > 0);
}

// The moment a tax invoice gets locked: midnight at the start of the next month (India time).
// A tax bill can only be edited or voided in the same month it was made — a bill from 30 Sept is
// locked from 1 Oct — so a month's GST figures never change once the month is over. A correction
// after that needs a credit note instead. The invoice APIs send `gstLocked` so the admin app can grey
// out Edit/Void without repeating this rule.
export function gstLockDate(invoice) {
  const { year, month } = istParts(invoice.createdAt);
  const lockYear = month === 12 ? year + 1 : year;
  const lockMonth = month === 12 ? 1 : month + 1;
  return new Date(`${lockYear}-${String(lockMonth).padStart(2, "0")}-01T00:00:00+05:30`);
}

export function isGstLocked(invoice, now = new Date()) {
  return isTaxInvoice(invoice) && now >= gstLockDate(invoice);
}

// Snapshot of the customer's details to store on a bill (see Invoice.billedTo).
export function billedToFrom(party) {
  if (!party) return undefined;
  const { name, phone, gstin, pan, address } = party;
  return { name, phone, gstin, pan, address };
}

// The customer details to show/report for a bill: its own snapshot, or for bills made before
// snapshots existed, the (populated) customer record.
export function billedToOf(invoice) {
  if (invoice.billedTo?.name) return invoice.billedTo;
  return invoice.party?.name ? invoice.party : null;
}
