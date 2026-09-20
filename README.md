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
- Credit sales add to the customer's `creditBalance` on the `Party` record.
