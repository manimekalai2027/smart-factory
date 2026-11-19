# SmartFactory ERP

A full-stack order-to-audit prototype for a South Indian packaged-food factory. The React/Vite client uses an Express API backed by MongoDB; JWT authentication and server-side role checks protect the business actions.

## Requirements

- Node.js 18+
- MongoDB running locally, or a MongoDB connection string

## Run locally

1. Copy `server/.env.example` to `server/.env` and set `MONGODB_URI` and a private `JWT_SECRET`.
2. Optionally copy `client/.env.example` to `client/.env` and set the API URL.
3. From the project root, install the root and workspace dependencies:

   ```sh
   npm install
   npm --prefix server install
   npm --prefix client install
   ```

4. Load the benchmark dataset (this resets the SmartFactory collections):

   ```sh
   npm run seed
   ```

5. Start the API and client:

   ```sh
   npm run dev
   ```

   The client is at `http://localhost:5173`; the API listens on `http://localhost:4000`. Set `VITE_API_URL` in `client/.env` if the API is hosted elsewhere.

## Demo logins

All demo accounts use `Factory@123`.

| Role | Email |
|---|---|
| Owner | `owner@smartfactory.local` |
| Factory Admin | `admin@smartfactory.local` |
| Salesman | `sales@smartfactory.local` |
| Production Supervisor | `production@smartfactory.local` |
| Accountant / Auditor (read-only) | `accounts@smartfactory.local` |

Roles receive separate navigation and the API independently enforces write permissions. The accountant/auditor account is read-only.

## Benchmark walkthrough

The seed creates opening stock, a 60 kg flour receipt at ₹45/kg, one actual Murukku run, a Tamil Nadu invoice and a Karnataka shortage order. Expected starting state:

- Flour: 100 + 60 − 40 = **120 kg**
- Cooking oil: 30 − 10.5 = **19.5 L** (**+5%** actual-vs-standard variance)
- Pouches: 500 − 194 = **306 pieces** (188 good packets and 6 damaged packs)
- Finished Murukku: 50 + 188 − 150 = **88 packets**
- Production yield: (188 − 200) / 200 = **−6%**
- Retailer A invoice: ₹7,500 taxable + ₹187.50 CGST + ₹187.50 SGST = **₹7,875**
- Retailer A outstanding after ₹4,000 payment: **₹3,875**
- Distributor B submitted demand: 120 packets against 88 available = **32 packet shortage**
- Production costing: ₹4,055 materials + ₹1,200 labour + ₹600 utilities = ₹5,855 total, **₹31.14 per good packet**. Flour uses the unrounded weighted-average rate of ₹43.125/kg before line costs.

## Business rules

- Stock is changed through receipts, production issues/output, dispatches and reasoned adjustments; there is no direct stock-balance overwrite. Each movement records its source reference, user and timestamp.
- Production requirements scale from the selected product BOM. Actual consumption is deducted, good output is added, and consumption/yield variances over 3% are highlighted.
- Production valuation uses **moving weighted-average cost**: `(existing quantity × existing average rate + receipt quantity × receipt unit rate) ÷ new quantity`. Production cost adds actual material cost, labour and utilities; cost per packet divides by good output. Profit per packet is selling price minus cost per packet; margin is profit divided by selling price.
- Tamil Nadu invoices split GST equally into CGST and SGST; invoices to other states use IGST. Server money arithmetic uses `decimal.js` with ROUND_HALF_UP and stores monetary values as MongoDB Decimal128. Fractional operational quantities are converted to integer base units (grams, millilitres, or discrete pieces/packets/cartons) at the service boundary; display values are converted back to the configured unit.
- A submitted order must be approved before invoice creation; an invoice must exist before dispatch. Finished stock is checked at approval and checked again at dispatch. Duplicate invoices and payments above the outstanding amount are rejected.
- Excel and CSV downloads use the filtered report data; invoice and report PDFs are generated in the browser.

## Project layout

```text
client/       React, Vite, Tailwind, reports and PDF/Excel exports
server/       Express API, MongoDB models, authentication and seed data
```
