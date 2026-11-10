"""Turns an uploaded file into the one format we store: a WebP of at most 800 px."""

import io

from PIL import Image, ImageOps, UnidentifiedImageError

MAX_UPLOAD_BYTES = 5 * 1024 * 1024
MAX_SIDE = 800
MAX_PIXELS = 40_000_000  # checked before decoding, so a tiny file can't unpack into gigabytes
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}


class InvalidImage(Exception): ...


def to_webp(data: bytes) -> bytes:
    try:
        with Image.open(io.BytesIO(data)) as original:  # reads the header only, not the pixels
            if original.format not in ALLOWED_FORMATS:
                raise InvalidImage("the image must be a JPEG, PNG or WebP")
            if original.width * original.height > MAX_PIXELS:
                raise InvalidImage("the image has too many pixels")
            image = ImageOps.exif_transpose(original)  # phone photos store rotation in EXIF
            image.thumbnail((MAX_SIDE, MAX_SIDE))  # shrinks, keeps proportions, never enlarges
            image = image.convert("RGBA" if image.has_transparency_data else "RGB")
            out = io.BytesIO()
            image.save(out, "WEBP", quality=82)  # a fresh file: no EXIF, GPS or extra data
            return out.getvalue()
    except (
        UnidentifiedImageError,
        Image.DecompressionBombError,
        OSError,
        SyntaxError,
        ValueError,
        EOFError,
    ):
        raise InvalidImage("the file isn't a readable image") from None
