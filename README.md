# Bearing ERP/POS

- `server/` — Express + MongoDB API (auth, inventory, billing, parties, reports)
- `admin-client/` — internal inventory/billing/POS app (Vite + React, JWT-protected), talks to `server`
- `catalog-client/` — static public info/landing page (Vite + React), no API calls, no backend dependency

## First-time setup

```bash
# server
cd server
cp .env.example .env   # edit MONGO_URI / JWT_SECRET as needed
npm install
npm run dev             # http://localhost:5000

# admin-client (new terminal)
cd admin-client
cp .env.example .env
npm install
npm run dev             # http://localhost:5173

# catalog-client (new terminal) — static site, no .env or backend needed
cd catalog-client
npm install
npm run dev             # http://localhost:5174
```

MongoDB must be running locally (or point `MONGO_URI` at Atlas).

Bills and payments are saved in database transactions, so two people saving at the same moment
can't double-apply money or oversell stock. Transactions need a replica set: Atlas always is one.
A plain local `mongod` isn't — the server still runs (it prints a warning and works without
transactions). To get them locally, start it as a one-node replica set once:
`mongod --replSet rs0` then, in `mongosh`, `rs.initiate()`.

## Bootstrapping the first admin user

There's no seed script yet — register the first user via API (it automatically becomes `admin`):

```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Owner\",\"email\":\"owner@example.com\",\"password\":\"changeme\"}"
```

Then log in at `http://localhost:5173/login`.

## Notes

- `catalog-client` is a plain static page (no API calls); it can be deployed anywhere as static files, independent of `server`.
- Invoices auto-decrement stock and compute GST (CGST+SGST for intra-state, IGST for inter-state) per line item.
- Credit sales add to the customer's `creditBalance` on the `Party` record. Payments received later are
  saved as receipts (`Payment`) and applied to the customer's oldest unpaid bills first (or a bill the
  cashier picks); any extra is kept as advance for their next credit bill. Each customer has a
  Statement page (Parties → Statement). Logic lives in `server/src/utils/creditLedger.js`.
- After deploying the payment log for the first time, run `npm run migrate:credit` in `server/` once
  (dry run), then `npm run migrate:credit -- --apply`, to line up existing balances with their bills.
