from decimal import Decimal

from app.models.user import Access
from tests.helpers import auth, create_location, create_partner, create_product, main_warehouse, stock_of


async def create_po(client, headers, product_id, quantity="10"):
    supplier = await create_partner(client, headers, name="Acme")
    response = await client.post(
        "/purchase-orders",
        json={"partner_id": supplier["id"], "lines": [{"product_id": product_id, "quantity": quantity}]},
        headers=headers,
    )
    assert response.status_code == 201, response.text
    return response.json(), supplier


async def ready_receipt(client, headers, po_id):
    transfers = (await client.get("/transfers?transfer_type=receipt", headers=headers)).json()
    return next(t for t in transfers if t["purchase_order_id"] == po_id)


async def test_full_purchase_flow(client, boss):
    product = await create_product(client, boss)
    po, supplier = await create_po(client, boss, product["id"])
    assert po["reference"] == "PO00001"
    assert po["state"] == "draft"
    assert Decimal(po["total"]) == Decimal("300.00")  # 10 × cost 30.00

    partner = (await client.get(f"/partners/{supplier['id']}", headers=boss)).json()
    assert partner["is_supplier"] is True  # set automatically by using it

    confirmed = await client.post(f"/purchase-orders/{po['id']}/confirm", headers=boss)
    assert confirmed.json()["state"] == "confirmed"
    receipt = await ready_receipt(client, boss, po["id"])
    assert receipt["reference"] == "WH/IN/00001"
    assert receipt["state"] == "ready"

    validated = await client.post(f"/transfers/{receipt['id']}/validate", json={}, headers=boss)
    assert validated.status_code == 200
    moves = validated.json()["moves"]
    assert len(moves) == 1
    assert Decimal(moves[0]["quantity"]) == 10

    assert await stock_of(client, boss, product["id"]) == {
        "on_hand": Decimal(10), "reserved": Decimal(0), "available": Decimal(10),
    }
    order = (await client.get(f"/purchase-orders/{po['id']}", headers=boss)).json()
    assert order["state"] == "received"


async def test_empty_order_cannot_be_confirmed(client, boss):
    supplier = await create_partner(client, boss)
    po = (await client.post("/purchase-orders", json={"partner_id": supplier["id"]}, headers=boss)).json()
    response = await client.post(f"/purchase-orders/{po['id']}/confirm", headers=boss)
    assert response.status_code == 409


async def test_confirmed_order_cannot_be_edited(client, boss):
    product = await create_product(client, boss)
    po, _ = await create_po(client, boss, product["id"])
    await client.post(f"/purchase-orders/{po['id']}/confirm", headers=boss)
    response = await client.post(
        f"/purchase-orders/{po['id']}/lines", json={"product_id": product["id"], "quantity": "1"}, headers=boss
    )
    assert response.status_code == 409


async def test_line_of_another_order_is_not_found(client, boss):
    product = await create_product(client, boss)
    first, _ = await create_po(client, boss, product["id"])
    second, _ = await create_po(client, boss, product["id"])
    other_line_id = second["lines"][0]["id"]
    response = await client.delete(f"/purchase-orders/{first['id']}/lines/{other_line_id}", headers=boss)
    assert response.status_code == 404


async def test_receipt_cannot_be_validated_twice(client, boss):
    product = await create_product(client, boss)
    po, _ = await create_po(client, boss, product["id"])
    await client.post(f"/purchase-orders/{po['id']}/confirm", headers=boss)
    receipt = await ready_receipt(client, boss, po["id"])

    first = await client.post(f"/transfers/{receipt['id']}/validate", json={}, headers=boss)
    second = await client.post(f"/transfers/{receipt['id']}/validate", json={}, headers=boss)
    assert first.status_code == 200
    assert second.status_code == 409
    assert (await stock_of(client, boss, product["id"]))["on_hand"] == 10  # not 20


async def test_cancelling_confirmed_order_cancels_its_receipt(client, boss):
    product = await create_product(client, boss)
    po, _ = await create_po(client, boss, product["id"])
    await client.post(f"/purchase-orders/{po['id']}/confirm", headers=boss)

    response = await client.post(f"/purchase-orders/{po['id']}/cancel", headers=boss)
    assert response.json()["state"] == "cancelled"
    receipt = await ready_receipt(client, boss, po["id"])
    assert receipt["state"] == "cancelled"


async def test_received_order_cannot_be_cancelled(client, boss):
    product = await create_product(client, boss)
    po, _ = await create_po(client, boss, product["id"])
    await client.post(f"/purchase-orders/{po['id']}/confirm", headers=boss)
    receipt = await ready_receipt(client, boss, po["id"])
    await client.post(f"/transfers/{receipt['id']}/validate", json={}, headers=boss)

    response = await client.post(f"/purchase-orders/{po['id']}/cancel", headers=boss)
    assert response.status_code == 409


async def test_purchase_user_cannot_confirm(client, boss, make_user):
    product = await create_product(client, boss)
    po, _ = await create_po(client, boss, product["id"])
    buyer = auth(await make_user(purchase_access=Access.user))
    response = await client.post(f"/purchase-orders/{po['id']}/confirm", headers=buyer)
    assert response.status_code == 403


async def test_receipt_into_another_warehouses_location_is_rejected(client, boss):
    product = await create_product(client, boss)
    po, _ = await create_po(client, boss, product["id"])
    await client.post(f"/purchase-orders/{po['id']}/confirm", headers=boss)
    receipt = await ready_receipt(client, boss, po["id"])
    erbil = (await client.post("/warehouses", json={"name": "Erbil", "code": "ERB"}, headers=boss)).json()

    response = await client.post(
        f"/transfers/{receipt['id']}/validate",
        json={"location_id": erbil["default_location_id"]},
        headers=boss,
    )
    assert response.status_code == 400
    assert (await stock_of(client, boss, product["id"]))["on_hand"] == 0

async def test_warehouse_is_required_when_there_are_several(client, boss):
    product = await create_product(client, boss)
    await client.post("/warehouses", json={"name": "Erbil", "code": "ERB"}, headers=boss)
    supplier = await create_partner(client, boss)
    response = await client.post(
        "/purchase-orders",
        json={"partner_id": supplier["id"], "lines": [{"product_id": product["id"], "quantity": "1"}]},
        headers=boss,
    )
    assert response.status_code == 400
    assert "warehouse_id" in response.json()["detail"]