import io
from datetime import date
from decimal import Decimal
from types import SimpleNamespace

import pytest
from google.genai import errors
from pypdf import PdfWriter
from sqlalchemy import text

from app.models.user import Access
from app.services import bill_reader as reader_module  # the fixture is called bill_reader
from app.services.bill_reader import (
    Bill,
    BillLine,
    BillUnreadable,
    GeminiBillReader,
    RawBill,
    RawLine,
    ReaderUnavailable,
    to_bill,
)
from tests.helpers import auth, create_partner

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64  # only the first bytes are checked


def pdf(pages: int) -> bytes:
    writer = PdfWriter()
    for _ in range(pages):
        writer.add_blank_page(width=595, height=842)
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


def line(description, quantity="2", price="10.00", code=None) -> BillLine:
    return BillLine(description, code, Decimal(quantity), Decimal(price))


def bill(*lines: BillLine, **fields) -> Bill:
    values = {
        "supplier_name": "Zagros Furniture Works LLC",
        "bill_number": "ZF-1001",
        "bill_date": date(2026, 11, 2),
        "currency": "USD",
        "total": None,
    } | fields
    return Bill(lines=list(lines), **values)


async def product(client, headers, sku, name, active=True):
    body = {"sku": sku, "name": name, "sale_price": "50.00", "cost_price": "30.00"}
    response = await client.post("/products", json=body, headers=headers)
    assert response.status_code == 201, response.text
    created = response.json()
    if not active:
        await client.post(f"/products/{created['id']}/archive", headers=headers)
    return created


async def upload(client, headers, data=PNG, name="bill.png"):
    return await client.post(
        "/bill-imports", files={"file": (name, data, "application/octet-stream")}, headers=headers
    )


async def imported(client, headers, bill_reader, data: Bill):
    bill_reader.bill = data
    response = await upload(client, headers)
    assert response.status_code == 201, response.text
    return response.json()


def codes(result) -> set[str]:
    return {warning["code"] for warning in result["warnings"]}


# ---- reading and matching ----


async def test_lines_are_matched_by_code_then_by_a_close_name(client, boss, bill_reader):
    chair = await product(client, boss, "CHAIR-ERG", "Ergonomic Office Chair")
    desk = await product(client, boss, "DESK-STD", "Standing Desk")
    await product(client, boss, "MOUSE-WL", "Wireless Mouse")
    supplier = await create_partner(client, boss, name="Zagros Furniture Works", is_supplier=True)

    result = await imported(
        client,
        boss,
        bill_reader,
        bill(
            line("Desk standing 140cm", code="desk-std"),  # the code wins, any case
            line("Office Chair Ergonomic, black"),  # a close name
            line("Wireless Keyboard"),  # close to "Wireless Mouse", but not close enough
        ),
    )

    assert result["state"] == "open"
    assert result["partner_id"] == supplier["id"]  # "… LLC" on the bill
    assert result["partner_reference"] == "ZF-1001"
    assert result["bill_date"] == "2026-11-02"
    assert result["warehouse_id"] is not None  # the first warehouse, to start with
    by_code, by_name, unmatched = result["lines"]
    assert (by_code["product_id"], by_code["match_score"]) == (desk["id"], "1.000")
    assert by_name["product_id"] == chair["id"] and Decimal(by_name["match_score"]) > 0
    assert unmatched["product_id"] is None and unmatched["match_score"] is None
    assert codes(result) == {"missing_products"}
    assert result["warnings"][0]["message"] == "1 item has no product yet"
    assert bill_reader.mime_types == ["image/png"]


async def test_archived_products_and_unknown_suppliers_are_not_matched(client, boss, bill_reader):
    await product(client, boss, "CHAIR-ERG", "Ergonomic Office Chair", active=False)

    result = await imported(
        client, boss, bill_reader, bill(line("Ergonomic Office Chair"), supplier_name="Nobody")
    )
    assert result["partner_id"] is None
    assert result["lines"][0]["product_id"] is None
    assert codes(result) == {"no_supplier", "missing_products"}


