import asyncHandler from "express-async-handler";
import Party from "../models/Party.js";
import Payment from "../models/Payment.js";
import Invoice from "../models/Invoice.js";
import { getPagination, buildPage } from "../utils/paginate.js";
import { searchRegex } from "../utils/searchRegex.js";
import { roundAmount } from "../utils/money.js";

// GET /api/parties?type=customer|supplier&search=&gstin=with|without&priceType=wholesale&page=&limit=
// Paginated, for the Parties admin list; ?all=1 returns every match (for the CSV download).
// Each party comes with totalBusiness: everything billed to them so far (voided bills excluded).
export const listParties = asyncHandler(async (req, res) => {
  const { type, search, gstin, priceType } = req.query;
  const query = {};
  if (type) query.type = type;
  if (priceType === "wholesale") query.priceType = "wholesale";
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
// is now a customer (suppliers were only for the hidden Purchases page). The price type has its own
// admin-only endpoint (setPriceType), so it's stripped too.
function partyFields(body) {
  const { creditBalance, openingBalance, openingPaid, type, priceType, allowDuplicates, ...fields } = body;
  // GSTIN/PAN are saved without spaces so "09ABCDE 1234F1Z5" and "09ABCDE1234F1Z5" are the same.
  if (fields.gstin !== undefined) fields.gstin = cleanId(fields.gstin);
  if (fields.pan !== undefined) fields.pan = cleanId(fields.pan);
  return fields;
}

// ---- Duplicate customer check ----
// GSTIN: one business = one GSTIN, so a second customer with the same GSTIN is refused.
// PAN / mobile: can legitimately be shared (branches in other states, family/shop numbers), so a
// match only warns: the save is answered with 409 PARTY_DUPLICATE and the matching customers, and
// the app asks the user, then sends the same request again with allowDuplicates: true.
// Only values that are being added or changed are checked, so an old duplicate never blocks an
// unrelated edit (e.g. fixing the address).

function cleanId(value) {
  return String(value ?? "").replace(/\s+/g, "").toUpperCase();
}

// Last 10 digits, so "+91 98765-43210" and "9876543210" are the same number.
function phoneDigits(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

// Matches a saved phone with the same digits at the end, whatever spaces/dashes/+91 it was typed with.
function phoneQuery(digits) {
  return new RegExp(`${digits.split("").join("\\D*")}$`);
}

// Returns true when it has already answered the request (a 409 warning).
async function checkDuplicates(req, res, fields, existing) {
  const notMe = existing ? { _id: { $ne: existing._id } } : {};
  const changed = (key, norm) => fields[key] !== undefined && (!existing || norm(existing[key]) !== norm(fields[key]));

  if (fields.gstin && changed("gstin", cleanId)) {
    const other = await Party.findOne({ ...notMe, gstin: fields.gstin }).select("name");
    if (other) {
      res.status(400);
      throw new Error(`GSTIN ${fields.gstin} is already used by ${other.name}`);
    }
  }

  if (req.body.allowDuplicates === true) return false;

  const matches = new Map(); // party id -> { party, on: ["PAN", "mobile"] }
  function add(list, on) {
    for (const party of list) {
      const key = party._id.toString();
      if (!matches.has(key)) matches.set(key, { party, on: [] });
      matches.get(key).on.push(on);
    }
  }

  if (fields.pan && changed("pan", cleanId)) {
    add(await Party.find({ ...notMe, pan: fields.pan }).select("name phone pan gstin").limit(5), "PAN");
  }
  const digits = phoneDigits(fields.phone);
  if (digits.length >= 6 && changed("phone", phoneDigits)) {
    add(await Party.find({ ...notMe, phone: phoneQuery(digits) }).select("name phone pan gstin").limit(5), "mobile");
  }
  if (!matches.size) return false;

  res.status(409).json({
    code: "PARTY_DUPLICATE",
    message: "Another customer has the same PAN or mobile number",
    matches: [...matches.values()].map(({ party, on }) => ({
      _id: party._id,
      name: party.name,
      phone: party.phone,
      pan: party.pan,
      gstin: party.gstin,
      matchedOn: on,
    })),
  });
  return true;
}

// PUT /api/parties/:id/price-type   body: { priceType: "retail" | "wholesale" }  (admin only)
// Adds a customer to (or removes them from) the wholesale price list used by Billing.
export const setPriceType = asyncHandler(async (req, res) => {
  const { priceType } = req.body;
  if (priceType !== "retail" && priceType !== "wholesale") {
    res.status(400);
    throw new Error("Price type must be retail or wholesale");
  }
  const party = await Party.findOneAndUpdate(
    { _id: req.params.id, type: "customer" },
    { priceType },
    { new: true }
  );
  if (!party) {
    res.status(404);
    throw new Error("Customer not found");
  }
  res.json(party);
});

// New parties are always customers and start at a zero balance; only bills and payments change it.
export const createParty = asyncHandler(async (req, res) => {
  const fields = partyFields(req.body);
  if (await checkDuplicates(req, res, fields, null)) return;
  const party = await Party.create({ ...fields, type: "customer" });
  res.status(201).json(party);
});

export const updateParty = asyncHandler(async (req, res) => {
  const existing = await Party.findById(req.params.id);
  if (!existing) {
    res.status(404);
    throw new Error("Party not found");
  }
  const fields = partyFields(req.body);
  if (await checkDuplicates(req, res, fields, existing)) return;

  const party = await Party.findByIdAndUpdate(req.params.id, fields, {
    new: true,
    runValidators: true,
  });
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
