import asyncio
from collections import Counter
from datetime import date, timedelta
from decimal import Decimal

from app.models.user import Access
from tests.helpers import (
    auth,
    create_product,
    create_so,
    delivery_of,
    receive_stock,
)


async def delivered_order(client, headers, quantity="4", sale_price="50.00", sku="CHR-001"):
    product = await create_product(client, headers, sku=sku, sale_price=sale_price)
    await receive_stock(client, headers, product["id"], quantity)
    so, _ = await create_so(client, headers, [(product["id"], quantity)])
    response = await client.post(f"/sales-orders/{so['id']}/confirm", headers=headers)
    assert response.status_code == 200, response.text
    delivery = await delivery_of(client, headers, so["id"])
    response = await client.post(f"/transfers/{delivery['id']}/validate", json={}, headers=headers)
    assert response.status_code == 200, response.text
    return so


async def create_invoice(client, headers, **order):
    return await client.post("/invoices", json=order, headers=headers)


async def draft_for(client, headers, so_id):
    response = await create_invoice(client, headers, sales_order_id=so_id)
    assert response.status_code == 201, response.text
    return response.json()


async def posted_for(client, headers, so_id):
    draft = await draft_for(client, headers, so_id)
    response = await client.post(f"/invoices/{draft['id']}/post", json={}, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


async def pay(client, headers, invoice_id, amount):
    return await client.post(
        f"/invoices/{invoice_id}/payments",
        json={"amount": amount, "paid_on": date.today().isoformat()},
        headers=headers,
    )


# --- the main flow ---


async def test_customer_invoice_lifecycle(client, boss):
    so = await delivered_order(client, boss, quantity="4", sale_price="50.00")

    draft = await draft_for(client, boss, so["id"])
    assert draft["invoice_type"] == "customer_invoice"
    assert draft["state"] == "draft"
    assert draft["number"] is None
    assert draft["sales_order_id"] == so["id"]
    assert draft["partner_id"] == so["partner_id"]
    [line] = draft["lines"]
    assert Decimal(line["quantity"]) == 4
    assert Decimal(line["unit_price"]) == Decimal("50.00")
    assert Decimal(draft["amount_total"]) == Decimal("200.00")  # computed live
    assert draft["payment_state"] == "not_paid"

    response = await client.post(f"/invoices/{draft['id']}/post", json={}, headers=boss)
    assert response.status_code == 200, response.text
    posted = response.json()
    assert posted["state"] == "posted"
    assert posted["number"] == "INV00001"
    assert posted["invoice_date"] == date.today().isoformat()
    assert posted["due_date"] == posted["invoice_date"]
    assert Decimal(posted["lines"][0]["subtotal"]) == Decimal("200.00")  # stored now
    assert Decimal(posted["amount_total"]) == Decimal("200.00")

    response = await pay(client, boss, posted["id"], "50.00")
    assert response.status_code == 201, response.text
    assert response.json()["payment_state"] == "partial"
    assert Decimal(response.json()["amount_due"]) == Decimal("150.00")

    response = await pay(client, boss, posted["id"], "150.00")
    assert response.json()["payment_state"] == "paid"
    assert Decimal(response.json()["amount_due"]) == 0


async def test_vendor_bill_uses_received_quantity_and_cost_price(client, boss):
    product = await create_product(client, boss, cost_price="30.00")
    receipt = await receive_stock(client, boss, product["id"], "10")

    response = await create_invoice(client, boss, purchase_order_id=receipt["purchase_order_id"])
    assert response.status_code == 201, response.text
    bill = response.json()
    assert bill["invoice_type"] == "vendor_bill"
    [line] = bill["lines"]
    assert line["purchase_line_id"] is not None and line["sales_line_id"] is None
    assert Decimal(line["quantity"]) == 10
    assert Decimal(bill["amount_total"]) == Decimal("300.00")

    response = await client.post(f"/invoices/{bill['id']}/post", json={}, headers=boss)
    assert response.json()["number"] == "BILL00001"


async def test_subtotal_rounds_half_up_and_stays_the_same_after_posting(client, boss):
    so = await delivered_order(client, boss, quantity="0.5", sale_price="10.05")

    draft = await draft_for(client, boss, so["id"])
    assert Decimal(draft["lines"][0]["subtotal"]) == Decimal("5.03")  # 5.025 -> 5.03

    response = await client.post(f"/invoices/{draft['id']}/post", json={}, headers=boss)
    assert Decimal(response.json()["lines"][0]["subtotal"]) == Decimal("5.03")
    assert Decimal(response.json()["amount_total"]) == Decimal("5.03")


# --- what can be invoiced ---


async def test_undelivered_order_has_nothing_to_invoice(client, boss):
    product = await create_product(client, boss)
    await receive_stock(client, boss, product["id"], "5")
    so, _ = await create_so(client, boss, [(product["id"], "3")])
    await client.post(f"/sales-orders/{so['id']}/confirm", headers=boss)

    response = await create_invoice(client, boss, sales_order_id=so["id"])
    assert response.status_code == 409


async def test_order_cannot_be_invoiced_twice(client, boss):
    so = await delivered_order(client, boss)
    await draft_for(client, boss, so["id"])  # a draft already claims the quantity

    response = await create_invoice(client, boss, sales_order_id=so["id"])
    assert response.status_code == 409


async def test_splitting_an_order_across_invoices_respects_the_delivered_quantity(client, boss):
    so = await delivered_order(client, boss, quantity="10")
    first = await draft_for(client, boss, so["id"])
    first_line = first["lines"][0]["id"]

    response = await client.patch(
        f"/invoices/{first['id']}/lines/{first_line}", json={"quantity": "6"}, headers=boss
    )
    assert response.status_code == 200, response.text

    second = await draft_for(client, boss, so["id"])
    assert Decimal(second["lines"][0]["quantity"]) == 4  # only the rest
    second_line = second["lines"][0]["id"]

    response = await client.patch(
        f"/invoices/{second['id']}/lines/{second_line}", json={"quantity": "5"}, headers=boss
    )
    assert response.status_code == 409

    response = await client.patch(
        f"/invoices/{first['id']}/lines/{first_line}", json={"quantity": "7"}, headers=boss
    )
    assert response.status_code == 409


async def test_cancelling_an_invoice_frees_its_quantity(client, boss):
    so = await delivered_order(client, boss)
    draft = await draft_for(client, boss, so["id"])

    response = await client.post(f"/invoices/{draft['id']}/cancel", headers=boss)
    assert response.status_code == 200, response.text
    assert response.json()["state"] == "cancelled"

    again = await draft_for(client, boss, so["id"])
    assert Decimal(again["lines"][0]["quantity"]) == 4


async def test_price_can_be_changed_to_zero_on_a_draft(client, boss):
    so = await delivered_order(client, boss)
    draft = await draft_for(client, boss, so["id"])
    line_id = draft["lines"][0]["id"]

    response = await client.patch(
        f"/invoices/{draft['id']}/lines/{line_id}", json={"unit_price": "0"}, headers=boss
    )
    assert response.status_code == 200, response.text
    assert Decimal(response.json()["amount_total"]) == 0


async def test_deleting_a_line_and_posting_an_empty_invoice(client, boss):
    so = await delivered_order(client, boss)
    draft = await draft_for(client, boss, so["id"])
    line_id = draft["lines"][0]["id"]

    response = await client.delete(f"/invoices/{draft['id']}/lines/{line_id}", headers=boss)
    assert response.status_code == 200, response.text
    assert response.json()["lines"] == []

    response = await client.post(f"/invoices/{draft['id']}/post", json={}, headers=boss)
    assert response.status_code == 409


# --- posted invoices are frozen ---


async def test_posted_invoice_cannot_be_edited_or_posted_again(client, boss):
    so = await delivered_order(client, boss)
    posted = await posted_for(client, boss, so["id"])
    line_id = posted["lines"][0]["id"]

    response = await client.patch(
        f"/invoices/{posted['id']}/lines/{line_id}", json={"quantity": "1"}, headers=boss
    )
    assert response.status_code == 409
    response = await client.delete(f"/invoices/{posted['id']}/lines/{line_id}", headers=boss)
    assert response.status_code == 409
    response = await client.post(f"/invoices/{posted['id']}/post", json={}, headers=boss)
    assert response.status_code == 409


async def test_cancel_rules(client, boss):
    so = await delivered_order(client, boss)
    posted = await posted_for(client, boss, so["id"])

    await pay(client, boss, posted["id"], "10.00")
    response = await client.post(f"/invoices/{posted['id']}/cancel", headers=boss)
    assert response.status_code == 409  # has payments

    other = await delivered_order(client, boss, sku="DESK-001")
    unpaid = await posted_for(client, boss, other["id"])
    response = await client.post(f"/invoices/{unpaid['id']}/cancel", headers=boss)
    assert response.status_code == 200, response.text
    assert response.json()["number"] == unpaid["number"]  # an issued number stays

    response = await client.post(f"/invoices/{unpaid['id']}/cancel", headers=boss)
    assert response.status_code == 409


# --- payments and dates ---


async def test_payments_need_a_posted_invoice_and_cannot_exceed_the_amount_due(client, boss):
    so = await delivered_order(client, boss)
    draft = await draft_for(client, boss, so["id"])

    response = await pay(client, boss, draft["id"], "10.00")
    assert response.status_code == 409  # still a draft

    await client.post(f"/invoices/{draft['id']}/post", json={}, headers=boss)
    response = await pay(client, boss, draft["id"], "200.01")
    assert response.status_code == 409

    response = await pay(client, boss, draft["id"], "0")
    assert response.status_code == 422


async def test_due_date_cannot_be_before_the_invoice_date(client, boss):
    so = await delivered_order(client, boss)
    draft = await draft_for(client, boss, so["id"])
    today = date.today()
    yesterday = today - timedelta(days=1)

    response = await client.post(
        f"/invoices/{draft['id']}/post",
        json={"invoice_date": today.isoformat(), "due_date": yesterday.isoformat()},
        headers=boss,
    )
    assert response.status_code == 422  # caught by the schema

    response = await client.post(
        f"/invoices/{draft['id']}/post", json={"due_date": yesterday.isoformat()}, headers=boss
    )
    assert response.status_code == 422  # caught by the service (invoice date defaults to today)


# --- input and lookups ---


async def test_exactly_one_order_is_required(client, boss):
    assert (await create_invoice(client, boss)).status_code == 422
    response = await create_invoice(client, boss, sales_order_id=1, purchase_order_id=1)
    assert response.status_code == 422


async def test_unknown_order_is_400_and_unknown_invoice_or_line_is_404(client, boss):
    assert (await create_invoice(client, boss, sales_order_id=999)).status_code == 400
    assert (await client.get("/invoices/999", headers=boss)).status_code == 404

    so = await delivered_order(client, boss)
    draft = await draft_for(client, boss, so["id"])
    response = await client.patch(
        f"/invoices/{draft['id']}/lines/999", json={"quantity": "1"}, headers=boss
    )
    assert response.status_code == 404


async def test_list_filters(client, boss):
    so = await delivered_order(client, boss)
    draft = await draft_for(client, boss, so["id"])
    product = await create_product(client, boss, sku="DESK-001")
    receipt = await receive_stock(client, boss, product["id"], "2")
    await create_invoice(client, boss, purchase_order_id=receipt["purchase_order_id"])

    response = await client.get("/invoices?invoice_type=customer_invoice", headers=boss)
    assert response.status_code == 200, response.text
    assert [i["id"] for i in response.json()] == [draft["id"]]

    response = await client.get("/invoices?state=posted", headers=boss)
    assert response.json() == []


# --- permissions ---


async def test_sales_user_drafts_but_only_sales_manager_posts_and_takes_payments(
    client, boss, make_user
):
    so = await delivered_order(client, boss)
    sales_user = auth(await make_user(sales_access=Access.user))

    draft = await draft_for(client, sales_user, so["id"])
    response = await client.post(f"/invoices/{draft['id']}/post", json={}, headers=sales_user)
    assert response.status_code == 403

    await client.post(f"/invoices/{draft['id']}/post", json={}, headers=boss)
    assert (await pay(client, sales_user, draft["id"], "10.00")).status_code == 403
    assert (
        await client.post(f"/invoices/{draft['id']}/cancel", headers=sales_user)
    ).status_code == 403


async def test_purchase_user_cannot_touch_customer_invoices(client, boss, make_user):
    so = await delivered_order(client, boss)
    purchase_user = auth(await make_user(purchase_access=Access.manager))

    response = await create_invoice(client, purchase_user, sales_order_id=so["id"])
    assert response.status_code == 403

    draft = await draft_for(client, boss, so["id"])
    response = await client.post(f"/invoices/{draft['id']}/post", json={}, headers=purchase_user)
    assert response.status_code == 403


async def test_user_without_sales_or_purchase_access_is_rejected(client, make_user):
    inventory_only = auth(await make_user(inventory_access=Access.manager))
    assert (await client.get("/invoices", headers=inventory_only)).status_code == 403


# --- concurrency ---


async def test_concurrent_payments_never_exceed_the_total(client, boss):
    so = await delivered_order(client, boss)  # total 200.00
    posted = await posted_for(client, boss, so["id"])

    responses = await asyncio.gather(*(pay(client, boss, posted["id"], "50.00") for _ in range(5)))

    assert Counter(r.status_code for r in responses) == {201: 4, 409: 1}
    final = (await client.get(f"/invoices/{posted['id']}", headers=boss)).json()
    assert Decimal(final["amount_paid"]) == Decimal("200.00")
    assert final["payment_state"] == "paid"


async def test_concurrent_invoice_creation_invoices_an_order_once(client, boss):
    so = await delivered_order(client, boss)

    responses = await asyncio.gather(
        *(create_invoice(client, boss, sales_order_id=so["id"]) for _ in range(3))
    )

    assert Counter(r.status_code for r in responses) == {201: 1, 409: 2}
