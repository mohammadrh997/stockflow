from decimal import Decimal

from app.models.user import Access
from tests.helpers import (
    auth,
    create_partner,
    create_product,
    create_so,
    delivery_of,
    main_warehouse,
    receive_stock,
)


async def count_stock(client, headers, product_id, location_id, counted):
    response = await client.post(
        "/transfers/adjustments",
        json={
            "location_id": location_id,
            "lines": [{"product_id": product_id, "counted_quantity": counted}],
            "note": "count",
        },
        headers=headers,
    )
    assert response.status_code == 201, response.text


async def test_product_summary(client, boss):
    product = await create_product(client, boss)
    stock = (await main_warehouse(client, boss))["default_location_id"]
    await receive_stock(client, boss, product["id"], 10)

    delivered, _ = await create_so(client, boss, [(product["id"], 2)])
    await client.post(f"/sales-orders/{delivered['id']}/confirm", headers=boss)
    delivery = await delivery_of(client, boss, delivered["id"])
    await client.post(f"/transfers/{delivery['id']}/validate", json={}, headers=boss)
    confirmed, _ = await create_so(client, boss, [(product["id"], 1)])
    await client.post(f"/sales-orders/{confirmed['id']}/confirm", headers=boss)
    await create_so(client, boss, [(product["id"], 5)])  # draft: not committed
    cancelled, _ = await create_so(client, boss, [(product["id"], 4)])
    await client.post(f"/sales-orders/{cancelled['id']}/cancel", headers=boss)

    await count_stock(client, boss, product["id"], stock, "9")  # 8 on hand: +1
    await count_stock(client, boss, product["id"], stock, "6")  # -3

    response = await client.get(f"/products/{product['id']}/summary", headers=boss)
    assert response.status_code == 200, response.text
    assert response.json() == {
        "stock": {"in": "10.000", "out": "2.000", "counted_up": "1.000", "counted_down": "3.000"},
        "sales": {"committed_quantity": "3.000"},
        "purchases": {"committed_quantity": "10.000"},
    }


async def test_partner_summary(client, boss):
    product = await create_product(client, boss, sale_price="50.00")
    await receive_stock(client, boss, product["id"], 10)
    so, customer = await create_so(client, boss, [(product["id"], 4)])
    await client.post(f"/sales-orders/{so['id']}/confirm", headers=boss)
    delivery = await delivery_of(client, boss, so["id"])
    await client.post(f"/transfers/{delivery['id']}/validate", json={}, headers=boss)

    response = await client.post("/invoices", json={"sales_order_id": so["id"]}, headers=boss)
    posted = response.json()
    await client.post(f"/invoices/{posted['id']}/post", json={}, headers=boss)
    response = await client.post(
        f"/invoices/{posted['id']}/payments",
        json={"amount": "80.00", "paid_on": "2026-01-10"},
        headers=boss,
    )
    assert response.status_code == 201, response.text

    for state in ("draft", "cancelled"):
        response = await client.post(
            "/sales-orders",
            json={
                "partner_id": customer["id"],
                "lines": [{"product_id": product["id"], "quantity": "1"}],
            },
            headers=boss,
        )
        if state == "cancelled":
            await client.post(f"/sales-orders/{response.json()['id']}/cancel", headers=boss)

    summary = (await client.get(f"/partners/{customer['id']}/summary", headers=boss)).json()
    assert summary["sales_orders"] == {"count": 2, "total": "250.00"}  # 200 + the 50 draft
    assert summary["customer_invoices"] == {"invoiced": "200.00", "due": "120.00"}
    assert summary["purchase_orders"] == {"count": 0, "total": "0.00"}
    assert summary["vendor_bills"] == {"invoiced": "0.00", "due": "0.00"}


async def test_order_totals_round_each_line_like_the_orders_do(client, boss):
    product = await create_product(client, boss, sale_price="0.01")
    customer = await create_partner(client, boss, name="Cents", is_customer=True)
    response = await client.post(
        "/sales-orders",
        json={
            "partner_id": customer["id"],
            "lines": [{"product_id": product["id"], "quantity": "0.5"}] * 2,
        },
        headers=boss,
    )
    order = response.json()

    summary = (await client.get(f"/partners/{customer['id']}/summary", headers=boss)).json()
    # each line is 0.005 -> 0.01; rounding the sum instead would give 0.01
    assert Decimal(summary["sales_orders"]["total"]) == Decimal(order["total"]) == Decimal("0.02")


async def test_summaries_hide_what_the_user_cant_see(client, boss, make_user):
    product = await create_product(client, boss)
    partner = await create_partner(client, boss, name="Both", is_customer=True, is_supplier=True)
    store = auth(await make_user(inventory_access=Access.user))
    seller = auth(await make_user(sales_access=Access.user))

    summary = (await client.get(f"/products/{product['id']}/summary", headers=store)).json()
    assert summary["stock"] is not None
    assert summary["sales"] is None and summary["purchases"] is None

    summary = (await client.get(f"/partners/{partner['id']}/summary", headers=seller)).json()
    assert summary["sales_orders"] is not None and summary["customer_invoices"] is not None
    assert summary["purchase_orders"] is None and summary["vendor_bills"] is None


async def test_summaries_of_unknown_records_are_404(client, boss):
    assert (await client.get("/products/999/summary", headers=boss)).status_code == 404
    assert (await client.get("/partners/999/summary", headers=boss)).status_code == 404