async def test_only_pdfs_and_images_are_accepted(client, boss, bill_reader):
    bill_reader.bill = bill(line("Anything"))

    response = await upload(client, boss, b"GIF89a....", name="bill.png")  # renamed
    assert response.status_code == 422

    response = await upload(client, boss, pdf(6), name="bill.pdf")
    assert response.status_code == 422
    assert "more than 5 pages" in response.json()["detail"]

    response = await upload(client, boss, pdf(1), name="bill.pdf")
    assert response.status_code == 201
    assert bill_reader.mime_types == ["application/pdf"]  # the rejected ones never got sent

    response = await upload(client, boss, PNG + b"\x00" * (5 * 1024 * 1024))
    assert response.status_code == 413


async def test_reading_failures(client, boss, bill_reader):
    bill_reader.error = ReaderUnavailable("bill reading is busy; try again in a minute")
    response = await upload(client, boss)
    assert response.status_code == 503
    assert "busy" in response.json()["detail"]

    bill_reader.error = BillUnreadable("no items were found on the bill")
    assert (await upload(client, boss)).status_code == 422
    assert (await client.get("/bill-imports", headers=boss)).json() == []  # nothing saved


async def test_without_an_api_key_bill_import_is_unavailable(client, boss):
    assert (await upload(client, boss)).status_code == 503


async def test_imports_are_rate_limited_per_user(client, boss, bill_reader, make_user):
    bill_reader.bill = bill(line("Anything"))
    for _ in range(10):
        assert (await upload(client, boss)).status_code == 201
    assert (await upload(client, boss)).status_code == 429

    colleague = auth(await make_user(purchase_access=Access.user))
    assert (await upload(client, colleague)).status_code == 201  # same IP, own limit


def test_the_models_answer_is_checked_and_made_exact():
    raw = RawBill(
        supplier_name="  Acme  ",
        bill_number="INV-7",
        bill_date="2026-13-45",  # not a date
        currency="usd",
        total=20.1,
        lines=[RawLine(description=" Chair ", quantity=2, unit_price=10.05)],
    )
    result = to_bill(raw)
    assert result.supplier_name == "Acme"
    assert result.bill_date is None  # left for the user, not a failure
    assert result.currency == "USD"
    assert result.total == Decimal("20.10")
    assert result.lines[0].description == "Chair"
    assert result.lines[0].unit_price == Decimal("10.05")  # not 10.0500000000000007

    for bad_line in (
        RawLine(description="Chair", quantity=0, unit_price=1),
        RawLine(description="Chair", quantity=1, unit_price=-1),
        RawLine(description="  ", quantity=1, unit_price=1),
    ):
        with pytest.raises(BillUnreadable):
            to_bill(RawBill(lines=[bad_line]))
    with pytest.raises(BillUnreadable):
        to_bill(RawBill(lines=[]))


# ---- the review ----


async def test_the_review_warns_about_currency_total_and_a_used_bill_number(
    client, boss, bill_reader
):
    chair = await product(client, boss, "CHAIR-ERG", "Ergonomic Office Chair")
    supplier = await create_partner(client, boss, name="Zagros Furniture Works", is_supplier=True)
    await client.post(
        "/purchase-orders",
        json={
            "partner_id": supplier["id"],
            "partner_reference": "zf-1001",
            "lines": [{"product_id": chair["id"], "quantity": "1"}],
        },
        headers=boss,
    )

    result = await imported(
        client,
        boss,
        bill_reader,
        bill(line("Ergonomic Office Chair", "2", "1000.00"), currency="EUR", total=Decimal("2500")),
    )
    warnings = {w["code"]: w for w in result["warnings"]}
    assert set(warnings) == {"reference_used", "currency_differs", "total_differs"}
    assert "PO00001" in warnings["reference_used"]["message"]
    assert warnings["reference_used"]["blocks_confirm"] is True
    assert warnings["currency_differs"]["blocks_confirm"] is False
    assert warnings["total_differs"]["message"] == (
        "The items add up to 2,000.00, but the bill's total is 2,500.00"
    )


# ---- editing ----


