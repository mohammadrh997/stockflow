from app.models.user import Access
from tests.helpers import auth


async def manager_headers(make_user):
    return auth(await make_user(inventory_access=Access.manager))


async def test_bootstrap_creates_main_warehouse_and_virtual_locations(client, make_user):
    headers = auth(await make_user())
    warehouses = (await client.get("/warehouses", headers=headers)).json()
    assert [w["code"] for w in warehouses] == ["WH"]

    virtual = (await client.get("/locations?warehouse_id=", headers=headers)).status_code
    locations = (await client.get("/locations", headers=headers)).json()
    types = sorted(l["location_type"] for l in locations if l["warehouse_id"] is None)
    assert types == ["customer", "loss", "supplier"]


async def test_new_warehouse_gets_default_stock_location(client, make_user):
    headers = await manager_headers(make_user)
    created = await client.post("/warehouses", json={"name": "Erbil", "code": " erb "}, headers=headers)
    assert created.status_code == 201
    warehouse = created.json()
    assert warehouse["code"] == "ERB"

    detail = (await client.get(f"/warehouses/{warehouse['id']}", headers=headers)).json()
    assert [l["name"] for l in detail["locations"]] == ["Stock"]
    assert detail["default_location_id"] == detail["locations"][0]["id"]


async def test_duplicate_warehouse_code_is_rejected(client, make_user):
    headers = await manager_headers(make_user)
    response = await client.post("/warehouses", json={"name": "Another", "code": "wh"}, headers=headers)
    assert response.status_code == 409


async def test_cannot_archive_default_or_virtual_location(client, make_user):
    headers = await manager_headers(make_user)
    warehouse = (await client.get("/warehouses", headers=headers)).json()[0]
    locations = (await client.get("/locations", headers=headers)).json()
    supplier = next(l for l in locations if l["location_type"] == "supplier")

    default = await client.post(f"/locations/{warehouse['default_location_id']}/archive", headers=headers)
    virtual = await client.post(f"/locations/{supplier['id']}/archive", headers=headers)
    assert default.status_code == 409
    assert virtual.status_code == 409


async def test_default_location_must_belong_to_the_warehouse(client, make_user):
    headers = await manager_headers(make_user)
    main = (await client.get("/warehouses", headers=headers)).json()[0]
    erbil = (await client.post("/warehouses", json={"name": "Erbil", "code": "ERB"}, headers=headers)).json()

    response = await client.patch(
        f"/warehouses/{main['id']}",
        json={"default_location_id": erbil["default_location_id"]},
        headers=headers,
    )
    assert response.status_code == 400


async def test_location_names_are_unique_per_warehouse_only(client, make_user):
    headers = await manager_headers(make_user)
    main = (await client.get("/warehouses", headers=headers)).json()[0]
    erbil = (await client.post("/warehouses", json={"name": "Erbil", "code": "ERB"}, headers=headers)).json()

    first = await client.post("/locations", json={"name": "Shelf A", "warehouse_id": main["id"]}, headers=headers)
    same_warehouse = await client.post("/locations", json={"name": "Shelf A", "warehouse_id": main["id"]}, headers=headers)
    other_warehouse = await client.post("/locations", json={"name": "Shelf A", "warehouse_id": erbil["id"]}, headers=headers)

    assert first.status_code == 201
    assert same_warehouse.status_code == 409
    assert other_warehouse.status_code == 201


async def test_users_cannot_create_virtual_locations(client, make_user):
    headers = await manager_headers(make_user)
    main = (await client.get("/warehouses", headers=headers)).json()[0]
    response = await client.post(
        "/locations",
        json={"name": "Fake Supplier", "warehouse_id": main["id"], "location_type": "supplier"},
        headers=headers,
    )
    assert response.status_code == 201
    assert response.json()["location_type"] == "internal"


async def test_location_in_unknown_warehouse_is_400(client, make_user):
    headers = await manager_headers(make_user)
    response = await client.post("/locations", json={"name": "Shelf", "warehouse_id": 9999}, headers=headers)
    assert response.status_code == 400