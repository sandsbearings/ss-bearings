import asyncHandler from "express-async-handler";
import Party from "../models/Party.js";
import Invoice from "../models/Invoice.js";
import Payment from "../models/Payment.js";
import { nextSequence } from "../models/Counter.js";
import { getFinancialYearLabel } from "../utils/financialYear.js";
import { roundAmount } from "../utils/money.js";
import { withTransaction } from "../utils/transaction.js";
import {
  allocateToInvoice,
  changePartyBalance,
  invoiceDue,
  openInvoicesQuery,
  settleParty,
  voidPaymentEffects,
} from "../utils/creditLedger.js";

const PAYMENT_MODES = ["cash", "upi", "card", "bank", "cheque", "other"];

async function findCustomer(res, partyId) {
  const party = await Party.findById(partyId);
  if (!party) {
    res.status(404);
    throw new Error("Customer not found");
  }
  if (party.type !== "customer") {
    res.status(400);
    throw new Error("Payments can only be received from customers");
  }
  return party;
}

// POST /api/parties/:id/payments
// body: { amount, mode?, reference?, note?, receivedAt? (ISO, defaults to now), invoiceId? }
// invoiceId = the bill the customer says this money is for; it's paid first, and anything left over
// goes to their oldest bills, then stays as advance.
export const receivePayment = asyncHandler(async (req, res) => {
  const party = await findCustomer(res, req.params.id);
  const { mode = "cash", reference, note, receivedAt, invoiceId } = req.body;

  const amount = roundAmount(Number(req.body.amount));
  if (!Number.isFinite(amount) || amount <= 0) {
    res.status(400);
    throw new Error("Enter a valid payment amount");
  }
  if (!PAYMENT_MODES.includes(mode)) {
    res.status(400);
    throw new Error("Invalid payment mode");
  }

  let date = new Date();
  if (receivedAt) {
    date = new Date(receivedAt);
    if (Number.isNaN(date.getTime())) {
      res.status(400);
      throw new Error("Invalid payment date");
    }
    if (date.getTime() > Date.now() + 60 * 1000) {
      res.status(400);
      throw new Error("Payment date cannot be in the future");
    }
  }

  // One transaction: if two receipts for this customer are saved at the same moment, they clash on
  // the same customer/bills and one is re-run on the fresh numbers, so money is never applied twice.
  const paymentId = await withTransaction(async () => {
    let pickedInvoice = null;
    if (invoiceId) {
      pickedInvoice = await Invoice.findOne({ _id: invoiceId, party: party._id, status: { $ne: "voided" } });
      if (!pickedInvoice) {
        res.status(400);
        throw new Error("Selected bill not found for this customer");
      }
      if (invoiceDue(pickedInvoice) <= 0) {
        res.status(400);
        throw new Error(`${pickedInvoice.invoiceNo} is already fully paid`);
      }
    }

    const fyLabel = getFinancialYearLabel(date);
    const seq = await nextSequence(`receipt-${fyLabel}`);
    const receiptNo = `RCPT/${fyLabel}/${String(seq).padStart(4, "0")}`;

    const payment = await Payment.create({
      receiptNo,
      party: party._id,
      amount,
      mode,
      reference,
      note,
      receivedAt: date,
      unallocated: amount,
      createdBy: req.user._id,
    });
    await changePartyBalance(party._id, { creditBalance: -amount });

    if (pickedInvoice) await allocateToInvoice(payment, pickedInvoice);
    await settleParty(party._id);
    return payment._id;
  });

  const saved = await Payment.findById(paymentId).populate("allocations.invoice", "invoiceNo");
  res.status(201).json(saved);
});

// POST /api/payments/:id/void  (admin only — for a receipt entered by mistake; kept for the record)
// A second void of the same receipt (e.g. from another tab) clashes, re-runs, and gets "already voided".
export const voidPayment = asyncHandler(async (req, res) => {
  await withTransaction(async () => {
    const payment = await Payment.findById(req.params.id);
    if (!payment) {
      res.status(404);
      throw new Error("Payment not found");
    }
    if (payment.status === "voided") {
      res.status(400);
      throw new Error("Payment is already voided");
    }

    await voidPaymentEffects(payment, req.user._id);
  });

  res.json(await Payment.findById(req.params.id));
});

// GET /api/parties/:id/open-bills  (for the Receive Payment dialog's "apply to" picker)
export const getOpenBills = asyncHandler(async (req, res) => {
  const party = await findCustomer(res, req.params.id);
  const invoices = await Invoice.find(openInvoicesQuery(party._id)).sort({ createdAt: 1 });
  const advance = await Payment.aggregate([
    { $match: { party: party._id, status: "active" } },
    { $group: { _id: null, total: { $sum: "$unallocated" } } },
  ]);

  res.json({
    creditBalance: party.creditBalance,
    advance: roundAmount(advance[0]?.total || 0),
    openingDue: Math.max(0, roundAmount(party.openingBalance - party.openingPaid)),
    invoices: invoices.map((inv) => ({
      _id: inv._id,
      invoiceNo: inv.invoiceNo,
      createdAt: inv.createdAt,
      grandTotal: inv.grandTotal,
      amountPaid: inv.amountPaid,
      due: invoiceDue(inv),
    })),
  });
});

