from decimal import Decimal

from app.models.user import Access
from tests.helpers import (
    auth,
    create_location,
    create_partner,
    create_product,
    create_so,
    main_warehouse,
    receive_stock,
    stock_of,
)


async def transfers_for(client, headers, **order):
    key, value = next(iter(order.items()))
    response = await client.get(f"/transfers?{key}={value}", headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


async def confirmed_so(client, headers, lines):
    so, _ = await create_so(client, headers, lines)
    response = await client.post(f"/sales-orders/{so['id']}/confirm", headers=headers)
    assert response.status_code == 200, response.text
    return so


async def validate(client, headers, transfer_id, lines=None, location_id=None):
    body: dict = {}
    if lines is not None:
        body["lines"] = [{"line_id": line_id, "quantity": qty} for line_id, qty in lines]
    if location_id is not None:
        body["location_id"] = location_id
    return await client.post(f"/transfers/{transfer_id}/validate", json=body, headers=headers)


async def test_partial_delivery_creates_a_backorder_that_keeps_the_rest_reserved(client, boss):
    product = await create_product(client, boss)
    await receive_stock(client, boss, product["id"], 10)
    so = await confirmed_so(client, boss, [(product["id"], 6)])
    [delivery] = await transfers_for(client, boss, sales_order_id=so["id"])
    [line] = delivery["lines"]

    response = await validate(client, boss, delivery["id"], [(line["id"], "4")])
    assert response.status_code == 200, response.text
    done = response.json()
    assert done["state"] == "done"
    assert [Decimal(x["quantity"]) for x in done["lines"]] == [4]  # lists what it shipped
    assert sum(Decimal(m["quantity"]) for m in done["moves"]) == 4

    first, backorder = await transfers_for(client, boss, sales_order_id=so["id"])
    assert backorder["state"] == "ready"
    assert backorder["backorder_of_id"] == first["id"]
    assert backorder["reference"] == "WH/OUT/00002"
    assert [Decimal(x["quantity"]) for x in backorder["lines"]] == [2]

    order = (await client.get(f"/sales-orders/{so['id']}", headers=boss)).json()
    assert order["state"] == "confirmed"  # not delivered while a backorder is open
    assert await stock_of(client, boss, product["id"]) == {
        "on_hand": Decimal(6),
        "reserved": Decimal(2),
        "available": Decimal(4),
    }

    response = await validate(client, boss, backorder["id"])
    assert response.status_code == 200, response.text
    order = (await client.get(f"/sales-orders/{so['id']}", headers=boss)).json()
    assert order["state"] == "delivered"
    assert await stock_of(client, boss, product["id"]) == {
        "on_hand": Decimal(4),
        "reserved": Decimal(0),
        "available": Decimal(4),
    }


async def test_partial_receipt_creates_a_backorder(client, boss):
    product = await create_product(client, boss)
    supplier = await create_partner(client, boss, name="Acme", is_supplier=True)
    po = (
        await client.post(
            "/purchase-orders",
            json={
                "partner_id": supplier["id"],
                "lines": [{"product_id": product["id"], "quantity": "10"}],
            },
            headers=boss,
        )
    ).json()
    await client.post(f"/purchase-orders/{po['id']}/confirm", headers=boss)
    [receipt] = await transfers_for(client, boss, purchase_order_id=po["id"])

    response = await validate(client, boss, receipt["id"], [(receipt["lines"][0]["id"], "3")])
    assert response.status_code == 200, response.text

    _, backorder = await transfers_for(client, boss, purchase_order_id=po["id"])
    assert [Decimal(x["quantity"]) for x in backorder["lines"]] == [7]
    order = (await client.get(f"/purchase-orders/{po['id']}", headers=boss)).json()
    assert order["state"] == "confirmed"
    assert (await stock_of(client, boss, product["id"]))["on_hand"] == 3

    await validate(client, boss, backorder["id"])
    order = (await client.get(f"/purchase-orders/{po['id']}", headers=boss)).json()
    assert order["state"] == "received"
    assert (await stock_of(client, boss, product["id"]))["on_hand"] == 10


async def test_lines_not_listed_move_nothing_and_go_to_the_backorder(client, boss):
    chair = await create_product(client, boss, sku="CHR-001")
    desk = await create_product(client, boss, sku="DSK-001")
    await receive_stock(client, boss, chair["id"], 5)
    await receive_stock(client, boss, desk["id"], 5)
    so = await confirmed_so(client, boss, [(chair["id"], 2), (desk["id"], 3)])
    [delivery] = await transfers_for(client, boss, sales_order_id=so["id"])
    chair_line = next(x for x in delivery["lines"] if x["product_id"] == chair["id"])

    response = await validate(client, boss, delivery["id"], [(chair_line["id"], "2")])
    assert response.status_code == 200, response.text
    assert [x["product_id"] for x in response.json()["lines"]] == [chair["id"]]

    _, backorder = await transfers_for(client, boss, sales_order_id=so["id"])
    assert [(x["product_id"], Decimal(x["quantity"])) for x in backorder["lines"]] == [
        (desk["id"], 3)
    ]


async def test_shipping_part_only_needs_stock_for_that_part(client, boss):
    product = await create_product(client, boss)
    warehouse = await main_warehouse(client, boss)
    shelf = await create_location(client, boss, "Shelf A", warehouse["id"])
    await receive_stock(client, boss, product["id"], 3, location_id=shelf["id"])
    await receive_stock(client, boss, product["id"], 10)
    so = await confirmed_so(client, boss, [(product["id"], 5)])
    [delivery] = await transfers_for(client, boss, sales_order_id=so["id"])
    line_id = delivery["lines"][0]["id"]

    response = await validate(client, boss, delivery["id"], location_id=shelf["id"])
    assert response.status_code == 409  # the shelf can't hold all 5

    response = await validate(
        client, boss, delivery["id"], [(line_id, "3")], location_id=shelf["id"]
    )
    assert response.status_code == 200, response.text
    assert {m["from_location_id"] for m in response.json()["moves"]} == {shelf["id"]}


async def test_invalid_quantities_are_rejected_and_nothing_moves(client, boss):
    product = await create_product(client, boss)
    await receive_stock(client, boss, product["id"], 10)
    so = await confirmed_so(client, boss, [(product["id"], 4)])
    [delivery] = await transfers_for(client, boss, sales_order_id=so["id"])
    line_id = delivery["lines"][0]["id"]

    assert (await validate(client, boss, delivery["id"], [(line_id, "5")])).status_code == 409
    assert (await validate(client, boss, delivery["id"], [(line_id, "0")])).status_code == 409
    assert (await validate(client, boss, delivery["id"], [])).status_code == 409
    assert (await validate(client, boss, delivery["id"], [(999, "1")])).status_code == 400
    response = await validate(client, boss, delivery["id"], [(line_id, "1"), (line_id, "1")])
    assert response.status_code == 422

    [still] = await transfers_for(client, boss, sales_order_id=so["id"])
    assert still["state"] == "ready"
    assert (await stock_of(client, boss, product["id"]))["on_hand"] == 10


async def test_invoicing_follows_partial_deliveries(client, boss):
    product = await create_product(client, boss)
    await receive_stock(client, boss, product["id"], 10)
    so = await confirmed_so(client, boss, [(product["id"], 10)])
    [delivery] = await transfers_for(client, boss, sales_order_id=so["id"])

    await validate(client, boss, delivery["id"], [(delivery["lines"][0]["id"], "4")])
    response = await client.post("/invoices", json={"sales_order_id": so["id"]}, headers=boss)
    assert response.status_code == 201, response.text
    assert Decimal(response.json()["lines"][0]["quantity"]) == 4  # only what shipped

    _, backorder = await transfers_for(client, boss, sales_order_id=so["id"])
    await validate(client, boss, backorder["id"])
    response = await client.post("/invoices", json={"sales_order_id": so["id"]}, headers=boss)
    assert response.status_code == 201, response.text
    assert Decimal(response.json()["lines"][0]["quantity"]) == 6  # the rest


async def partly_delivered(client, headers, ordered=6, shipped="4"):
    product = await create_product(client, headers)
    await receive_stock(client, headers, product["id"], 10)
    so = await confirmed_so(client, headers, [(product["id"], ordered)])
    [delivery] = await transfers_for(client, headers, sales_order_id=so["id"])
    await validate(client, headers, delivery["id"], [(delivery["lines"][0]["id"], shipped)])
    _, backorder = await transfers_for(client, headers, sales_order_id=so["id"])
    return product, so, backorder


async def test_cancelling_the_backorder_closes_the_order_with_what_shipped(client, boss):
    product, so, backorder = await partly_delivered(client, boss)

    response = await client.post(f"/transfers/{backorder['id']}/cancel", headers=boss)
    assert response.status_code == 200, response.text
    assert response.json()["state"] == "cancelled"

    order = (await client.get(f"/sales-orders/{so['id']}", headers=boss)).json()
    assert order["state"] == "delivered"
    assert (await stock_of(client, boss, product["id"]))["reserved"] == 0

    response = await client.post(f"/transfers/{backorder['id']}/cancel", headers=boss)
    assert response.status_code == 409  # already cancelled


async def test_an_original_transfer_cannot_be_cancelled_directly(client, boss):
    product = await create_product(client, boss)
    await receive_stock(client, boss, product["id"], 10)
    so = await confirmed_so(client, boss, [(product["id"], 3)])
    [delivery] = await transfers_for(client, boss, sales_order_id=so["id"])

    response = await client.post(f"/transfers/{delivery['id']}/cancel", headers=boss)
    assert response.status_code == 409
    assert "cancel its order instead" in response.json()["detail"]


async def test_an_order_cannot_be_cancelled_once_something_has_moved(client, boss):
    product, so, backorder = await partly_delivered(client, boss)

    response = await client.post(f"/sales-orders/{so['id']}/cancel", headers=boss)
    assert response.status_code == 409
    assert "cancel its backorder instead" in response.json()["detail"]

    [still] = [
        t
        for t in await transfers_for(client, boss, sales_order_id=so["id"])
        if t["id"] == backorder["id"]
    ]
    assert still["state"] == "ready"  # nothing changed
    assert (await stock_of(client, boss, product["id"]))["reserved"] == 2


async def test_only_inventory_managers_can_cancel_a_backorder(client, boss, make_user):
    _, _, backorder = await partly_delivered(client, boss)
    inventory_user = auth(await make_user(inventory_access=Access.user))

    response = await client.post(f"/transfers/{backorder['id']}/cancel", headers=inventory_user)
    assert response.status_code == 403