async def test_the_review_can_be_corrected(client, boss, bill_reader):
    chair = await product(client, boss, "CHAIR-ERG", "Ergonomic Office Chair")
    supplier = await create_partner(client, boss, name="Acme", is_supplier=True)
    result = await imported(
        client, boss, bill_reader, bill(line("Something"), line("Shipping fee"))
    )
    url = f"/bill-imports/{result['id']}"
    first, second = (item["id"] for item in result["lines"])

    response = await client.patch(
        url, json={"partner_id": supplier["id"], "partner_reference": " ZF-9 "}, headers=boss
    )
    assert response.status_code == 200, response.text
    assert (response.json()["partner_id"], response.json()["partner_reference"]) == (
        supplier["id"],
        "ZF-9",
    )

    response = await client.patch(
        f"{url}/lines/{first}",
        json={"product_id": chair["id"], "quantity": "3", "unit_price": "12.50"},
        headers=boss,
    )
    changed = response.json()["lines"][0]
    assert (changed["product_id"], changed["quantity"], changed["unit_price"]) == (
        chair["id"],
        "3.000",
        "12.50",
    )
    assert changed["match_score"] is None  # chosen, not matched

    response = await client.delete(f"{url}/lines/{second}", headers=boss)
    assert [item["id"] for item in response.json()["lines"]] == [first]
    assert response.json()["warnings"] == []  # ready

    response = await client.patch(f"{url}/lines/{first}", json={"product_id": 999}, headers=boss)
    assert response.status_code == 400
    response = await client.patch(f"{url}/lines/999", json={"quantity": "1"}, headers=boss)
    assert response.status_code == 404


# ---- confirming ----


async def test_confirming_creates_a_draft_purchase_order(client, boss, bill_reader):
    chair = await product(client, boss, "CHAIR-ERG", "Ergonomic Office Chair")
    desk = await product(client, boss, "DESK-STD", "Standing Desk")
    supplier = await create_partner(client, boss, name="Zagros Furniture Works", is_supplier=True)
    result = await imported(
        client,
        boss,
        bill_reader,
        bill(
            line("Ergonomic Office Chair", "4", "118.50"),
            line("Standing Desk", "2", "289.99"),
        ),
    )

    response = await client.post(f"/bill-imports/{result['id']}/confirm", headers=boss)
    assert response.status_code == 200, response.text
    done = response.json()
    assert done["state"] == "done" and done["warnings"] == []

    po = (await client.get(f"/purchase-orders/{done['purchase_order_id']}", headers=boss)).json()
    assert po["state"] == "draft"
    assert po["partner_id"] == supplier["id"]
    assert po["partner_reference"] == "ZF-1001"
    assert [(item["product_id"], item["quantity"], item["unit_price"]) for item in po["lines"]] == [
        (chair["id"], "4.000", "118.50"),
        (desk["id"], "2.000", "289.99"),
    ]
    # the order can find the import it came from
    url = f"/bill-imports?purchase_order_id={done['purchase_order_id']}"
    assert [row["id"] for row in (await client.get(url, headers=boss)).json()] == [result["id"]]

    again = await client.post(f"/bill-imports/{result['id']}/confirm", headers=boss)
    assert again.status_code == 409
    edit = await client.patch(f"/bill-imports/{result['id']}", json={}, headers=boss)
    assert edit.status_code == 409  # done: no more changes


async def test_confirming_is_refused_until_every_line_has_a_product(client, boss, bill_reader):
    await create_partner(client, boss, name="Zagros Furniture Works", is_supplier=True)
    result = await imported(
        client, boss, bill_reader, bill(line("Something new"), line("Another new one"))
    )

    response = await client.post(f"/bill-imports/{result['id']}/confirm", headers=boss)
    assert response.status_code == 409
    assert "2 items have no product yet" in response.json()["detail"]


async def test_a_refused_confirm_saves_nothing(client, boss, bill_reader):
    chair = await product(client, boss, "CHAIR-ERG", "Ergonomic Office Chair")
    await create_partner(client, boss, name="Zagros Furniture Works", is_supplier=True)
    result = await imported(client, boss, bill_reader, bill(line("Ergonomic Office Chair")))
    await client.post(f"/products/{chair['id']}/archive", headers=boss)  # after the matching

    response = await client.post(f"/bill-imports/{result['id']}/confirm", headers=boss)
    assert response.status_code == 409
    assert "archived" in response.json()["detail"]
    current = (await client.get(f"/bill-imports/{result['id']}", headers=boss)).json()
    assert current["state"] == "open"
    assert (await client.get("/purchase-orders", headers=boss)).json() == []


async def test_discarding(client, boss, bill_reader):
    result = await imported(client, boss, bill_reader, bill(line("Anything")))
    url = f"/bill-imports/{result['id']}"

    response = await client.post(f"{url}/discard", headers=boss)
    assert response.json()["state"] == "discarded"
    assert (await client.post(f"{url}/confirm", headers=boss)).status_code == 409

    listed = (await client.get("/bill-imports?state=open", headers=boss)).json()
    assert listed == []


