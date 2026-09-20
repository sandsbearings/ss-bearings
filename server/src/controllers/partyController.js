import asyncHandler from "express-async-handler";
import Party from "../models/Party.js";
import { getPagination, buildPage } from "../utils/paginate.js";

// GET /api/parties?type=customer|supplier&search=&page=&limit=  (paginated, for the Parties admin list)
export const listParties = asyncHandler(async (req, res) => {
  const { type, search } = req.query;
  const query = {};
  if (type) query.type = type;
  if (search) {
    query.$or = [{ name: new RegExp(search, "i") }, { phone: new RegExp(search, "i") }];
  }

  const { page, limit, skip } = getPagination(req.query);
  const [parties, total] = await Promise.all([
    Party.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Party.countDocuments(query),
  ]);
  res.json(buildPage(parties, total, page, limit));
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

export const createParty = asyncHandler(async (req, res) => {
  const party = await Party.create(req.body);
  res.status(201).json(party);
});

export const updateParty = asyncHandler(async (req, res) => {
  const party = await Party.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!party) {
    res.status(404);
    throw new Error("Party not found");
  }
  res.json(party);
});

export const deleteParty = asyncHandler(async (req, res) => {
  const party = await Party.findByIdAndDelete(req.params.id);
  if (!party) {
    res.status(404);
    throw new Error("Party not found");
  }
  res.json({ message: "Party deleted" });
});
