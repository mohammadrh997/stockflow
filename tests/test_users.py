from tests.helpers import auth, auth_issued_ago


async def test_non_admin_cannot_create_users(client, make_user):
    user = await make_user()
    response = await client.post(
        "/users",
        json={"email": "new@example.com", "name": "New", "password": "password123"},
        headers=auth(user),
    )
    assert response.status_code == 403


async def test_admin_creates_user_with_named_access_levels(client, make_user):
    admin = await make_user(is_admin=True)
    response = await client.post(
        "/users",
        json={
            "email": "Sara@Example.com",
            "name": "Sara",
            "password": "password123",
            "sales_access": "manager",
        },
        headers=auth(admin),
    )
    assert response.status_code == 201
    body = response.json()
    assert body["email"] == "sara@example.com"
    assert body["sales_access"] == "manager"
    assert body["purchase_access"] == "none"
    assert "hashed_password" not in body


async def test_duplicate_email_is_rejected_case_insensitively(client, make_user):
    admin = await make_user(is_admin=True)
    await make_user(email="sara@example.com")
    response = await client.post(
        "/users",
        json={"email": "SARA@example.com", "name": "Other", "password": "password123"},
        headers=auth(admin),
    )
    assert response.status_code == 409


async def test_unknown_access_level_is_rejected(client, make_user):
    admin = await make_user(is_admin=True)
    response = await client.post(
        "/users",
        json={"email": "x@example.com", "name": "X", "password": "password123", "sales_access": "boss"},
        headers=auth(admin),
    )
    assert response.status_code == 422


async def test_admin_cannot_remove_own_admin_flag(client, make_user):
    admin = await make_user(is_admin=True)
    response = await client.patch(f"/users/{admin.id}", json={"is_admin": False}, headers=auth(admin))
    assert response.status_code == 400


async def test_admin_cannot_deactivate_self(client, make_user):
    admin = await make_user(is_admin=True)
    response = await client.post(f"/users/{admin.id}/deactivate", headers=auth(admin))
    assert response.status_code == 400


async def test_deactivated_user_is_locked_out(client, make_user):
    admin = await make_user(is_admin=True)
    user = await make_user()
    user_headers = auth(user)

    response = await client.post(f"/users/{user.id}/deactivate", headers=auth(admin))
    assert response.status_code == 200
    assert response.json()["is_active"] is False
    assert (await client.get("/auth/me", headers=user_headers)).status_code == 401


async def test_reset_password_ends_old_sessions(client, make_user):
    admin = await make_user(is_admin=True)
    user = await make_user(email="sara@example.com", password="password123")
    old_headers = auth_issued_ago(user, seconds=60)

    response = await client.post(
        f"/users/{user.id}/reset-password", json={"new_password": "new-password-456"}, headers=auth(admin)
    )
    assert response.status_code == 204
    assert (await client.get("/auth/me", headers=old_headers)).status_code == 401

    login = await client.post(
        "/auth/token", data={"username": "sara@example.com", "password": "new-password-456"}
    )
    assert login.status_code == 200


async def test_update_ignores_explicit_null_for_required_fields(client, make_user):
    admin = await make_user(is_admin=True)
    user = await make_user(name="Sara")
    response = await client.patch(f"/users/{user.id}", json={"name": None}, headers=auth(admin))
    assert response.status_code == 200
    assert response.json()["name"] == "Sara"


async def test_unknown_user_is_404(client, make_user):
    admin = await make_user(is_admin=True)
    response = await client.get("/users/9999", headers=auth(admin))
    assert response.status_code == 404