// One-time setup for the payment log. Before it existed, "Record Payment" just overwrote a
// customer's creditBalance, so today's balances don't line up with their unpaid invoices. For each
// customer this compares creditBalance with the dues on their open invoices and:
//   - balance > open dues -> the extra becomes an "Opening balance" (treated as their oldest bill)
//   - balance < open dues -> the gap was paid earlier; it's saved as one receipt ("Payments recorded
//                            before the payment log") and applied to their oldest bills
// creditBalance itself is left unchanged. Customers that already have receipts or an opening
// balance are skipped, so it's safe to run more than once.
// It also saves each existing bill's customer details onto the bill (Invoice.billedTo).
//
// Usage (from server/):  node scripts/migrateCreditLedger.js          -> dry run, only prints
//                        node scripts/migrateCreditLedger.js --apply  -> writes the changes
import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../src/config/db.js";
import Party from "../src/models/Party.js";
import Invoice from "../src/models/Invoice.js";
import Payment from "../src/models/Payment.js";
import { nextSequence } from "../src/models/Counter.js";
import { getFinancialYearLabel } from "../src/utils/financialYear.js";
import { roundAmount } from "../src/utils/money.js";
import { invoiceDue, openInvoicesQuery, settleParty } from "../src/utils/creditLedger.js";
import { billedToFrom } from "../src/utils/invoiceRules.js";

const apply = process.argv.includes("--apply");

async function main() {
  await connectDB();
  console.log(apply ? "APPLYING changes\n" : "DRY RUN (pass --apply to write changes)\n");

  const customers = await Party.find({ type: "customer" }).sort({ name: 1 });
  let changed = 0;

  for (const party of customers) {
    if (party.openingBalance > 0 || (await Payment.exists({ party: party._id }))) {
      console.log(`skip   ${party.name}: already set up`);
      continue;
    }

    const openInvoices = await Invoice.find(openInvoicesQuery(party._id));
    const openDues = roundAmount(openInvoices.reduce((sum, inv) => sum + invoiceDue(inv), 0));
    const diff = roundAmount(party.creditBalance - openDues);
    if (diff === 0) continue;

    changed++;
    if (diff > 0) {
      console.log(`open   ${party.name}: opening balance Rs. ${diff} (balance ${party.creditBalance}, bills ${openDues})`);
      if (apply) await Party.updateOne({ _id: party._id }, { $set: { openingBalance: diff, openingPaid: 0 } });
    } else {
      const paid = roundAmount(-diff);
      console.log(`paid   ${party.name}: earlier payments Rs. ${paid} (balance ${party.creditBalance}, bills ${openDues})`);
      if (apply) {
        const now = new Date();
        const fyLabel = getFinancialYearLabel(now);
        const seq = await nextSequence(`receipt-${fyLabel}`);
        await Payment.create({
          receiptNo: `RCPT/${fyLabel}/${String(seq).padStart(4, "0")}`,
          party: party._id,
          amount: paid,
          mode: "other",
          note: "Payments recorded before the payment log (total)",
          receivedAt: now,
          unallocated: paid,
        });
        await settleParty(party._id);
      }
    }
  }

  console.log(`\n${changed} customer(s) ${apply ? "updated" : "would be updated"}.`);

  // Bills made before Invoice.billedTo existed get a copy of their customer's current details, so
  // from now on a change to the customer (e.g. adding a GSTIN) no longer alters them.
  const unsnapped = await Invoice.find({ party: { $ne: null }, "billedTo.name": { $exists: false } })
    .populate("party")
    .select("party");
  const toSnap = unsnapped.filter((inv) => inv.party);
  if (apply && toSnap.length) {
    await Invoice.bulkWrite(
      toSnap.map((inv) => ({
        updateOne: { filter: { _id: inv._id }, update: { $set: { billedTo: billedToFrom(inv.party) } } },
      }))
    );
  }
  console.log(`${toSnap.length} bill(s) ${apply ? "given" : "would get"} a saved copy of their customer's details.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
