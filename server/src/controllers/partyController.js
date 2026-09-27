import asyncHandler from "express-async-handler";
import Party from "../models/Party.js";
import Payment from "../models/Payment.js";
import Invoice from "../models/Invoice.js";
import { getPagination, buildPage } from "../utils/paginate.js";
import { searchRegex } from "../utils/searchRegex.js";
import { roundAmount } from "../utils/money.js";

// GET /api/parties?type=customer|supplier&search=&gstin=with|without&page=&limit=
// Paginated, for the Parties admin list; ?all=1 returns every match (for the CSV download).
// Each party comes with totalBusiness: everything billed to them so far (voided bills excluded).
export const listParties = asyncHandler(async (req, res) => {
  const { type, search, gstin } = req.query;
  const query = {};
  if (type) query.type = type;
  if (search) {
    query.$or = [{ name: searchRegex(search) }, { phone: searchRegex(search) }];
  }
  if (gstin === "with") query.gstin = { $nin: [null, ""] };
  else if (gstin === "without") query.gstin = { $in: [null, ""] };

  const all = req.query.all === "1";
  const { page, limit, skip } = all ? { page: 1, limit: 0, skip: 0 } : getPagination(req.query);
  const [parties, total] = await Promise.all([
    Party.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Party.countDocuments(query),
  ]);

  const business = await Invoice.aggregate([
    { $match: { party: { $in: parties.map((p) => p._id) }, status: { $ne: "voided" } } },
    { $group: { _id: "$party", total: { $sum: "$grandTotal" } } },
  ]);
  const businessBy = new Map(business.map((b) => [b._id.toString(), b.total]));
  const items = parties.map((p) => ({
    ...p.toJSON(),
    totalBusiness: roundAmount(businessBy.get(p._id.toString()) || 0),
  }));

  res.json(buildPage(items, total, page, all ? Math.max(total, 1) : limit));
});

// GET /api/parties/all?type=customer|supplier  (full list, for pickers/autocompletes)
export const listAllParties = asyncHandler(async (req, res) => {
  const { type } = req.query;
  const query = {};
  if (type) query.type = type;

  const parties = await Party.find(query).sort({ name: 1 });
  res.json(parties);
});

export const getParty = asyncHandler(async (req, res) => {
  const party = await Party.findById(req.params.id);
  if (!party) {
    res.status(404);
    throw new Error("Party not found");
  }
  res.json(party);
});

// Balances are only ever changed by invoices and payments (see utils/creditLedger.js), never by
// editing the party, so they're stripped from create/update bodies. So is the type: every party
// is now a customer (suppliers were only for the hidden Purchases page).
function partyFields(body) {
  const { creditBalance, openingBalance, openingPaid, type, ...fields } = body;
  return fields;
}

// New parties are always customers and start at a zero balance; only bills and payments change it.
export const createParty = asyncHandler(async (req, res) => {
  const party = await Party.create({ ...partyFields(req.body), type: "customer" });
  res.status(201).json(party);
});

export const updateParty = asyncHandler(async (req, res) => {
  const party = await Party.findByIdAndUpdate(req.params.id, partyFields(req.body), {
    new: true,
    runValidators: true,
  });
  if (!party) {
    res.status(404);
    throw new Error("Party not found");
  }
  res.json(party);
});

// A party with any bills, receipts or balance is kept — deleting it would hide what they owe and
// leave their bills pointing at a missing customer.
export const deleteParty = asyncHandler(async (req, res) => {
  const party = await Party.findById(req.params.id);
  if (!party) {
    res.status(404);
    throw new Error("Party not found");
  }

  let reason = null;
  if (await Invoice.exists({ party: party._id })) reason = "has bills";
  else if (await Payment.exists({ party: party._id })) reason = "has payment history";
  else if (party.openingBalance > 0 || party.creditBalance !== 0) reason = "has a balance";
  if (reason) {
    res.status(400);
    throw new Error(`${party.name} ${reason} and can't be deleted`);
  }

  await party.deleteOne();
  res.json({ message: "Party deleted" });
});
