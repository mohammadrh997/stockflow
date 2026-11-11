from app.models.user import Access
from tests.helpers import (
    auth,
    create_location,
    create_product,
    create_so,
    main_warehouse,
    receive_stock,
)


async def all_pages(client, headers, query, limit):
    moves, cursor, pages = [], None, 0
    while True:
        url = f"/moves?{query}&limit={limit}" + (f"&before={cursor}" if cursor else "")
        response = await client.get(url, headers=headers)
        assert response.status_code == 200, response.text
        page = response.json()
        moves += page["items"]
        pages += 1
        cursor = page["next_cursor"]
        if cursor is None:
            return moves, pages


async def test_each_kind_of_move_is_labelled(client, boss):
    product = await create_product(client, boss)
    warehouse = await main_warehouse(client, boss)
    stock = warehouse["default_location_id"]
    shelf = await create_location(client, boss, "Shelf", warehouse["id"])

    await receive_stock(client, boss, product["id"], 10)  # in +10
    so, _ = await create_so(client, boss, [(product["id"], 2)])
    await client.post(f"/sales-orders/{so['id']}/confirm", headers=boss)
    delivery = (await client.get(f"/transfers?sales_order_id={so['id']}", headers=boss)).json()
    await client.post(f"/transfers/{delivery[0]['id']}/validate", json={}, headers=boss)  # out -2
    await client.post(
        "/transfers/internal",
        json={
            "from_location_id": stock,
            "to_location_id": shelf["id"],
            "lines": [{"product_id": product["id"], "quantity": "1"}],
        },
        headers=boss,
    )  # internal, 7 left in stock
    for counted in ("9", "4"):  # counted up +2, then down -5
        response = await client.post(
            "/transfers/adjustments",
            json={
                "location_id": stock,
                "lines": [{"product_id": product["id"], "counted_quantity": counted}],
                "note": "count",
            },
            headers=boss,
        )
        assert response.status_code == 201, response.text

    page = (await client.get(f"/moves?product_id={product['id']}", headers=boss)).json()
    assert page["next_cursor"] is None
    labels = [(m["kind"], m["direction"], m["quantity"]) for m in page["items"]]
    assert labels == [  # newest first
        ("count", -1, "5.000"),
        ("count", 1, "2.000"),
        ("internal", 0, "1.000"),
        ("out", -1, "2.000"),
        ("in", 1, "10.000"),
    ]
    newest = page["items"][0]
    assert newest["transfer"]["reference"]
    assert newest["created_by"]["name"]
    assert newest["to_location"]["name"]


async def test_pages_follow_the_cursor_without_gaps_or_repeats(client, boss):
    product = await create_product(client, boss, sku="A")
    other = await create_product(client, boss, sku="B")
    for _ in range(5):
        await receive_stock(client, boss, product["id"], 1)
    await receive_stock(client, boss, other["id"], 1)

    moves, pages = await all_pages(client, boss, f"product_id={product['id']}", limit=2)
    ids = [m["id"] for m in moves]
    assert pages == 3  # 2 + 2 + 1
    assert len(ids) == 5 and ids == sorted(set(ids), reverse=True)
    assert {m["product_id"] for m in moves} == {product["id"]}

    # without a product, every move
    moves, _ = await all_pages(client, boss, "", limit=4)
    assert len(moves) == 6


async def test_an_exact_last_page_says_there_is_no_next_one(client, boss):
    product = await create_product(client, boss)
    await receive_stock(client, boss, product["id"], 1)
    await receive_stock(client, boss, product["id"], 1)

    page = (await client.get(f"/moves?product_id={product['id']}&limit=2", headers=boss)).json()
    assert len(page["items"]) == 2 and page["next_cursor"] is None


async def test_moves_need_inventory_access(client, make_user):
    sales_only = auth(await make_user(sales_access=Access.manager))
    assert (await client.get("/moves", headers=sales_only)).status_code == 403
