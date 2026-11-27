# SmartFactory ERP

SmartFactory ERP is a React/Vite, Express, MongoDB and Mongoose prototype for a South Indian packaged-food manufacturer. It connects sales, GST billing, production/BOM consumption, inventory, costing, payments and audit reporting. `decimal.js` plus MongoDB Decimal128 provide exact money arithmetic; JWT and server-side role checks protect operations.

## Setup

### Local

Requirements: Node.js 18+ and MongoDB.

```sh
npm install
npm --prefix server install
npm --prefix client install
copy server\.env.example server\.env
npm run seed
npm run dev
```

The client runs at `http://localhost:5173` and the API at `http://localhost:4000`. Set `VITE_API_URL` in `client/.env` when needed.

`seed` creates users, products/BOMs, customers, supplier master data and opening stock only. With the API running on a seeded database, run the complete transaction scenario with:

```sh
npm run benchmark
```

### Docker

```sh
docker compose up --build
```

The client is at `http://localhost:5173`, the API at `http://localhost:4000`, and MongoDB data is stored in the `mongo-data` volume. Set `JWT_SECRET` in the shell or a Compose `.env` file for production.

### Production deployment

GitHub Pages hosts the React frontend only. The Express API needs a separate host and a MongoDB instance reachable from that host.

1. Create a Render Blueprint from this repository. `render.yaml` defines the API service; provide `MONGODB_URI` privately in Render using a hosted MongoDB connection string. Render generates `JWT_SECRET`.
2. Set the GitHub repository variable `VITE_API_URL` to the Render API base URL, including `/api` (for example, `https://your-api.onrender.com/api`).
3. In repository Settings > Pages, choose GitHub Actions as the build and deployment source.
4. Push to `main` to build and deploy the frontend to `https://manimekalai2027.github.io/smart-factory/`.

The deployment workflow fails if `VITE_API_URL` is not set. Keep production credentials in the hosting provider, never in the repository.

## Demo logins

All accounts use `Factory@123`.

| Role | Email |
|---|---|
| Owner | `owner@smartfactory.local` |
| Factory Admin | `admin@smartfactory.local` |
| Salesman | `sales@smartfactory.local` |
| Production Supervisor | `production@smartfactory.local` |
| Accountant / Auditor (read-only) | `accounts@smartfactory.local` |

## Features

**Must-have:** role-based login, sales orders, approval and shortage checks, GST invoices, dispatch movements, BOM production, actual-vs-planned variance, weighted-average costing, purchases, payments, stock movements, reports, CSV/Excel/PDF browser exports, credit-note reversal, audit records, seed and API benchmark runner.

**Should-have:** responsive role dashboards, customer/product summaries, GSTR-1 B2B/GSTR-3B totals, receivables ageing buckets, financial-year invoice numbers and Docker deployment.

**Stretch / not built:** multi-location stock, full accounting ledger and bank reconciliation, automated GST filing submission, background job queues, and production-grade MongoDB transactions/locking across every multi-document operation.

## Business assumptions

- Money is stored as Decimal128 and calculated with `decimal.js` ROUND_HALF_UP. Monetary lines are rounded to paise before totals are summed.
- Operational fractional quantities are converted to integer grams or millilitres; pieces, packets and cartons remain discrete units.
- Inventory uses moving weighted average: `(old quantity × old rate + receipt quantity × receipt rate) / new quantity`. The flour rate is retained as ₹43.125/kg before production costing.
- Labour and utilities are assigned to the production run and included in its cost per good packet; no separate overhead pool is allocated.
- Tamil Nadu (state code 33) splits GST equally into CGST and SGST; other states use IGST.
- Invoice numbers use `TN/YYYY-YY/NNNN`, with an atomic MongoDB counter per financial year.
- Pouch reconciliation is explicit: standard 200, 188 good + 6 damaged = 194 consumed. Damage is reason-coded and six unused standard pouches are recorded as a variance return, so closing stock is 306.
- Stock changes are represented by signed movements with a source reference; direct balance-setting endpoints are not exposed.

## Benchmark results

Run `npm run seed`, start the API, then run `npm run benchmark`.

| Expected | Actual in automated scenario | Result |
|---|---:|---|
| Flour closing 120 kg | 120 kg | Pass |
| Oil closing 19.5 L | 19.5 L | Pass |
| Pouches closing 306 | 306 | Pass |
| Finished goods 238, then 88 | 238, then 88 | Pass |
| Yield variance -6% | -6% | Pass |
| Oil variance +5% | +5% | Pass |
| Retailer A invoice ₹7,875 | ₹7,875 | Pass |
| Retailer A outstanding ₹3,875 | ₹3,875 | Pass |
| Distributor B shortage 32 packets | 32 packets | Pass |
| Materials ₹4,055; total ₹5,855 | ₹4,055; ₹5,855 | Pass |
| Cost per good packet ₹31.14 | ₹31.14 | Pass |

## Tests

```sh
npm test
npm run build
```

The server tests cover exact money, unit conversions, weighted-average costing, GST split/rounding, ledger reconciliation, variance tolerance, and benchmark arithmetic. Docker files are provided, but Docker execution must be validated on a machine with Docker installed.

## Known gaps

The prototype does not yet provide full double-entry accounting, multi-warehouse transfers, external GST filing, or database transactions spanning every stock and document write. The benchmark runner requires a running API and a MongoDB instance.

## Project layout

```text
client/       React/Vite UI, dashboards and exports
server/       Express API, Mongoose models, services, seed and benchmark
docs/         design note and data-flow documentation
```
