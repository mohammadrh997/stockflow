from app.services import purchase as purchase_service
from tests.helpers import create_partner, create_product, create_so, receive_stock


async def new_po(client, headers, supplier_id, product_id, reference=None, quantity="4"):
    body = {
        "partner_id": supplier_id,
        "lines": [{"product_id": product_id, "quantity": quantity}],
    }
    if reference is not None:
        body["partner_reference"] = reference
    return await client.post("/purchase-orders", json=body, headers=headers)


async def receive(client, headers, po_id, quantity=None):
    await client.post(f"/purchase-orders/{po_id}/confirm", headers=headers)
    receipt = (await client.get(f"/transfers?purchase_order_id={po_id}", headers=headers)).json()
    ready = next(t for t in receipt if t["state"] == "ready")
    body = {}
    if quantity is not None:
        body["lines"] = [{"line_id": ready["lines"][0]["id"], "quantity": quantity}]
    await client.post(f"/transfers/{ready['id']}/validate", json=body, headers=headers)


async def bill(client, headers, po_id):
    response = await client.post("/invoices", json={"purchase_order_id": po_id}, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


async def test_orders_keep_the_suppliers_reference(client, boss):
    supplier = await create_partner(client, boss, name="Acme", is_supplier=True)
    product = await create_product(client, boss)

    response = await new_po(client, boss, supplier["id"], product["id"], "  INV-1001 ")
    assert response.status_code == 201, response.text
    po = response.json()
    assert po["partner_reference"] == "INV-1001"  # trimmed

    url = f"/purchase-orders/{po['id']}"
    patched = await client.patch(url, json={"partner_reference": "INV-1002"}, headers=boss)
    assert patched.json()["partner_reference"] == "INV-1002"
    cleared = await client.patch(url, json={"partner_reference": None}, headers=boss)
    assert cleared.json()["partner_reference"] is None
    blank = await client.patch(url, json={"partner_reference": "   "}, headers=boss)
    assert blank.json()["partner_reference"] is None  # empty means none


async def test_a_supplier_reference_can_be_used_once(client, boss):
    acme = await create_partner(client, boss, name="Acme", is_supplier=True)
    other = await create_partner(client, boss, name="Other", is_supplier=True)
    third = await create_partner(client, boss, name="Third", is_supplier=True)
    product = await create_product(client, boss)
    first = (await new_po(client, boss, acme["id"], product["id"], "INV-1001")).json()

    response = await new_po(client, boss, acme["id"], product["id"], "inv-1001")  # any case
    assert response.status_code == 409
    assert first["reference"] in response.json()["detail"]

    # another supplier may use the same number
    assert (await new_po(client, boss, other["id"], product["id"], "INV-1001")).status_code == 201

    # moving an order to a supplier that already has the number is refused too
    moved = (await new_po(client, boss, third["id"], product["id"], "inv-1001")).json()
    response = await client.patch(
        f"/purchase-orders/{moved['id']}", json={"partner_id": acme["id"]}, headers=boss
    )
    assert response.status_code == 409

    # cancelling the first order frees the number
    await client.post(f"/purchase-orders/{first['id']}/cancel", headers=boss)
    assert (await new_po(client, boss, acme["id"], product["id"], "INV-1001")).status_code == 201


async def test_the_database_refuses_a_duplicate_that_slips_past_the_check(
    client, boss, monkeypatch
):
    # Two requests at the same moment can both pass the check before either is saved.
    # Turning the check off stands in for that: the unique index must still refuse.
    async def no_check(db, order):
        pass

    monkeypatch.setattr(purchase_service, "_ensure_reference_free", no_check)
    supplier = await create_partner(client, boss, name="Acme", is_supplier=True)
    product = await create_product(client, boss)

    assert (await new_po(client, boss, supplier["id"], product["id"], "INV-7")).status_code == 201
    response = await new_po(client, boss, supplier["id"], product["id"], "inv-7")
    assert response.status_code == 409
    assert response.json()["detail"] == "this supplier's reference inv-7 is already in use"


async def test_a_bill_takes_the_orders_reference_once(client, boss):
    supplier = await create_partner(client, boss, name="Acme", is_supplier=True)
    product = await create_product(client, boss, cost_price="10.00")
    po = (await new_po(client, boss, supplier["id"], product["id"], "INV-1001")).json()

    await receive(client, boss, po["id"], quantity="1")  # part of it arrived
    first = await bill(client, boss, po["id"])
    assert first["partner_reference"] == "INV-1001"

    receipt = await client.get(f"/transfers?purchase_order_id={po['id']}", headers=boss)
    backorder = next(t for t in receipt.json() if t["state"] == "ready")
    await client.post(f"/transfers/{backorder['id']}/validate", json={}, headers=boss)
    second = await bill(client, boss, po["id"])
    assert second["partner_reference"] is None  # the rest comes with a bill of its own


async def test_draft_bills_can_change_their_reference(client, boss):
    supplier = await create_partner(client, boss, name="Acme", is_supplier=True)
    product = await create_product(client, boss)
    first_po = (await new_po(client, boss, supplier["id"], product["id"])).json()
    second_po = (await new_po(client, boss, supplier["id"], product["id"])).json()
    for po in (first_po, second_po):
        await receive(client, boss, po["id"])
    first = await bill(client, boss, first_po["id"])
    second = await bill(client, boss, second_po["id"])

    url = f"/invoices/{first['id']}"
    response = await client.patch(url, json={"partner_reference": "INV-9"}, headers=boss)
    assert response.status_code == 200, response.text
    assert response.json()["partner_reference"] == "INV-9"

    response = await client.patch(
        f"/invoices/{second['id']}", json={"partner_reference": "inv-9"}, headers=boss
    )
    assert response.status_code == 409
    assert f"draft bill {first['id']}" in response.json()["detail"]

    await client.post(f"{url}/post", json={}, headers=boss)
    response = await client.patch(url, json={"partner_reference": "INV-10"}, headers=boss)
    assert response.status_code == 409  # posted: fixed


async def test_customer_invoices_have_no_vendor_reference(client, boss):
    product = await create_product(client, boss)
    await receive_stock(client, boss, product["id"], 2)
    so, _ = await create_so(client, boss, [(product["id"], 1)])
    await client.post(f"/sales-orders/{so['id']}/confirm", headers=boss)
    delivery = (await client.get(f"/transfers?sales_order_id={so['id']}", headers=boss)).json()
    await client.post(f"/transfers/{delivery[0]['id']}/validate", json={}, headers=boss)
    invoice = (
        await client.post("/invoices", json={"sales_order_id": so["id"]}, headers=boss)
    ).json()

    response = await client.patch(
        f"/invoices/{invoice['id']}", json={"partner_reference": "X"}, headers=boss
    )
    assert response.status_code == 422
