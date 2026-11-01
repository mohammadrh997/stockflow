import asyncio
from collections import Counter
from decimal import Decimal

from tests.helpers import (
    create_location,
    create_product,
    create_so,
    delivery_of,
    main_warehouse,
    receive_stock,
    stock_of,
)


async def test_concurrent_confirmations_never_oversell(client, boss):
    product = await create_product(client, boss)
    await receive_stock(client, boss, product["id"], 10)
    orders = [(await create_so(client, boss, [(product["id"], 3)]))[0] for _ in range(5)]

    responses = await asyncio.gather(
        *(client.post(f"/sales-orders/{o['id']}/confirm", headers=boss) for o in orders)
    )

    assert Counter(r.status_code for r in responses) == {200: 3, 409: 2}
    assert await stock_of(client, boss, product["id"]) == {
        "on_hand": Decimal(10),
        "reserved": Decimal(9),
        "available": Decimal(1),
    }


async def test_concurrent_delivery_validations_move_stock_once(client, boss):
    product = await create_product(client, boss)
    await receive_stock(client, boss, product["id"], 10)
    so, _ = await create_so(client, boss, [(product["id"], 4)])
    await client.post(f"/sales-orders/{so['id']}/confirm", headers=boss)
    delivery = await delivery_of(client, boss, so["id"])

    responses = await asyncio.gather(
        *(
            client.post(f"/transfers/{delivery['id']}/validate", json={}, headers=boss)
            for _ in range(3)
        )
    )

    assert Counter(r.status_code for r in responses) == {200: 1, 409: 2}
    assert (await stock_of(client, boss, product["id"]))["on_hand"] == 6


async def test_concurrent_receipt_validations_add_stock_once(client, boss):
    product = await create_product(client, boss)
    supplier = (await client.post("/partners", json={"name": "Acme"}, headers=boss)).json()
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
    transfers = (await client.get("/transfers?transfer_type=receipt", headers=boss)).json()
    receipt = next(t for t in transfers if t["purchase_order_id"] == po["id"])

    responses = await asyncio.gather(
        *(
            client.post(f"/transfers/{receipt['id']}/validate", json={}, headers=boss)
            for _ in range(3)
        )
    )

    assert Counter(r.status_code for r in responses) == {200: 1, 409: 2}
    assert (await stock_of(client, boss, product["id"]))["on_hand"] == 10  # not 30


async def test_opposite_product_order_does_not_deadlock(client, boss):
    chair = await create_product(client, boss, sku="CHR-001")
    table = await create_product(client, boss, sku="TBL-001")
    await receive_stock(client, boss, chair["id"], 10)
    await receive_stock(client, boss, table["id"], 10)
    first, _ = await create_so(client, boss, [(chair["id"], 1), (table["id"], 1)])
    second, _ = await create_so(client, boss, [(table["id"], 1), (chair["id"], 1)])

    responses = await asyncio.gather(
        client.post(f"/sales-orders/{first['id']}/confirm", headers=boss),
        client.post(f"/sales-orders/{second['id']}/confirm", headers=boss),
    )

    assert [r.status_code for r in responses] == [200, 200]


async def test_opposite_internal_transfers_do_not_deadlock(client, boss):
    product = await create_product(client, boss)
    warehouse = await main_warehouse(client, boss)
    stock = warehouse["default_location_id"]
    shelf = await create_location(client, boss, "Shelf A", warehouse["id"])
    await receive_stock(client, boss, product["id"], 5)
    await receive_stock(client, boss, product["id"], 5, location_id=shelf["id"])

    def move(source, destination):
        return client.post(
            "/transfers/internal",
            json={
                "from_location_id": source,
                "to_location_id": destination,
                "lines": [{"product_id": product["id"], "quantity": "1"}],
            },
            headers=boss,
        )

    responses = await asyncio.gather(move(stock, shelf["id"]), move(shelf["id"], stock))
    assert [r.status_code for r in responses] == [201, 201]
