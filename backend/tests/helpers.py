from datetime import UTC, datetime, timedelta
from decimal import Decimal

import jwt

from app.core.config import settings
from app.core.security import create_access_token
from app.models.user import User


def auth(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(str(user.id))}"}


def auth_issued_ago(user: User, seconds: int) -> dict[str, str]:
    issued = datetime.now(UTC) - timedelta(seconds=seconds)
    token = jwt.encode(
        {"sub": str(user.id), "iat": issued, "exp": issued + timedelta(minutes=30)},
        settings.secret_key,
        algorithm=settings.algorithm,
    )
    return {"Authorization": f"Bearer {token}"}


async def create_product(client, headers, sku="CHR-001", sale_price="50.00", cost_price="30.00"):
    response = await client.post(
        "/products",
        json={"name": sku, "sku": sku, "sale_price": sale_price, "cost_price": cost_price},
        headers=headers,
    )
    assert response.status_code == 201, response.text
    return response.json()


async def create_partner(client, headers, name="Partner", **flags):
    response = await client.post("/partners", json={"name": name, **flags}, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


async def main_warehouse(client, headers):
    return (await client.get("/warehouses", headers=headers)).json()[0]


async def create_location(client, headers, name, warehouse_id):
    response = await client.post(
        "/locations", json={"name": name, "warehouse_id": warehouse_id}, headers=headers
    )
    assert response.status_code == 201, response.text
    return response.json()


async def receive_stock(client, headers, product_id, quantity, location_id=None):
    supplier = await create_partner(client, headers, name="Supplier", is_supplier=True)
    po = (
        await client.post(
            "/purchase-orders",
            json={
                "partner_id": supplier["id"],
                "lines": [{"product_id": product_id, "quantity": str(quantity)}],
            },
            headers=headers,
        )
    ).json()
    await client.post(f"/purchase-orders/{po['id']}/confirm", headers=headers)
    transfers = (
        await client.get("/transfers?transfer_type=receipt&state=ready", headers=headers)
    ).json()
    receipt = next(t for t in transfers if t["purchase_order_id"] == po["id"])
    body = {"location_id": location_id} if location_id else {}
    response = await client.post(f"/transfers/{receipt['id']}/validate", json=body, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


async def stock_of(client, headers, product_id):
    rows = (await client.get(f"/stock?product_id={product_id}", headers=headers)).json()
    if not rows:
        return {"on_hand": Decimal("0"), "reserved": Decimal("0"), "available": Decimal("0")}
    row = rows[0]
    return {key: Decimal(row[key]) for key in ("on_hand", "reserved", "available")}


async def create_so(client, headers, lines):
    customer = await create_partner(client, headers, name="Customer")
    response = await client.post(
        "/sales-orders",
        json={
            "partner_id": customer["id"],
            "lines": [{"product_id": pid, "quantity": str(qty)} for pid, qty in lines],
        },
        headers=headers,
    )
    assert response.status_code == 201, response.text
    return response.json(), customer


async def delivery_of(client, headers, so_id):
    transfers = (await client.get("/transfers?transfer_type=delivery", headers=headers)).json()
    return next(t for t in transfers if t["sales_order_id"] == so_id)
