from app.models.user import Access
from tests.helpers import auth

CHAIR = {"name": "Chair", "sku": "  chr-001 ", "sale_price": "50.00", "cost_price": "30.00"}


# ---------- products ----------


async def test_products_require_login(client):
    assert (await client.get("/products")).status_code == 401


async def test_any_user_can_list_but_only_inventory_manager_can_create(client, make_user):
    worker = await make_user(inventory_access=Access.user)
    assert (await client.get("/products", headers=auth(worker))).status_code == 200
    assert (await client.post("/products", json=CHAIR, headers=auth(worker))).status_code == 403


async def test_create_product_normalizes_sku_and_sets_creator(client, make_user):
    manager = await make_user(inventory_access=Access.manager)
    response = await client.post(
        "/products", json={**CHAIR, "created_by_id": 9999}, headers=auth(manager)
    )
    assert response.status_code == 201
    body = response.json()
    assert body["sku"] == "CHR-001"
    assert body["created_by_id"] == manager.id


async def test_duplicate_sku_is_rejected(client, make_user):
    manager = await make_user(inventory_access=Access.manager)
    await client.post("/products", json=CHAIR, headers=auth(manager))
    response = await client.post(
        "/products", json={**CHAIR, "sku": "CHR-001"}, headers=auth(manager)
    )
    assert response.status_code == 409


async def test_invalid_prices_are_rejected(client, make_user):
    manager = await make_user(inventory_access=Access.manager)
    negative = await client.post(
        "/products", json={**CHAIR, "sale_price": "-1"}, headers=auth(manager)
    )
    too_precise = await client.post(
        "/products", json={**CHAIR, "sale_price": "12.999"}, headers=auth(manager)
    )
    assert negative.status_code == 422
    assert too_precise.status_code == 422


async def test_archived_products_are_hidden_by_default(client, make_user):
    manager = await make_user(inventory_access=Access.manager)
    product = (await client.post("/products", json=CHAIR, headers=auth(manager))).json()
    await client.post(f"/products/{product['id']}/archive", headers=auth(manager))

    default = (await client.get("/products", headers=auth(manager))).json()
    everything = (await client.get("/products?include_archived=true", headers=auth(manager))).json()
    assert product["id"] not in [p["id"] for p in default]
    assert product["id"] in [p["id"] for p in everything]


# ---------- partners ----------


async def test_any_user_can_read_partners_but_only_sales_or_purchase_can_write(client, make_user):
    worker = await make_user(inventory_access=Access.user)
    assert (await client.get("/partners", headers=auth(worker))).status_code == 200
    response = await client.post("/partners", json={"name": "Acme"}, headers=auth(worker))
    assert response.status_code == 403


async def test_purchase_user_can_create_partner(client, make_user):
    buyer = await make_user(purchase_access=Access.user)
    response = await client.post(
        "/partners", json={"name": "Acme", "is_supplier": True}, headers=auth(buyer)
    )
    assert response.status_code == 201
    assert response.json()["is_supplier"] is True


async def test_partner_null_clears_optional_fields_but_not_name(client, make_user):
    seller = await make_user(sales_access=Access.user)
    partner = (
        await client.post(
            "/partners", json={"name": "Acme", "phone": "+964 770 000 0000"}, headers=auth(seller)
        )
    ).json()

    response = await client.patch(
        f"/partners/{partner['id']}", json={"phone": None, "name": None}, headers=auth(seller)
    )
    assert response.status_code == 200
    assert response.json()["phone"] is None
    assert response.json()["name"] == "Acme"


async def test_partner_filters(client, make_user):
    seller = await make_user(sales_access=Access.user)
    await client.post(
        "/partners", json={"name": "Customer Co", "is_customer": True}, headers=auth(seller)
    )
    await client.post(
        "/partners", json={"name": "Supplier Co", "is_supplier": True}, headers=auth(seller)
    )

    customers = (await client.get("/partners?is_customer=true", headers=auth(seller))).json()
    assert [p["name"] for p in customers] == ["Customer Co"]
