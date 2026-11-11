import asyncio
from collections import Counter

from app.models.user import Access
from tests.helpers import auth, create_product, receive_stock


async def new_category(client, headers, name, parent=None):
    response = await client.post(
        "/categories", json={"name": name, "parent_id": parent and parent["id"]}, headers=headers
    )
    assert response.status_code == 201, response.text
    return response.json()


async def move(client, headers, category, parent):
    return await client.patch(
        f"/categories/{category['id']}",
        json={"parent_id": parent and parent["id"]},
        headers=headers,
    )


async def test_the_tree_lists_with_full_paths_and_anyone_can_read_it(client, boss, make_user):
    furniture = await new_category(client, boss, "Furniture")
    chairs = await new_category(client, boss, "Chairs", furniture)
    await new_category(client, boss, "Office chairs", chairs)
    await new_category(client, boss, "Electronics")

    someone = auth(await make_user())  # no module access at all
    response = await client.get("/categories", headers=someone)
    assert response.status_code == 200, response.text
    assert [(c["path"], c["depth"]) for c in response.json()] == [
        ("Electronics", 1),
        ("Furniture", 1),
        ("Furniture / Chairs", 2),
        ("Furniture / Chairs / Office chairs", 3),
    ]


async def test_only_inventory_managers_change_categories(client, make_user):
    inventory_user = auth(await make_user(inventory_access=Access.user))
    response = await client.post("/categories", json={"name": "Furniture"}, headers=inventory_user)
    assert response.status_code == 403


async def test_names_are_unique_among_siblings_ignoring_case(client, boss):
    furniture = await new_category(client, boss, "Furniture")
    outdoor = await new_category(client, boss, "Outdoor")
    await new_category(client, boss, "Chairs", furniture)

    for name, parent in (("Chairs", furniture), ("chairs", furniture), ("FURNITURE", None)):
        response = await client.post(
            "/categories",
            json={"name": name, "parent_id": parent and parent["id"]},
            headers=boss,
        )
        assert response.status_code == 409, (name, response.text)

    await new_category(client, boss, "Chairs", outdoor)  # same name, different parent: fine


async def test_a_category_cannot_move_under_itself_or_its_subcategories(client, boss):
    furniture = await new_category(client, boss, "Furniture")
    chairs = await new_category(client, boss, "Chairs", furniture)

    assert (await move(client, boss, furniture, furniture)).status_code == 409
    response = await move(client, boss, furniture, chairs)
    assert response.status_code == 409
    assert "own subcategories" in response.json()["detail"]

    response = await move(client, boss, chairs, None)  # to the top level
    assert response.status_code == 200 and response.json()["path"] == "Chairs"


async def test_categories_nest_five_levels_at_most(client, boss):
    parent = None
    chain = []
    for level in range(1, 6):
        parent = await new_category(client, boss, f"Level {level}", parent)
        chain.append(parent)

    response = await client.post(
        "/categories", json={"name": "Level 6", "parent_id": chain[-1]["id"]}, headers=boss
    )
    assert response.status_code == 409

    # Moving a two-level branch under level 4 would also reach six levels
    branch = await new_category(client, boss, "Branch")
    await new_category(client, boss, "Leaf", branch)
    assert (await move(client, boss, branch, chain[3])).status_code == 409
    assert (await move(client, boss, branch, chain[2])).status_code == 200  # five: fine


async def test_concurrent_moves_cannot_make_a_loop(client, boss):
    a = await new_category(client, boss, "A")
    b = await new_category(client, boss, "B")

    # Each move is fine on its own; together they'd make A and B each other's parent
    responses = await asyncio.gather(move(client, boss, a, b), move(client, boss, b, a))

    assert Counter(r.status_code for r in responses) == {200: 1, 409: 1}


async def test_products_filter_by_category_with_or_without_subcategories(client, boss):
    furniture = await new_category(client, boss, "Furniture")
    chairs = await new_category(client, boss, "Chairs", furniture)
    desk = await create_product(client, boss, sku="DSK-001", category_id=furniture["id"])
    chair = await create_product(client, boss, sku="CHR-001", category_id=chairs["id"])
    await create_product(client, boss, sku="LMP-001")  # no category

    async def skus(**query):
        response = await client.get("/products", params=query, headers=boss)
        assert response.status_code == 200, response.text
        return {p["sku"] for p in response.json()}

    assert await skus(category_id=furniture["id"]) == {"DSK-001"}
    assert await skus(category_id=furniture["id"], include_subcategories=True) == {
        "DSK-001",
        "CHR-001",
    }

    # null removes the category; other fields left out stay as they are
    response = await client.patch(
        f"/products/{chair['id']}", json={"category_id": None}, headers=boss
    )
    assert response.json()["category_id"] is None and response.json()["sku"] == "CHR-001"
    assert desk["category_id"] == furniture["id"]


async def test_stock_report_filters_by_category(client, boss):
    furniture = await new_category(client, boss, "Furniture")
    chairs = await new_category(client, boss, "Chairs", furniture)
    chair = await create_product(client, boss, sku="CHR-001", category_id=chairs["id"])
    lamp = await create_product(client, boss, sku="LMP-001")
    await receive_stock(client, boss, chair["id"], 5)
    await receive_stock(client, boss, lamp["id"], 3)

    async def report(**query):
        response = await client.get("/stock", params=query, headers=boss)
        assert response.status_code == 200, response.text
        return [row["sku"] for row in response.json()]

    assert await report(category_id=furniture["id"]) == []
    assert await report(category_id=furniture["id"], include_subcategories=True) == ["CHR-001"]


async def test_archiving_rules(client, boss):
    furniture = await new_category(client, boss, "Furniture")
    chairs = await new_category(client, boss, "Chairs", furniture)
    chair = await create_product(client, boss, sku="CHR-001", category_id=chairs["id"])

    async def archive(category):
        return await client.post(f"/categories/{category['id']}/archive", headers=boss)

    response = await archive(furniture)
    assert response.status_code == 409 and "subcategories" in response.json()["detail"]
    response = await archive(chairs)
    assert response.status_code == 409 and "products" in response.json()["detail"]

    # An archived product doesn't hold its category back
    await client.post(f"/products/{chair['id']}/archive", headers=boss)
    assert (await archive(chairs)).status_code == 200
    assert (await archive(furniture)).status_code == 200

    # An archived category can't be given to products, and its products can't come back
    response = await client.patch(
        f"/products/{chair['id']}", json={"category_id": chairs["id"]}, headers=boss
    )
    assert response.status_code == 400
    response = await client.post(f"/products/{chair['id']}/unarchive", headers=boss)
    assert response.status_code == 409

    # A subcategory can't come back while its parent is archived
    response = await client.post(f"/categories/{chairs['id']}/unarchive", headers=boss)
    assert response.status_code == 409 and "parent" in response.json()["detail"]

    listed = (await client.get("/categories", headers=boss)).json()
    assert listed == []  # archived ones are hidden unless asked for
    listed = (await client.get("/categories?include_archived=true", headers=boss)).json()
    assert len(listed) == 2
