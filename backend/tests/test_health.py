async def test_health_reports_ok(client):
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


async def test_cross_origin_responses_let_the_frontend_read_the_pdf_filename(client):
    response = await client.get("/health", headers={"Origin": "http://localhost:5173"})
    assert response.headers["access-control-expose-headers"] == "Content-Disposition"
