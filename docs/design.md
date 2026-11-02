# StockFlow design notes

Why things are built the way they are. For what the app does, see the [README](../README.md).

## Stock is a ledger

There is no `quantity` column anywhere. Every change to stock is a row in `stock_moves`: a product, a quantity, a from-location and a to-location. The quantity is always positive, and the direction comes from the two locations. Moves are never updated or deleted; a mistake is fixed with another move.

On-hand stock at a location is the sum of moves into it minus the sum of moves out of it. Only *internal* locations count as stock.

I chose this over a stored quantity because:

- **The history is the data.** "Why do we have 23 lamps?" always has an answer: the moves that produced it.
- **There's nothing to get out of sync.** A stored quantity has to be updated in the same transaction as every move, everywhere, forever. With a ledger there's one source of truth.
- **Corrections leave a trace.** A stock count doesn't overwrite a number. It adds a move to or from the "Inventory Loss" location, with a required note.

The cost is that reading stock means summing history. Two indexes, `(product_id, to_location_id)` and `(product_id, from_location_id)`, keep that fast at this size. If the move table grows large, the next step is a balance table kept in step with each move, and the ledger stays the source of truth.

**Reserved** stock is the quantity on confirmed sales orders that haven't shipped yet. **Available** is on hand minus reserved, per warehouse. Neither is stored; both are computed when asked. The same goes for order totals: they're computed from the lines, never saved.

## Locations

A warehouse has one or more **internal** locations (shelves, rooms), and one of them is its default. There are also three **virtual** locations shared by the whole system: Supplier, Customer and Inventory Loss. A partial unique index makes sure exactly one of each exists. They're where goods come from and go to, so a receipt is a move Supplier → shelf, and a delivery is shelf → Customer.

Someone who never creates a location still has a working system. Each new warehouse gets a "Stock" location as its default, and every location input is optional.

Warehouses point to their default location, and locations point to their warehouse. That's a circular foreign key. It's declared with `use_alter` and created in a separate step in the migration.

A location can't move to another warehouse, because that would rewrite where past stock was. Archiving a location is refused while it still holds stock.

## Orders and transfers are separate documents

A sales order is the sales team's promise. The delivery that ships it is the warehouse team's job. Confirming an order creates a **transfer** (a receipt or a delivery) in state *ready*, and validating that transfer creates the moves. This keeps the two teams' permissions apart, and it matches how warehouses actually work.

- **Purchase:** draft → confirmed → received (or cancelled). A receipt goes to the default location unless another one is chosen.
- **Sales:** draft → confirmed → delivered (or cancelled). Confirming fails if the warehouse doesn't have enough *available* stock. A delivery takes stock from the default location first, then from the other locations. If a specific location is chosen, it has to hold everything, or nothing moves.
- **Internal transfers and stock counts** are created already done. Internal transfers stay inside one warehouse.

Reference numbers (`PO00001`, `WH/OUT/00003`) come from PostgreSQL sequences. Sequences never hand out the same number twice, even under concurrent requests. The trade-off is that a rolled-back transaction leaves a gap, which is acceptable here.

## Concurrency

The bug this design guards against: two managers confirm two orders for the last 10 chairs at the same moment. Both read "10 available", both confirm, and the warehouse has promised 20.

Confirming a sales order locks the product rows (`SELECT ... FOR UPDATE`) before checking availability. The second request waits for the first one to commit, then sees the new reservation.

**Proven by breaking:** a test fires 5 concurrent confirmations of 3 units each, against 10 in stock. With the lock removed, all 5 succeeded and promised 15 units from 10. With the lock in place, exactly 3 succeed.

The same pattern covers the other races: validating the same delivery twice, receiving into a location while someone archives it, and two opposite internal transfers. Every operation takes its locks in one fixed order: **order → transfer → locations (by id) → products (by id)**. Two requests therefore can't wait on each other in a cycle, and a test runs opposite transfers concurrently to check that.

The state check ("is this order still a draft?") happens *after* the lock is taken. Checked before the lock, it could be stale.

## Permissions

Each user has a level per module (sales, purchase, inventory): none, user or manager. Admins pass every check and manage users. A user can draft an order; a manager can confirm or cancel it. Stock counts need an inventory manager.

The backend enforces every rule through FastAPI dependencies. The frontend only hides buttons the user can't use; it never decides.

## Auth

- Passwords are hashed with Argon2, in a thread pool so hashing doesn't block the event loop.
- Login hashes against a dummy hash when the email doesn't exist. Unknown emails and wrong passwords then take the same time and return the same message.
- Tokens are JWTs with the user id, issue time and expiry (30 minutes). The user is loaded from the database on every request, so deactivating someone takes effect immediately.
- Changing or resetting a password sets `password_changed_at`, and any token issued before that is rejected.
- Login and password change are rate limited to 5 per minute. The limit is kept in memory, which is enough for a single instance. Running several instances would need Redis.

## Errors

Services raise domain errors (`InsufficientStock`, `OrderNotEditable`) and don't know about HTTP. Routers translate those errors into status codes, following one rule set:

- **404:** the thing in the URL doesn't exist.
- **400:** an id inside the request body doesn't exist or isn't allowed.
- **409:** a conflict with the current state: a duplicate, a wrong state, or not enough stock.
- **422:** the input itself is invalid.

Database constraints are the last line of defence. An `IntegrityError` is translated only when it's the expected constraint (checked by name), and anything else is re-raised so real bugs aren't hidden.

## Money and quantities

Prices are `Numeric(12, 2)` and quantities are `Numeric(12, 3)`, so fractions like 2.5 kg work. Both are `Decimal` in Python and strings in JSON, so no value ever passes through a float. Line subtotals round half-up to cents.

## Testing

- Tests run against real PostgreSQL, because locking, sequences and constraints are exactly what needs testing, and SQLite wouldn't behave the same.
- Migrations run down and up once per session, which also tests the migrations themselves.
- Every test starts from empty tables with the default data in place.
- Concurrency tests run real parallel requests with `asyncio.gather`, each on its own connection.

CI runs Ruff, mypy, `alembic check` (which fails if a model changed without a migration) and the test suite on every push.

## Deployment

The API is a Docker image on Render, and the database is on Neon. Migrations run when the container starts, before the server. That's safe with one instance; with several, they'd move to a separate release step. The frontend is a static site, and its only link to the API is the API's URL, set at build time.

## Not built yet

- Partial deliveries and backorders. This would need transfer lines, so a transfer can be done in parts.
- Transfers between warehouses, which would go through a transit location in two steps.
- Invoicing.
- Units of measure, lots and serial numbers.
- Reorder alerts, which would run in a background worker.