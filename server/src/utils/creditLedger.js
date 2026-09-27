import Invoice from "../models/Invoice.js";
import Party from "../models/Party.js";
import Payment from "../models/Payment.js";
import { roundAmount, AMOUNT_DECIMALS } from "./money.js";

// How the customer credit ledger stays consistent:
//   Party.creditBalance = unpaid bills + unpaid opening balance - advance (unallocated receipt money)
// - Invoice create/edit/void changes creditBalance by the part not paid at the counter.
// - A receipt lowers creditBalance by its full amount; voiding it raises it back.
// - Matching receipt money to bills (settleParty, releaseInvoicePayments) only moves money between
//   "advance" and "bill paid", so it never touches creditBalance.

// Adds to a party's balances in one atomic step and rounds the result. A plain $inc would let
// floating-point leftovers pile up (590.10 + 1180.35 - 1770.45 = -0.0000000000002), which then
// shows as "Advance Rs. 0" instead of 0.
export async function changePartyBalance(partyId, { creditBalance = 0, openingPaid = 0 }) {
  const add = (field, delta) => ({
    $round: [{ $add: [{ $ifNull: [`$${field}`, 0] }, delta] }, AMOUNT_DECIMALS],
  });
  await Party.updateOne({ _id: partyId }, [
    { $set: { creditBalance: add("creditBalance", creditBalance), openingPaid: add("openingPaid", openingPaid) } },
  ]);
}

export function paymentStatusFor(amountPaid, grandTotal) {
  if (roundAmount(grandTotal - amountPaid) <= 0) return "paid";
  return amountPaid > 0 ? "partial" : "credit";
}

export function invoiceDue(invoice) {
  return Math.max(0, roundAmount(invoice.grandTotal - invoice.amountPaid));
}

export function openInvoicesQuery(partyId) {
  return {
    party: partyId,
    status: { $ne: "voided" },
    $expr: { $lt: ["$amountPaid", "$grandTotal"] },
  };
}

function addAllocation(payment, invoiceId, amount) {
  const key = invoiceId ? invoiceId.toString() : null;
  const existing = payment.allocations.find((a) => (a.invoice ? a.invoice.toString() : null) === key);
  if (existing) existing.amount = roundAmount(existing.amount + amount);
  else payment.allocations.push({ invoice: invoiceId || undefined, amount });
  payment.unallocated = roundAmount(payment.unallocated - amount);
}

function applyToInvoice(invoice, amount) {
  invoice.amountPaid = roundAmount(invoice.amountPaid + amount);
  invoice.paymentStatus = paymentStatusFor(invoice.amountPaid, invoice.grandTotal);
}

// Puts as much of a receipt's unallocated money as fits onto one specific bill (the cashier's pick).
export async function allocateToInvoice(payment, invoice) {
  const amount = roundAmount(Math.min(payment.unallocated, invoiceDue(invoice)));
  if (amount <= 0) return;
  addAllocation(payment, invoice._id, amount);
  applyToInvoice(invoice, amount);
  await invoice.save();
  await payment.save();
}

// Matches every bit of the customer's unallocated receipt money (oldest receipt first) against their
// unpaid dues (opening balance first, then bills oldest first). Safe to call any time; it's a no-op
// when there's no advance or nothing is due.
export async function settleParty(partyId) {
  if (!partyId) return;

  const payments = await Payment.find({ party: partyId, status: "active", unallocated: { $gt: 0 } }).sort({
    receivedAt: 1,
    createdAt: 1,
  });
  if (!payments.length) return;

  const party = await Party.findById(partyId);
  if (!party) return;
  const invoices = await Invoice.find(openInvoicesQuery(partyId)).sort({ createdAt: 1 });

  const targets = [];
  const openingDue = roundAmount((party.openingBalance || 0) - (party.openingPaid || 0));
  if (openingDue > 0) targets.push({ invoice: null, due: openingDue });
  for (const invoice of invoices) {
    const due = invoiceDue(invoice);
    if (due > 0) targets.push({ invoice, due });
  }
  if (!targets.length) return;

  const changedPayments = new Set();
  const changedInvoices = new Set();
  let partyChanged = false;
  let t = 0;

  for (const payment of payments) {
    while (payment.unallocated > 0 && t < targets.length) {
      const target = targets[t];
      const amount = roundAmount(Math.min(payment.unallocated, target.due));
      addAllocation(payment, target.invoice?._id, amount);
      changedPayments.add(payment);

      if (target.invoice) {
        applyToInvoice(target.invoice, amount);
        changedInvoices.add(target.invoice);
      } else {
        party.openingPaid = roundAmount((party.openingPaid || 0) + amount);
        partyChanged = true;
      }

      target.due = roundAmount(target.due - amount);
      if (target.due <= 0) t++;
    }
    if (t >= targets.length) break;
  }

  for (const invoice of changedInvoices) await invoice.save();
  for (const payment of changedPayments) await payment.save();
  if (partyChanged) await party.save();
}

// Takes every receipt allocation off an invoice and returns that money to the receipts as advance —
// used before an invoice is edited or voided. The caller then calls settleParty so the freed money
// flows back onto the (edited) bill or the customer's other open bills. Updates `invoice` in memory;
// the caller saves it.
export async function releaseInvoicePayments(invoice) {
  const payments = await Payment.find({ "allocations.invoice": invoice._id, status: "active" });
  let released = 0;

  for (const payment of payments) {
    const keep = [];
    for (const allocation of payment.allocations) {
      if (allocation.invoice && allocation.invoice.toString() === invoice._id.toString()) {
        released = roundAmount(released + allocation.amount);
        payment.unallocated = roundAmount(payment.unallocated + allocation.amount);
      } else {
        keep.push(allocation);
      }
    }
    payment.allocations = keep;
    await payment.save();
  }

  if (released > 0) {
    invoice.amountPaid = roundAmount(invoice.amountPaid - released);
    invoice.paymentStatus = paymentStatusFor(invoice.amountPaid, invoice.grandTotal);
  }
  return released;
}

// Undoes a receipt: takes its money back off every bill it paid, restores the customer's balance,
// then re-settles in case another receipt's advance can now cover the reopened bills.
export async function voidPaymentEffects(payment, userId) {
  let openingReturned = 0;

  for (const allocation of payment.allocations) {
    if (allocation.invoice) {
      const invoice = await Invoice.findById(allocation.invoice);
      if (!invoice) continue;
      invoice.amountPaid = roundAmount(invoice.amountPaid - allocation.amount);
      invoice.paymentStatus = paymentStatusFor(invoice.amountPaid, invoice.grandTotal);
      await invoice.save();
    } else {
      openingReturned = roundAmount(openingReturned + allocation.amount);
    }
  }

  payment.status = "voided";
  payment.unallocated = 0;
  payment.voidedAt = new Date();
  payment.voidedBy = userId;
  await payment.save();

  await changePartyBalance(payment.party, { creditBalance: payment.amount, openingPaid: -openingReturned });

  await settleParty(payment.party);
}
