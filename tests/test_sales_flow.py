from decimal import Decimal

from app.models.user import Access
from tests.helpers import (
    auth, create_location, create_so, delivery_of, create_product, main_warehouse, receive_stock, stock_of,
)




async def test_confirm_reserves_stock(client, boss):
    product = await create_product(client, boss)
    await receive_stock(client, boss, product["id"], 10)
    so, customer = await create_so(client, boss, [(product["id"], 6)])
    assert Decimal(so["total"]) == Decimal("300.00")  # 6 × sale price 50.00

    response = await client.post(f"/sales-orders/{so['id']}/confirm", headers=boss)
    assert response.status_code == 200
    assert await stock_of(client, boss, product["id"]) == {
        "on_hand": Decimal(10), "reserved": Decimal(6), "available": Decimal(4),
    }
    delivery = await delivery_of(client, boss, so["id"])
    assert delivery["reference"] == "WH/OUT/00001"
    assert delivery["state"] == "ready"
    assert (await client.get(f"/partners/{customer['id']}", headers=boss)).json()["is_customer"] is True


async def test_confirm_refuses_to_oversell(client, boss):
    product = await create_product(client, boss)
    await receive_stock(client, boss, product["id"], 10)
    first, _ = await create_so(client, boss, [(product["id"], 6)])
    await client.post(f"/sales-orders/{first['id']}/confirm", headers=boss)

    second, _ = await create_so(client, boss, [(product["id"], 5)])
    response = await client.post(f"/sales-orders/{second['id']}/confirm", headers=boss)
    assert response.status_code == 409
    assert "requested 5" in response.json()["detail"]
    assert "available 4" in response.json()["detail"]
    assert (await client.get(f"/sales-orders/{second['id']}", headers=boss)).json()["state"] == "draft"


async def test_lines_of_the_same_product_are_checked_together(client, boss):
    product = await create_product(client, boss)
    await receive_stock(client, boss, product["id"], 5)
    so, _ = await create_so(client, boss, [(product["id"], 3), (product["id"], 3)])
    response = await client.post(f"/sales-orders/{so['id']}/confirm", headers=boss)
    assert response.status_code == 409  # 6 requested in total, only 5 exist


async def test_cancel_releases_the_reservation(client, boss):
    product = await create_product(client, boss)
    await receive_stock(client, boss, product["id"], 10)
    so, _ = await create_so(client, boss, [(product["id"], 6)])
    await client.post(f"/sales-orders/{so['id']}/confirm", headers=boss)

    await client.post(f"/sales-orders/{so['id']}/cancel", headers=boss)
    assert (await stock_of(client, boss, product["id"]))["available"] == 10
    assert (await delivery_of(client, boss, so["id"]))["state"] == "cancelled"


async def test_delivery_splits_default_location_first(client, boss):
    product = await create_product(client, boss)
    warehouse = await main_warehouse(client, boss)
    shelf = await create_location(client, boss, "Shelf A", warehouse["id"])
    await receive_stock(client, boss, product["id"], 5)                          # → Stock (default)
    await receive_stock(client, boss, product["id"], 5, location_id=shelf["id"])  # → Shelf A

    so, _ = await create_so(client, boss, [(product["id"], 9)])
    await client.post(f"/sales-orders/{so['id']}/confirm", headers=boss)
    delivery = await delivery_of(client, boss, so["id"])
    response = await client.post(f"/transfers/{delivery['id']}/validate", json={}, headers=boss)
    assert response.status_code == 200

    picks = sorted((m["from_location_id"], Decimal(m["quantity"])) for m in response.json()["moves"])
    assert picks == sorted([(warehouse["default_location_id"], Decimal(5)), (shelf["id"], Decimal(4))])
    assert await stock_of(client, boss, product["id"]) == {
        "on_hand": Decimal(1), "reserved": Decimal(0), "available": Decimal(1),
    }
    assert (await client.get(f"/sales-orders/{so['id']}", headers=boss)).json()["state"] == "delivered"


async def test_chosen_location_must_hold_everything_and_nothing_moves_on_failure(client, boss):
    product = await create_product(client, boss)
    warehouse = await main_warehouse(client, boss)
    shelf = await create_location(client, boss, "Shelf A", warehouse["id"])
    await receive_stock(client, boss, product["id"], 5)
    await receive_stock(client, boss, product["id"], 1, location_id=shelf["id"])

    so, _ = await create_so(client, boss, [(product["id"], 3)])
    await client.post(f"/sales-orders/{so['id']}/confirm", headers=boss)
    delivery = await delivery_of(client, boss, so["id"])

    response = await client.post(
        f"/transfers/{delivery['id']}/validate", json={"location_id": shelf["id"]}, headers=boss
    )
    assert response.status_code == 409
    after = await delivery_of(client, boss, so["id"])
    assert after["state"] == "ready"
    assert after["moves"] == []
    assert (await stock_of(client, boss, product["id"]))["on_hand"] == 6


async def test_delivery_cannot_be_validated_twice(client, boss):
    product = await create_product(client, boss)
    await receive_stock(client, boss, product["id"], 10)
    so, _ = await create_so(client, boss, [(product["id"], 4)])
    await client.post(f"/sales-orders/{so['id']}/confirm", headers=boss)
    delivery = await delivery_of(client, boss, so["id"])

    first = await client.post(f"/transfers/{delivery['id']}/validate", json={}, headers=boss)
    second = await client.post(f"/transfers/{delivery['id']}/validate", json={}, headers=boss)
    assert first.status_code == 200
    assert second.status_code == 409
    assert (await stock_of(client, boss, product["id"]))["on_hand"] == 6  # not 2


async def test_sales_user_can_draft_but_not_confirm(client, boss, make_user):
    product = await create_product(client, boss)
    await receive_stock(client, boss, product["id"], 10)
    seller = auth(await make_user(sales_access=Access.user))
    so, _ = await create_so(client, seller, [(product["id"], 1)])

    response = await client.post(f"/sales-orders/{so['id']}/confirm", headers=seller)
    assert response.status_code == 403