async def test_the_list_counts_lines_still_missing_a_product(client, boss, bill_reader):
    await product(client, boss, "CHAIR-ERG", "Ergonomic Office Chair")
    await imported(
        client, boss, bill_reader, bill(line("Ergonomic Office Chair"), line("Something new"))
    )

    response = await client.get("/bill-imports", headers=boss)
    [row] = response.json()
    assert (row["line_count"], row["missing_products"]) == (2, 1)
    assert "lines" not in row
    assert response.headers["x-total-count"] == "1"


async def test_bill_imports_need_purchase_access(client, make_user, bill_reader):
    seller = auth(await make_user(sales_access=Access.manager))
    assert (await upload(client, seller)).status_code == 403
    assert (await client.get("/bill-imports", headers=seller)).status_code == 403


# ---- the Gemini reader, with Google's client replaced ----


class StubModels:
    """Answers `answer`, after raising each of `errors` once, in order."""

    def __init__(self, answer=None, errors=()):
        self.answer, self.errors, self.requests = answer, list(errors), []

    async def generate_content(self, **request):
        self.requests.append(request)
        if self.errors:
            raise self.errors.pop(0)
        return self.answer


def gemini_reader(models: StubModels) -> GeminiBillReader:
    reader = GeminiBillReader("test-key", "test-model")
    reader._client = SimpleNamespace(aio=SimpleNamespace(models=models))
    return reader


async def test_gemini_reader_sends_the_file_and_schema_and_checks_the_answer():
    raw = RawBill(lines=[RawLine(description="Chair", quantity=1, unit_price=5)])
    models = StubModels(answer=SimpleNamespace(parsed=raw, text=None))

    result = await gemini_reader(models).read(PNG, "image/png")
    assert result.lines[0].unit_price == Decimal("5.00")
    [request] = models.requests
    assert request["model"] == "test-model"
    assert request["config"].response_schema is RawBill
    assert request["contents"][0].inline_data.mime_type == "image/png"

    # no parsed object: the text is parsed instead, and nonsense is refused
    models.answer = SimpleNamespace(parsed=None, text="not json")
    with pytest.raises(BillUnreadable):
        await gemini_reader(models).read(PNG, "image/png")


def api_error(code: int) -> errors.APIError:
    return errors.APIError(code, {"error": {"message": "from Google", "status": "X"}})


async def test_gemini_errors_become_unavailable():
    quota = StubModels(errors=[api_error(429)])
    with pytest.raises(ReaderUnavailable, match="busy"):
        await gemini_reader(quota).read(PNG, "image/png")
    assert len(quota.requests) == 1  # out of quota: no retry

    with pytest.raises(ReaderUnavailable, match="isn't available"):
        await gemini_reader(StubModels(errors=[TimeoutError()])).read(PNG, "image/png")


async def test_an_overloaded_model_is_tried_once_more(monkeypatch):
    monkeypatch.setattr(reader_module, "RETRY_DELAY", 0)
    raw = RawBill(lines=[RawLine(description="Chair", quantity=1, unit_price=5)])

    models = StubModels(answer=SimpleNamespace(parsed=raw, text=None), errors=[api_error(503)])
    assert (await gemini_reader(models).read(PNG, "image/png")).lines[0].description == "Chair"
    assert len(models.requests) == 2

    models = StubModels(errors=[api_error(503), api_error(503)])
    with pytest.raises(ReaderUnavailable, match="busy"):
        await gemini_reader(models).read(PNG, "image/png")
    assert len(models.requests) == 2


async def test_no_database_connection_is_held_while_the_bill_is_read(client, boss, bill_reader, db):
    # Reading can take a minute; a transaction left open meanwhile would keep a pooled
    # connection busy, and a few imports at once would starve every other request.
    seen = []

    async def count_open_transactions() -> None:
        result = await db.execute(
            text(
                "SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()"
                " AND state LIKE 'idle in transaction%' AND pid <> pg_backend_pid()"
            )
        )
        seen.append(result.scalar_one())
        await db.rollback()

    bill_reader.during_read = count_open_transactions
    await imported(client, boss, bill_reader, bill(line("Anything")))
    assert seen == [0]