// GET /api/parties/:id/statement
// The customer's full ledger: every bill (debit) and every payment (credit) in date order with a
// running balance, plus which receipts paid which bills.
export const getStatement = asyncHandler(async (req, res) => {
  const party = await findCustomer(res, req.params.id);

  const [invoices, payments] = await Promise.all([
    Invoice.find({ party: party._id, status: { $ne: "voided" } }).sort({ createdAt: 1 }),
    Payment.find({ party: party._id })
      .populate("allocations.invoice", "invoiceNo")
      .populate("createdBy", "name")
      .sort({ receivedAt: 1, createdAt: 1 }),
  ]);

  // Receipts that paid each bill, so each bill can show "paid by RCPT/..." and so we can tell what
  // was paid at the counter (amountPaid minus what receipts put on it).
  const paidByReceipts = new Map();
  for (const payment of payments) {
    if (payment.status !== "active") continue;
    for (const allocation of payment.allocations) {
      if (!allocation.invoice) continue;
      const key = allocation.invoice._id.toString();
      if (!paidByReceipts.has(key)) paidByReceipts.set(key, []);
      paidByReceipts.get(key).push({
        receiptNo: payment.receiptNo,
        receivedAt: payment.receivedAt,
        amount: allocation.amount,
      });
    }
  }

  const entries = [];

  if (party.openingBalance > 0) {
    entries.push({
      kind: "opening",
      date: null,
      description: "Opening balance",
      debit: party.openingBalance,
      credit: 0,
      due: Math.max(0, roundAmount(party.openingBalance - party.openingPaid)),
    });
  }

  for (const inv of invoices) {
    const receipts = paidByReceipts.get(inv._id.toString()) || [];
    const fromReceipts = roundAmount(receipts.reduce((sum, r) => sum + r.amount, 0));
    const paidAtSale = Math.max(0, roundAmount(inv.amountPaid - fromReceipts));

    entries.push({
      kind: "invoice",
      id: inv._id,
      date: inv.createdAt,
      description: inv.invoiceNo,
      debit: inv.grandTotal,
      credit: 0,
      paymentMode: inv.paymentMode,
      paymentStatus: inv.paymentStatus,
      due: invoiceDue(inv),
      paidAtSale,
      receipts,
    });
    if (paidAtSale > 0) {
      entries.push({
        kind: "sale-payment",
        id: inv._id,
        date: inv.createdAt,
        description: `Paid at counter for ${inv.invoiceNo}`,
        debit: 0,
        credit: paidAtSale,
        paymentMode: inv.paymentMode,
      });
    }
  }

  for (const payment of payments) {
    entries.push({
      kind: "payment",
      id: payment._id,
      date: payment.receivedAt,
      description: payment.receiptNo,
      debit: 0,
      credit: payment.amount,
      mode: payment.mode,
      reference: payment.reference,
      note: payment.note,
      status: payment.status,
      voidedAt: payment.voidedAt,
      createdBy: payment.createdBy?.name,
      allocations: payment.allocations.map((a) => ({
        invoiceNo: a.invoice ? a.invoice.invoiceNo : "Opening balance",
        amount: a.amount,
      })),
      advance: payment.unallocated,
    });
  }

  // Opening balance first, then by date; on the same instant a bill comes before its counter payment.
  const order = { opening: 0, invoice: 1, "sale-payment": 2, payment: 3 };
  entries.sort((a, b) => {
    if (!a.date || !b.date) return (a.date ? 1 : 0) - (b.date ? 1 : 0);
    return new Date(a.date) - new Date(b.date) || order[a.kind] - order[b.kind];
  });

  let balance = 0;
  let totalBilled = 0;
  let totalReceived = 0;
  for (const entry of entries) {
    if (entry.kind === "payment" && entry.status !== "active") {
      entry.balance = balance; // voided receipts are listed for the record but don't count
      continue;
    }
    balance = roundAmount(balance + entry.debit - entry.credit);
    totalBilled = roundAmount(totalBilled + entry.debit);
    totalReceived = roundAmount(totalReceived + entry.credit);
    entry.balance = balance;
  }

  res.json({
    party: {
      _id: party._id,
      name: party.name,
      phone: party.phone,
      gstin: party.gstin,
      address: party.address,
      creditBalance: party.creditBalance,
    },
    totalBilled,
    totalReceived,
    balance,
    entries,
  });
});
