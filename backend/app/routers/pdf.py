from fastapi import Response

# Tells the OpenAPI docs (and the frontend's generated client) that the body is a PDF
PDF_RESPONSE: dict[int | str, dict] = {200: {"content": {"application/pdf": {}}}}


def pdf_response(pdf: bytes, filename: str) -> Response:
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )