from tests.helpers import create_partner, create_product, create_so, receive_stock


async def test_lists_send_the_total_of_every_match_not_just_the_page(client, boss):
    for i in range(3):
        await create_product(client, boss, sku=f"P-{i}")

    response = await client.get("/products?limit=2", headers=boss)
    assert len(response.json()) == 2
    assert response.headers["x-total-count"] == "3"

    response = await client.get("/products?skip=2&limit=2", headers=boss)
    assert len(response.json()) == 1
    assert response.headers["x-total-count"] == "3"

    # the total follows the filters
    response = await client.get("/products?name=P-1", headers=boss)
    assert response.headers["x-total-count"] == "1"


async def test_every_paginated_list_sends_a_total(client, boss):
    for path in (
        "/products",
        "/partners",
        "/sales-orders",
        "/purchase-orders",
        "/invoices",
        "/transfers",
    ):
        response = await client.get(path, headers=boss)
        assert response.status_code == 200, path
        assert response.headers["x-total-count"] == str(len(response.json())), path


async def test_partners_with_the_same_name_page_without_repeats(client, boss):
    for _ in range(5):
        await create_partner(client, boss, name="Same")

    first = (await client.get("/partners?limit=3", headers=boss)).json()
    second = (await client.get("/partners?skip=3&limit=3", headers=boss)).json()
    ids = [p["id"] for p in first + second]
    assert sorted(ids) == sorted(set(ids)) and len(ids) == 5


async def test_order_lists_filter_by_product(client, boss):
    chair = await create_product(client, boss, sku="CHAIR")
    desk = await create_product(client, boss, sku="DESK")
    await receive_stock(client, boss, chair["id"], 5)
    await receive_stock(client, boss, desk["id"], 5)

    both, _ = await create_so(client, boss, [(chair["id"], 1), (desk["id"], 1)])
    desk_only, _ = await create_so(client, boss, [(desk["id"], 1)])

    response = await client.get(f"/sales-orders?product_id={chair['id']}", headers=boss)
    assert [o["id"] for o in response.json()] == [both["id"]]
    assert response.headers["x-total-count"] == "1"

    response = await client.get(f"/sales-orders?product_id={desk['id']}", headers=boss)
    assert [o["id"] for o in response.json()] == [both["id"], desk_only["id"]]

    # receive_stock made one purchase order per product
    response = await client.get(f"/purchase-orders?product_id={chair['id']}", headers=boss)
    orders = response.json()
    assert len(orders) == 1
    assert {line["product_id"] for line in orders[0]["lines"]} == {chair["id"]}
