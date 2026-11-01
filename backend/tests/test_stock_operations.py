from decimal import Decimal

from app.models.user import Access
from tests.helpers import (
    auth,
    create_location,
    create_product,
    main_warehouse,
    receive_stock,
    stock_of,
)


async def loss_location(client, headers):
    locations = (await client.get("/locations?location_type=loss", headers=headers)).json()
    return locations[0]


async def adjust(client, headers, location_id, product_id, counted, note="cycle count"):
    return await client.post(
        "/transfers/adjustments",
        json={
            "location_id": location_id,
            "lines": [{"product_id": product_id, "counted_quantity": str(counted)}],
            "note": note,
        },
        headers=headers,
    )


# ---------- internal transfers ----------


async def test_internal_transfer_moves_stock_between_shelves(client, boss):
    product = await create_product(client, boss)
    warehouse = await main_warehouse(client, boss)
    shelf = await create_location(client, boss, "Shelf A", warehouse["id"])
    await receive_stock(client, boss, product["id"], 5)

    response = await client.post(
        "/transfers/internal",
        json={
            "from_location_id": warehouse["default_location_id"],
            "to_location_id": shelf["id"],
            "lines": [{"product_id": product["id"], "quantity": "3"}],
        },
        headers=boss,
    )
    assert response.status_code == 201
    body = response.json()
    assert body["reference"] == "WH/INT/00001"
    assert body["state"] == "done"
    [move] = body["moves"]
    assert (move["from_location_id"], move["to_location_id"]) == (
        warehouse["default_location_id"],
        shelf["id"],
    )
    assert (await stock_of(client, boss, product["id"]))[
        "on_hand"
    ] == 5  # warehouse total unchanged


async def test_internal_transfer_needs_stock_at_the_source(client, boss):
    product = await create_product(client, boss)
    warehouse = await main_warehouse(client, boss)
    shelf = await create_location(client, boss, "Shelf A", warehouse["id"])
    await receive_stock(client, boss, product["id"], 2)

    response = await client.post(
        "/transfers/internal",
        json={
            "from_location_id": warehouse["default_location_id"],
            "to_location_id": shelf["id"],
            "lines": [
                {"product_id": product["id"], "quantity": "1"},
                {"product_id": product["id"], "quantity": "2"},
            ],
        },
        headers=boss,
    )
    assert response.status_code == 409  # 3 in total, only 2 at the source


async def test_internal_transfer_rejects_same_location_and_unknown_product(client, boss):
    product = await create_product(client, boss)
    warehouse = await main_warehouse(client, boss)
    stock = warehouse["default_location_id"]

    same = await client.post(
        "/transfers/internal",
        json={
            "from_location_id": stock,
            "to_location_id": stock,
            "lines": [{"product_id": product["id"], "quantity": "1"}],
        },
        headers=boss,
    )
    shelf = await create_location(client, boss, "Shelf A", warehouse["id"])
    unknown = await client.post(
        "/transfers/internal",
        json={
            "from_location_id": stock,
            "to_location_id": shelf["id"],
            "lines": [{"product_id": 9999, "quantity": "1"}],
        },
        headers=boss,
    )
    assert same.status_code == 400
    assert unknown.status_code == 400
    assert "9999" in unknown.json()["detail"]


async def test_done_transfers_cannot_be_validated(client, boss):
    product = await create_product(client, boss)
    warehouse = await main_warehouse(client, boss)
    shelf = await create_location(client, boss, "Shelf A", warehouse["id"])
    await receive_stock(client, boss, product["id"], 5)
    transfer = (
        await client.post(
            "/transfers/internal",
            json={
                "from_location_id": warehouse["default_location_id"],
                "to_location_id": shelf["id"],
                "lines": [{"product_id": product["id"], "quantity": "1"}],
            },
            headers=boss,
        )
    ).json()
    response = await client.post(f"/transfers/{transfer['id']}/validate", json={}, headers=boss)
    assert response.status_code == 409


# ---------- adjustments ----------


async def test_counting_less_moves_the_difference_to_loss(client, boss):
    product = await create_product(client, boss)
    warehouse = await main_warehouse(client, boss)
    loss = await loss_location(client, boss)
    await receive_stock(client, boss, product["id"], 5)

    response = await adjust(client, boss, warehouse["default_location_id"], product["id"], 3)
    assert response.status_code == 201
    body = response.json()
    assert body["reference"] == "WH/ADJ/00001"
    [move] = body["moves"]
    assert move["to_location_id"] == loss["id"]
    assert Decimal(move["quantity"]) == 2
    assert move["note"] == "cycle count"
    assert (await stock_of(client, boss, product["id"]))["on_hand"] == 3


async def test_counting_more_brings_the_difference_from_loss(client, boss):
    product = await create_product(client, boss)
    warehouse = await main_warehouse(client, boss)
    loss = await loss_location(client, boss)
    await receive_stock(client, boss, product["id"], 5)

    response = await adjust(client, boss, warehouse["default_location_id"], product["id"], 6)
    [move] = response.json()["moves"]
    assert move["from_location_id"] == loss["id"]
    assert Decimal(move["quantity"]) == 1
    assert (await stock_of(client, boss, product["id"]))["on_hand"] == 6


async def test_adjustment_records_opening_stock(client, boss):
    product = await create_product(client, boss)
    warehouse = await main_warehouse(client, boss)
    response = await adjust(
        client, boss, warehouse["default_location_id"], product["id"], 7, note="opening stock"
    )
    assert response.status_code == 201
    assert (await stock_of(client, boss, product["id"]))["on_hand"] == 7


async def test_matching_count_is_rejected(client, boss):
    product = await create_product(client, boss)
    warehouse = await main_warehouse(client, boss)
    await receive_stock(client, boss, product["id"], 5)
    response = await adjust(client, boss, warehouse["default_location_id"], product["id"], 5)
    assert response.status_code == 409


async def test_adjustment_input_rules(client, boss):
    product = await create_product(client, boss)
    warehouse = await main_warehouse(client, boss)
    location_id = warehouse["default_location_id"]

    duplicate = await client.post(
        "/transfers/adjustments",
        json={
            "location_id": location_id,
            "lines": [
                {"product_id": product["id"], "counted_quantity": "1"},
                {"product_id": product["id"], "counted_quantity": "2"},
            ],
            "note": "count",
        },
        headers=boss,
    )
    no_note = await client.post(
        "/transfers/adjustments",
        json={
            "location_id": location_id,
            "lines": [{"product_id": product["id"], "counted_quantity": "1"}],
        },
        headers=boss,
    )
    assert duplicate.status_code == 422
    assert no_note.status_code == 422


async def test_only_inventory_managers_can_adjust(client, boss, make_user):
    product = await create_product(client, boss)
    warehouse = await main_warehouse(client, boss)
    worker = auth(await make_user(inventory_access=Access.user))
    response = await adjust(client, worker, warehouse["default_location_id"], product["id"], 1)
    assert response.status_code == 403
