import io

from PIL import Image

from tests.helpers import auth, create_product, create_so, receive_stock


def logo_png(width=1200, height=600) -> bytes:
    out = io.BytesIO()
    Image.new("RGBA", (width, height), (232, 89, 12, 0)).save(out, "PNG")  # transparent
    return out.getvalue()


async def admin(make_user) -> dict[str, str]:
    return auth(await make_user(is_admin=True))


async def post_an_invoice(client, headers) -> None:
    product = await create_product(client, headers)
    await receive_stock(client, headers, product["id"], 1)
    so, _ = await create_so(client, headers, [(product["id"], 1)])
    await client.post(f"/sales-orders/{so['id']}/confirm", headers=headers)
    [delivery] = (await client.get(f"/transfers?sales_order_id={so['id']}", headers=headers)).json()
    await client.post(f"/transfers/{delivery['id']}/validate", json={}, headers=headers)
    invoice = (
        await client.post("/invoices", json={"sales_order_id": so["id"]}, headers=headers)
    ).json()
    response = await client.post(f"/invoices/{invoice['id']}/post", json={}, headers=headers)
    assert response.status_code == 200, response.text


async def test_a_new_install_starts_neutral_and_anyone_can_read_it(client, make_user):
    someone = auth(await make_user())  # no module access at all
    response = await client.get("/settings/company", headers=someone)
    assert response.status_code == 200, response.text
    assert response.json() == {
        "name": "My Company",
        "address": None,
        "phone": None,
        "email": None,
        "currency": "USD",
        "logo_url": None,
        "currency_locked": False,
    }


async def test_only_admins_can_change_it(client, boss, make_user):
    response = await client.patch("/settings/company", json={"name": "Sumer"}, headers=boss)
    assert response.status_code == 403  # a manager everywhere, but not an admin

    response = await client.patch(
        "/settings/company",
        json={
            "name": "ClearCypher",
            "address": "Karrada\nBaghdad",
            "email": "Office@ClearCypher.example.com",
            "currency": " iqd ",
        },
        headers=await admin(make_user),
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["name"] == "ClearCypher"
    assert body["email"] == "office@clearcypher.example.com"
    assert body["currency"] == "IQD"


bad_values = (
    {"name": None},
    {"name": ""},
    {"currency": None},
    {"currency": "US"},
    {"currency": "XYZ"},  # three letters, but not a currency we offer
)


async def test_invalid_values_are_rejected_and_null_clears_optional_fields(client, make_user):
    headers = await admin(make_user)
    await client.patch("/settings/company", json={"phone": "+964 770 000 0000"}, headers=headers)

    for bad in bad_values:
        response = await client.patch("/settings/company", json=bad, headers=headers)
        assert response.status_code == 422, bad

    response = await client.patch("/settings/company", json={"phone": None}, headers=headers)
    assert response.json()["phone"] is None
    assert response.json()["name"] == "My Company"  # left out, so unchanged


async def test_the_currency_locks_once_an_invoice_is_issued(client, boss, make_user):
    headers = await admin(make_user)
    response = await client.patch("/settings/company", json={"currency": "IQD"}, headers=headers)
    assert response.status_code == 200  # nothing issued yet

    await post_an_invoice(client, boss)

    response = await client.patch("/settings/company", json={"currency": "EUR"}, headers=headers)
    assert response.status_code == 409
    assert "IQD" in response.json()["detail"]
    company = (await client.get("/settings/company", headers=headers)).json()
    assert company["currency"] == "IQD" and company["currency_locked"] is True

    # Resending the same currency, or changing other fields, is still fine
    response = await client.patch(
        "/settings/company", json={"currency": "IQD", "name": "Sumer"}, headers=headers
    )
    assert response.status_code == 200, response.text


async def test_logo_upload_replace_and_remove(client, storage, make_user):
    headers = await admin(make_user)

    response = await client.put(
        "/settings/company/logo",
        files={"file": ("logo.png", logo_png(), "image/png")},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    first = response.json()["logo_url"]
    [key] = storage.files
    assert key.startswith("products/company/") and first.endswith(key)
    logo = Image.open(io.BytesIO(storage.files[key]))
    assert logo.size == (400, 200)  # logos are kept small
    assert logo.mode == "RGBA"  # transparency survives

    response = await client.put(
        "/settings/company/logo",
        files={"file": ("logo.png", logo_png(), "image/png")},
        headers=headers,
    )
    assert response.json()["logo_url"] != first
    assert len(storage.files) == 1  # the old one was deleted

    response = await client.delete("/settings/company/logo", headers=headers)
    assert response.json()["logo_url"] is None
    assert storage.files == {}


async def test_logo_rules(client, storage, boss, make_user):
    files = {"file": ("logo.png", logo_png(), "image/png")}
    assert (
        await client.put("/settings/company/logo", files=files, headers=boss)
    ).status_code == 403

    fake = {"file": ("logo.png", b"not an image", "image/png")}
    response = await client.put(
        "/settings/company/logo", files=fake, headers=await admin(make_user)
    )
    assert response.status_code == 422
    assert storage.files == {}


async def test_logo_upload_answers_503_without_storage(client, make_user):
    files = {"file": ("logo.png", logo_png(), "image/png")}
    response = await client.put(
        "/settings/company/logo", files=files, headers=await admin(make_user)
    )
    assert response.status_code == 503
