from fastapi import HTTPException, UploadFile

from app.services.images import MAX_UPLOAD_BYTES


async def read_image_upload(file: UploadFile) -> bytes:
    data = await file.read(MAX_UPLOAD_BYTES + 1)  # one byte more tells us it's too big
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="The image must be 5 MB or smaller")
    return data
