# StockFlow backend

FastAPI API for StockFlow. Run every command from `backend/`.

## Setup

You need [uv](https://docs.astral.sh/uv/) and PostgreSQL.

```bash
uv sync
cp .env.example .env    # set DATABASE_URL, SECRET_KEY, ADMIN_EMAIL, ADMIN_PASSWORD
uv run alembic upgrade head
uv run fastapi dev app/main.py
```

The API docs are at http://localhost:8000/docs. On startup the app creates the admin user from `.env`, along with a main warehouse and the system locations (Supplier, Customer, Inventory Loss), if they don't exist yet.

## Configuration

Every setting is listed in `.env.example`. Locally only the four in the setup step are needed. In production, set these too:

| Variable | What it does |
|---|---|
| `CORS_ORIGINS` | the frontend's URL, as a JSON list: `["https://your-frontend.onrender.com"]` |
| `CLIENT_IP_HEADER` | the header holding the real client IP behind the proxy. On Render it's `cf-connecting-ip`. Leave it unset locally |
| `ACCESS_TOKEN_EXP_MINUTES` | how long a login lasts. The default is 480 (8 hours) |
| `STORAGE_ENDPOINT`, `STORAGE_REGION`, `STORAGE_BUCKET`, `STORAGE_KEY_ID`, `STORAGE_SECRET_KEY`, `STORAGE_PUBLIC_URL` | the S3-compatible bucket for product images. Without them, image uploads return 503 and everything else works |

`SECRET_KEY` must be at least 32 characters, and the app refuses to start with a shorter one. Generate one with `python -c "import secrets; print(secrets.token_hex(32))"`.

## Demo data

`scripts/seed_demo.py` fills an **empty** instance through its public API, so every business rule applies just as it does for a real user. It refuses to run if any products exist.

```bash
uv run python -m scripts.seed_demo --admin-email admin@example.com
uv run python -m scripts.seed_demo --api-url https://your-api.onrender.com --admin-email ...
```

It asks for the admin password and a password for the demo user. You can also set them in `SEED_ADMIN_PASSWORD` and `SEED_DEMO_PASSWORD`. It creates two warehouses, products, partners, orders in every state, a partial receipt and a partial delivery with their backorders, invoices and bills in every payment state, and a demo user who is a manager in every module but not an admin.

## Tests

The tests run against a real PostgreSQL database. The database name must contain `test`, because the suite wipes it.

```bash
createdb stockflow_test
export TEST_DATABASE_URL=postgresql+asyncpg://USER:PASSWORD@localhost:5432/stockflow_test
uv run pytest
```

`TEST_DATABASE_URL` is read from the shell environment, not from `.env`. In PowerShell, use `$env:TEST_DATABASE_URL = "..."`.

The PDFs are drawn by WeasyPrint, which needs the Pango system library. The Docker image and CI install it. Without it the rest of the app works, only the `/pdf` endpoints fail, and their tests are skipped. On Windows, skip it or follow [WeasyPrint's install guide](https://doc.courtbouillon.org/weasyprint/stable/first_steps.html).

## Checks

CI runs the same checks on every push:

```bash
uv run ruff check
uv run ruff format --check
uv run mypy app
uv run alembic check     # fails if a model changed without a migration
uv run pytest
```

## Layout

```
app/
  core/          settings, database, security, rate limiter
  models/        SQLAlchemy models
  schemas/       Pydantic request and response models
  services/      business rules: orders, transfers and backorders, invoices, stock queries
  routers/       HTTP layer: permissions, and turning service errors into status codes
  templates/     HTML template for the PDFs
  assets/        fonts and logo the PDFs use
  dependencies.py
alembic/         migrations
scripts/         seed_demo.py
tests/
```

Services raise domain errors (`InsufficientStock`, `OrderNotEditable`, ...) and know nothing about HTTP. Routers translate those errors into status codes.
