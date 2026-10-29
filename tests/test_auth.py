from app.models.user import Access
from tests.helpers import auth


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