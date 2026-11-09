import io

import pytest

try:
    import weasyprint  # noqa: F401
except OSError:  # Pango isn't installed (Windows dev machines); CI and Docker have it
    pytest.skip("WeasyPrint needs the Pango library", allow_module_level=True)

from pypdf import PdfReader

from app.models.user import Access
from tests.helpers import auth, create_partner, create_product, create_so, receive_stock


def pdf_text(response) -> str:
    assert response.status_code == 200, response.text
    assert response.headers["content-type"] == "application/pdf"
    assert response.content.startswith(b"%PDF")
    reader = PdfReader(io.BytesIO(response.content))
    text = " ".join(page.extract_text() for page in reader.pages)
    return " ".join(text.split())  # one space between words, whatever the line breaks


async def delivered_and_invoiced(client, headers, post=True):
    product = await create_product(client, headers, sale_price="50.00")
    await receive_stock(client, headers, product["id"], 4)
    so, _ = await create_so(client, headers, [(product["id"], 4)])
    await client.post(f"/sales-orders/{so['id']}/confirm", headers=headers)
    delivery = (await client.get(f"/transfers?sales_order_id={so['id']}", headers=headers)).json()
    await client.post(f"/transfers/{delivery[0]['id']}/validate", json={}, headers=headers)
    invoice = (
        await client.post("/invoices", json={"sales_order_id": so["id"]}, headers=headers)
    ).json()
    if post:
        await client.post(f"/invoices/{invoice['id']}/post", json={}, headers=headers)
    return so, invoice


async def test_posted_invoice_pdf_has_the_number_lines_and_total(client, boss):
    so, invoice = await delivered_and_invoiced(client, boss)

    response = await client.get(f"/invoices/{invoice['id']}/pdf", headers=boss)
    text = pdf_text(response)

    assert 'filename="INV00001.pdf"' in response.headers["content-disposition"]
    for expected in ("Invoice", "INV00001", "CHR-001", "200.00", so["reference"], "ClearCypher"):
        assert expected in text
    assert "DRAFT" not in text


async def test_draft_invoice_prints_with_a_watermark_and_no_number(client, boss):
    _, invoice = await delivered_and_invoiced(client, boss, post=False)

    response = await client.get(f"/invoices/{invoice['id']}/pdf", headers=boss)
    text = pdf_text(response)

    assert (
        f'filename="draft-invoice-{invoice["id"]}.pdf"' in response.headers["content-disposition"]
    )
    assert "Draft invoice" in text and "DRAFT" in text
    assert "INV0" not in text
    assert "200.00" in text  # calculated from the lines, since nothing is stored yet


async def test_cancelled_invoice_cannot_be_printed(client, boss):
    _, invoice = await delivered_and_invoiced(client, boss, post=False)
    await client.post(f"/invoices/{invoice['id']}/cancel", headers=boss)

    response = await client.get(f"/invoices/{invoice['id']}/pdf", headers=boss)
    assert response.status_code == 409


async def test_vendor_bill_pdf(client, boss):
    product = await create_product(client, boss, cost_price="30.00")
    receipt = await receive_stock(client, boss, product["id"], 2)
    bill = (
        await client.post(
            "/invoices", json={"purchase_order_id": receipt["purchase_order_id"]}, headers=boss
        )
    ).json()
    await client.post(f"/invoices/{bill['id']}/post", json={}, headers=boss)

    text = pdf_text(await client.get(f"/invoices/{bill['id']}/pdf", headers=boss))
    assert "Vendor bill" in text and "BILL00001" in text and "60.00" in text


async def test_sales_order_prints_as_quotation_then_sales_order(client, boss):
    product = await create_product(client, boss)
    await receive_stock(client, boss, product["id"], 5)
    so, _ = await create_so(client, boss, [(product["id"], 2)])

    text = pdf_text(await client.get(f"/sales-orders/{so['id']}/pdf", headers=boss))
    assert "Quotation" in text and so["reference"] in text
    assert "DRAFT" not in text  # a quotation is meant to be sent

    await client.post(f"/sales-orders/{so['id']}/confirm", headers=boss)
    text = pdf_text(await client.get(f"/sales-orders/{so['id']}/pdf", headers=boss))
    assert "Sales order" in text


async def test_purchase_order_prints_as_rfq_then_purchase_order(client, boss):
    product = await create_product(client, boss)
    supplier = await create_partner(client, boss, name="Acme", is_supplier=True)
    po = (
        await client.post(
            "/purchase-orders",
            json={
                "partner_id": supplier["id"],
                "lines": [{"product_id": product["id"], "quantity": "3"}],
            },
            headers=boss,
        )
    ).json()

    text = pdf_text(await client.get(f"/purchase-orders/{po['id']}/pdf", headers=boss))
    assert "Request for quotation" in text and "Acme" in text

    await client.post(f"/purchase-orders/{po['id']}/confirm", headers=boss)
    text = pdf_text(await client.get(f"/purchase-orders/{po['id']}/pdf", headers=boss))
    assert "Purchase order" in text


async def test_cancelled_order_cannot_be_printed(client, boss):
    product = await create_product(client, boss)
    so, _ = await create_so(client, boss, [(product["id"], 1)])
    await client.post(f"/sales-orders/{so['id']}/cancel", headers=boss)

    response = await client.get(f"/sales-orders/{so['id']}/pdf", headers=boss)
    assert response.status_code == 409


async def test_arabic_partner_and_product_names_render(client, boss):
    customer = await create_partner(client, boss, name="شركة بغداد للتجارة", is_customer=True)
    product = await create_product(client, boss)
    await client.patch(f"/products/{product['id']}", json={"name": "كرسي مكتب"}, headers=boss)
    so = (
        await client.post(
            "/sales-orders",
            json={
                "partner_id": customer["id"],
                "lines": [{"product_id": product["id"], "quantity": "1"}],
            },
            headers=boss,
        )
    ).json()

    text = pdf_text(await client.get(f"/sales-orders/{so['id']}/pdf", headers=boss))
    assert "Quotation" in text  # rendered without errors; the Arabic is checked by eye


async def test_unknown_records_are_404_and_permissions_apply(client, boss, make_user):
    assert (await client.get("/invoices/999/pdf", headers=boss)).status_code == 404
    assert (await client.get("/sales-orders/999/pdf", headers=boss)).status_code == 404
    assert (await client.get("/purchase-orders/999/pdf", headers=boss)).status_code == 404

    so, invoice = await delivered_and_invoiced(client, boss)
    purchase_only = auth(await make_user(purchase_access=Access.manager))
    response = await client.get(f"/sales-orders/{so['id']}/pdf", headers=purchase_only)
    assert response.status_code == 403
    response = await client.get(f"/invoices/{invoice['id']}/pdf", headers=purchase_only)
    assert response.status_code == 403  # a customer invoice needs sales access