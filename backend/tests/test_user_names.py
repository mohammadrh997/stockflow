from app.models.user import Access
from tests.helpers import auth, create_product, create_so, delivery_of, receive_stock


async def test_records_name_who_created_posted_validated_and_paid(client, make_user):
    everything = {f"{m}_access": Access.manager for m in ("sales", "purchase", "inventory")}
    sara = await make_user(name="Sara", **everything)
    ali = await make_user(name="Ali", sales_access=Access.manager)
    as_sara, as_ali = auth(sara), auth(ali)

    product = await create_product(client, as_sara)
    assert product["created_by"] == {"id": sara.id, "name": "Sara"}
    await receive_stock(client, as_sara, product["id"], 4)

    so, customer = await create_so(client, as_ali, [(product["id"], 4)])
    assert so["created_by"]["name"] == "Ali"
    assert customer["created_by"]["name"] == "Ali"
    await client.post(f"/sales-orders/{so['id']}/confirm", headers=as_ali)

    delivery = await delivery_of(client, as_sara, so["id"])
    assert delivery["validated_by"] is None
    response = await client.post(f"/transfers/{delivery['id']}/validate", json={}, headers=as_sara)
    assert response.json()["validated_by"]["name"] == "Sara"

    invoice = (
        await client.post("/invoices", json={"sales_order_id": so["id"]}, headers=as_ali)
    ).json()
    assert invoice["created_by"]["name"] == "Ali"
    assert invoice["posted_by"] is None
    await client.post(f"/invoices/{invoice['id']}/post", json={}, headers=as_sara)
    response = await client.post(
        f"/invoices/{invoice['id']}/payments",
        json={"amount": "10.00", "paid_on": "2026-11-09"},
        headers=as_sara,
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["posted_by"]["name"] == "Sara"
    assert body["payments"][0]["created_by"]["name"] == "Sara"
