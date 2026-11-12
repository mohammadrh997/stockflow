import asyncio
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update

from app.core.security import hash_refresh_token
from app.models.auth import RefreshToken
from tests.helpers import auth


async def login(client, email="ali@example.com", password="password123"):
    response = await client.post("/auth/token", data={"username": email, "password": password})
    assert response.status_code == 200, response.text
    return response.json()


async def refresh(client, token):
    return await client.post("/auth/refresh", json={"refresh_token": token})


def bearer(tokens):
    return {"Authorization": f"Bearer {tokens['access_token']}"}


async def test_login_returns_a_refresh_token_that_renews_the_session(client, make_user):
    await make_user(email="ali@example.com")
    first = await login(client)

    response = await refresh(client, first["refresh_token"])
    assert response.status_code == 200, response.text
    second = response.json()
    assert second["refresh_token"] != first["refresh_token"]
    assert (await client.get("/auth/me", headers=bearer(second))).status_code == 200


async def test_a_reused_refresh_token_ends_the_session(client, make_user):
    await make_user(email="ali@example.com")
    first = await login(client)
    second = (await refresh(client, first["refresh_token"])).json()

    # someone replays the first token: refused, and the session it belongs to ends
    assert (await refresh(client, first["refresh_token"])).status_code == 401
    assert (await refresh(client, second["refresh_token"])).status_code == 401


async def test_the_same_token_cant_be_renewed_twice_at_once(client, make_user):
    await make_user(email="ali@example.com")
    tokens = await login(client)

    responses = await asyncio.gather(*(refresh(client, tokens["refresh_token"]) for _ in range(2)))
    # The row lock makes one wait; it then sees the token used, and treats it as a replay
    assert sorted(r.status_code for r in responses) == [200, 401]


async def test_ending_one_session_leaves_the_others(client, make_user):
    await make_user(email="ali@example.com")
    laptop = await login(client)
    phone = await login(client)

    response = await client.post("/auth/logout", json={"refresh_token": laptop["refresh_token"]})
    assert response.status_code == 204

    assert (await refresh(client, laptop["refresh_token"])).status_code == 401
    assert (await refresh(client, phone["refresh_token"])).status_code == 200


async def test_logout_with_an_unknown_token_is_still_204(client):
    response = await client.post("/auth/logout", json={"refresh_token": "nope"})
    assert response.status_code == 204


async def test_unknown_and_expired_refresh_tokens_are_refused(client, db, make_user):
    await make_user(email="ali@example.com")
    tokens = await login(client)
    assert (await refresh(client, "made-up")).status_code == 401

    await db.execute(
        update(RefreshToken)
        .where(RefreshToken.token_hash == hash_refresh_token(tokens["refresh_token"]))
        .values(expires_at=datetime.now(UTC) - timedelta(seconds=1))
    )
    await db.commit()
    assert (await refresh(client, tokens["refresh_token"])).status_code == 401


async def test_changing_the_password_ends_the_other_sessions(client, make_user):
    await make_user(email="ali@example.com")
    other = await login(client)
    this = await login(client)

    response = await client.post(
        "/auth/me/password",
        json={"current_password": "password123", "new_password": "new-password-456"},
        headers=bearer(this),
    )
    assert response.status_code == 200, response.text
    renewed = response.json()

    assert (await refresh(client, other["refresh_token"])).status_code == 401
    assert (await refresh(client, this["refresh_token"])).status_code == 401
    assert (await refresh(client, renewed["refresh_token"])).status_code == 200

    # and the password itself changed
    await login(client, password="new-password-456")
    response = await client.post(
        "/auth/token", data={"username": "ali@example.com", "password": "password123"}
    )
    assert response.status_code == 401


async def test_admin_actions_end_the_users_sessions(client, make_user):
    admin = auth(await make_user(is_admin=True))
    user = await make_user(email="ali@example.com")

    tokens = await login(client)
    response = await client.post(
        f"/users/{user.id}/reset-password", json={"new_password": "reset-pass-789"}, headers=admin
    )
    assert response.status_code == 204
    assert (await refresh(client, tokens["refresh_token"])).status_code == 401

    tokens = await login(client, password="reset-pass-789")
    assert (await client.post(f"/users/{user.id}/deactivate", headers=admin)).status_code == 200
    assert (await refresh(client, tokens["refresh_token"])).status_code == 401


async def test_logging_in_clears_the_users_expired_tokens(client, db, make_user):
    await make_user(email="ali@example.com")
    old = await login(client)
    await db.execute(update(RefreshToken).values(expires_at=datetime.now(UTC) - timedelta(days=1)))
    await db.commit()

    await login(client)

    hashes = set((await db.scalars(select(RefreshToken.token_hash))).all())
    assert hash_refresh_token(old["refresh_token"]) not in hashes
    assert len(hashes) == 1
