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

## Tests

The tests run against a real PostgreSQL database. The database name must contain `test`, because the suite wipes it.

```bash
createdb stockflow_test
export TEST_DATABASE_URL=postgresql+asyncpg://USER:PASSWORD@localhost:5432/stockflow_test
uv run pytest
```

`TEST_DATABASE_URL` is read from the shell environment, not from `.env`. In PowerShell, use `$env:TEST_DATABASE_URL = "..."`.

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
  services/      business rules: orders, transfers, stock queries
  routers/       HTTP layer: permissions, and turning service errors into status codes
  dependencies.py
alembic/         migrations
scripts/         seed_demo.py
tests/
```

Services raise domain errors (`InsufficientStock`, `OrderNotEditable`, ...) and know nothing about HTTP. Routers translate those errors into status codes.