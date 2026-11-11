# StockFlow

Inventory management for a small business with more than one warehouse. Buy from suppliers, sell to customers, move stock between shelves and count it, with the stock numbers staying correct when several people work at once.

**Live demo:** [stockflow-web-gf06.onrender.com](https://stockflow-web-gf06.onrender.com) · [API docs](https://stockflow-api-c9w7.onrender.com/docs)
Log in as `demo@example.com` / `12345678`. It's a manager in every module, but not an admin.

The demo runs on free hosting that sleeps when idle, so the first request can take up to a minute.

## What it does

- **Purchase orders:** draft → confirmed → received. Confirming creates a receipt, and the warehouse team validates it into a location.
- **Sales orders:** confirming checks the available stock and reserves it. The warehouse then validates the delivery, which takes stock from the default location first and then from the other locations.
- **Partial deliveries:** a receipt or delivery can move part of its goods. The rest goes on a backorder that keeps it reserved, and cancelling the backorder closes the order with what actually shipped.
- **Invoicing:** customer invoices and vendor bills for what actually moved, with payments and a paid / partly paid status. Posting freezes the invoice's number and amounts.
- **PDFs:** invoices, vendor bills, quotations and sales orders, RFQs and purchase orders, with Arabic names laid out right to left. Draft invoices print with a DRAFT watermark for review.
- **Company settings:** an admin sets the company name, address, phone, email, logo and currency printed on documents. The currency locks once the first invoice is issued.
- **Product categories:** nested up to five levels, with product and stock filters that can include subcategories. Moves that would create a loop are refused, even when two arrive at once.
- **Product images:** uploads are checked by decoding them, resized to 800 px, re-saved as WebP without metadata, and stored in an S3-compatible bucket (Backblaze B2 in the demo).
- **Internal transfers** between locations of the same warehouse.
- **Stock counts:** you enter what you counted, and the difference is recorded against an inventory-loss location.
- **Users:** each user has an access level (none / user / manager) in each of sales, purchase and inventory, and admins manage users.

## How stock is kept

There is no quantity column. Every change is a move of a quantity from one location to another, and moves are never edited or deleted. On-hand stock is the sum of moves into a location minus the moves out of it. *Reserved* is what open deliveries still need to ship, and *available* is on hand minus reserved.

Confirming orders, validating transfers, invoicing and recording payments lock the affected rows, so two people can't sell the same last unit or pay the same invoice twice. The reasons, and the test that shows the lock matters, are in [docs/design.md](docs/design.md).

## Stack

- **Backend:** Python 3.12, FastAPI, SQLAlchemy 2 (async), PostgreSQL, Alembic, Pydantic v2, JWT with Argon2 password hashing. Tested with pytest against a real PostgreSQL database; checked with Ruff and mypy.
- **Frontend:** React, TypeScript, Vite, TanStack Query, React Router, Tailwind with shadcn/ui. The API client is typed from the backend's OpenAPI schema. Tested with Vitest.
- **Infrastructure:** Docker, GitHub Actions, Render, Neon.

## Run it locally

You need Docker and Node.

```bash
cp backend/.env.example backend/.env    # set SECRET_KEY, ADMIN_EMAIL, ADMIN_PASSWORD
docker compose up --build               # API on http://localhost:8000/docs
```

On first start the API runs its migrations, then creates the admin user, a main warehouse and the system locations.

```bash
cd frontend
cp .env.example .env
npm install
npm run dev                             # app on http://localhost:5173
```

To fill the app with demo data, run this from `backend/` (it asks for the passwords):

```bash
uv run python -m scripts.seed_demo --admin-email admin@example.com
```

To run without Docker, or to run the tests, see [backend/README.md](backend/README.md) and [frontend/README.md](frontend/README.md).

## Layout

```
backend/    FastAPI app, migrations, tests, seed script
frontend/   React app
docs/       design notes
```

## Not built yet

Transfers between warehouses, credit notes and taxes, units of measure, lots and serial numbers, and reorder alerts.
