from app.models.user import Access
from tests.helpers import auth, auth_issued_ago

async def test_login_returns_token(client, make_user):
    await make_user(email="ali@example.com", password="password123")

    response = await client.post(
        "/auth/token", data={"username": "ali@example.com", "password": "password123"}
    )

    assert response.status_code == 200
    assert response.json()["token_type"] == "bearer"


async def test_me_returns_current_user(client, make_user):
    user = await make_user(sales_access=Access.manager)

    response = await client.get("/auth/me", headers=auth(user))

    assert response.status_code == 200
    assert response.json()["sales_access"] == "manager"

async def login(client, email, password):
    return await client.post("/auth/token", data={"username": email, "password": password})


async def test_login_wrong_password(client, make_user):
    await make_user(email="ali@example.com", password="password123")
    response = await login(client, "ali@example.com", "wrong-password")
    assert response.status_code == 401


async def test_login_unknown_email_looks_the_same(client, make_user):
    await make_user(email="ali@example.com", password="password123")
    wrong_password = await login(client, "ali@example.com", "wrong-password")
    unknown_email = await login(client, "nobody@example.com", "wrong-password")
    assert unknown_email.status_code == 401
    assert unknown_email.json() == wrong_password.json()


async def test_login_email_is_case_insensitive(client, make_user):
    await make_user(email="ali@example.com", password="password123")
    response = await login(client, "ALI@Example.com", "password123")
    assert response.status_code == 200


async def test_login_inactive_user(client, db, make_user):
    user = await make_user(email="ali@example.com", password="password123")
    user.is_active = False
    await db.commit()
    response = await login(client, "ali@example.com", "password123")
    assert response.status_code == 401


async def test_me_requires_token(client):
    response = await client.get("/auth/me")
    assert response.status_code == 401


async def test_deactivated_user_token_stops_working(client, db, make_user):
    user = await make_user()
    headers = auth(user)
    user.is_active = False
    await db.commit()
    response = await client.get("/auth/me", headers=headers)
    assert response.status_code == 401


async def test_password_change_rejects_old_tokens(client, make_user):
    user = await make_user(password="password123")
    old_headers = auth_issued_ago(user, seconds=60)

    response = await client.post(
        "/auth/me/password",
        json={"current_password": "password123", "new_password": "new-password-456"},
        headers=old_headers,
    )
    assert response.status_code == 200
    new_headers = {"Authorization": f"Bearer {response.json()['access_token']}"}

    assert (await client.get("/auth/me", headers=old_headers)).status_code == 401
    assert (await client.get("/auth/me", headers=new_headers)).status_code == 200


async def test_password_change_wrong_current_password(client, make_user):
    user = await make_user(password="password123")
    response = await client.post(
        "/auth/me/password",
        json={"current_password": "wrong-password", "new_password": "new-password-456"},
        headers=auth(user),
    )
    assert response.status_code == 400


async def test_password_change_to_same_password(client, make_user):
    user = await make_user(password="password123")
    response = await client.post(
        "/auth/me/password",
        json={"current_password": "password123", "new_password": "password123"},
        headers=auth(user),
    )
    assert response.status_code == 422


async def test_update_me_cannot_change_permissions(client, make_user):
    user = await make_user()
    response = await client.patch(
        "/auth/me", json={"name": "New Name", "is_admin": True}, headers=auth(user)
    )
    assert response.status_code == 200
    assert response.json()["name"] == "New Name"
    assert response.json()["is_admin"] is False

async def test_login_is_rate_limited(client, make_user):
    await make_user(email="ali@example.com", password="password123")
    statuses = [(await login(client, "ali@example.com", "wrong")).status_code for _ in range(6)]
    assert statuses == [401, 401, 401, 401, 401, 429]