import io

from PIL import Image

from app.models.user import Access
from tests.helpers import auth, create_product


def image_file(width=1600, height=1200, fmt="JPEG", exif=None) -> bytes:
    out = io.BytesIO()
    Image.new("RGB", (width, height), "tomato").save(out, fmt, **({"exif": exif} if exif else {}))
    return out.getvalue()


async def upload(client, headers, product_id, data, name="photo.jpg", content_type="image/jpeg"):
    return await client.put(
        f"/products/{product_id}/image",
        files={"file": (name, data, content_type)},
        headers=headers,
    )


def stored(storage) -> Image.Image:
    [data] = storage.files.values()
    return Image.open(io.BytesIO(data))


async def test_upload_stores_a_small_webp_and_returns_its_url(client, boss, storage):
    product = await create_product(client, boss)
    assert product["image_url"] is None
    assert "image_key" not in product  # internal detail, clients only see the URL

    response = await upload(client, boss, product["id"], image_file(1600, 1200))
    assert response.status_code == 200, response.text
    url = response.json()["image_url"]

    [key] = storage.files
    assert url == f"https://images.test/{key}"
    assert key.startswith("products/") and key.endswith(".webp")
    image = stored(storage)
    assert image.format == "WEBP"
    assert image.size == (800, 600)  # longest side 800, proportions kept


async def test_rotation_is_applied_and_metadata_dropped(client, boss, storage):
    exif = Image.Exif()
    exif[0x0112] = 6  # orientation: "rotate 90°", as phones write it
    exif[0x010F] = "PhoneMaker"  # camera make, stands in for GPS and other metadata
    product = await create_product(client, boss)

    response = await upload(client, boss, product["id"], image_file(400, 200, exif=exif))
    assert response.status_code == 200, response.text

    image = stored(storage)
    assert image.size == (200, 400)  # turned upright
    assert not image.getexif()  # nothing carried over


async def test_replacing_deletes_the_old_file_and_changes_the_url(client, boss, storage):
    product = await create_product(client, boss)
    first = (await upload(client, boss, product["id"], image_file())).json()["image_url"]
    second = (await upload(client, boss, product["id"], image_file())).json()["image_url"]

    assert first != second  # a new name, so browsers don't show the cached old photo
    assert len(storage.files) == 1
    assert second.endswith(next(iter(storage.files)))


async def test_removing_the_image(client, boss, storage):
    product = await create_product(client, boss)
    await upload(client, boss, product["id"], image_file())

    response = await client.delete(f"/products/{product['id']}/image", headers=boss)
    assert response.status_code == 200, response.text
    assert response.json()["image_url"] is None
    assert storage.files == {}

    response = await client.delete(f"/products/{product['id']}/image", headers=boss)
    assert response.status_code == 200  # already gone is fine


async def test_files_that_are_not_allowed_images_are_rejected(client, boss, storage):
    product = await create_product(client, boss)
    pid = product["id"]

    fake = await upload(client, boss, pid, b"not an image at all", name="photo.png")
    gif = await upload(client, boss, pid, image_file(fmt="GIF"), name="a.gif")
    huge = await upload(client, boss, pid, b"\0" * (5 * 1024 * 1024 + 1))

    assert fake.status_code == 422
    assert gif.status_code == 422
    assert huge.status_code == 413
    assert storage.files == {}  # nothing was stored


async def test_unknown_product_and_permissions(client, boss, storage, make_user):
    assert (await upload(client, boss, 999, image_file())).status_code == 404

    product = await create_product(client, boss)
    inventory_user = auth(await make_user(inventory_access=Access.user))
    response = await upload(client, inventory_user, product["id"], image_file())
    assert response.status_code == 403
    assert storage.files == {}


async def test_uploads_answer_503_when_no_storage_is_configured(client, boss):
    product = await create_product(client, boss)
    response = await upload(client, boss, product["id"], image_file())
    assert response.status_code == 503
