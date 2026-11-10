"""Where uploaded files live: an S3-compatible bucket in production, memory in tests."""

import asyncio
import logging
from functools import cache
from typing import TYPE_CHECKING, Protocol

import boto3
from botocore.config import Config

from app.core.config import settings

if TYPE_CHECKING:
    from mypy_boto3_s3 import S3Client


logger = logging.getLogger(__name__)


class Storage(Protocol):
    async def put(self, key: str, data: bytes, content_type: str) -> None: ...
    async def get(self, key: str) -> bytes: ...
    async def delete(self, key: str) -> None: ...


class S3Storage:
    def __init__(self, endpoint: str, region: str | None, bucket: str, key_id: str, secret: str):
        self._bucket = bucket
        self._client: S3Client = boto3.client(
            "s3",
            endpoint_url=endpoint,
            region_name=region,
            aws_access_key_id=key_id,
            aws_secret_access_key=secret,
            # Newer boto3 adds checksums that not every S3-compatible service accepts
            config=Config(
                request_checksum_calculation="when_required",
                response_checksum_validation="when_required",
            ),
        )

    # boto3 is blocking, so each call runs in a thread instead of stalling the event loop

    async def put(self, key: str, data: bytes, content_type: str) -> None:
        await asyncio.to_thread(
            self._client.put_object,
            Bucket=self._bucket,
            Key=key,
            Body=data,
            ContentType=content_type,
            # A key is never reused for different content, so browsers may cache it forever
            CacheControl="public, max-age=31536000, immutable",
        )

    async def get(self, key: str) -> bytes:
        def read() -> bytes:
            return self._client.get_object(Bucket=self._bucket, Key=key)["Body"].read()

        return await asyncio.to_thread(read)

    async def delete(self, key: str) -> None:
        await asyncio.to_thread(self._client.delete_object, Bucket=self._bucket, Key=key)


class MemoryStorage:
    """For tests: keeps files in a dict."""

    def __init__(self) -> None:
        self.files: dict[str, bytes] = {}

    async def get(self, key: str) -> bytes:
        return self.files[key]

    async def put(self, key: str, data: bytes, content_type: str) -> None:
        self.files[key] = data

    async def delete(self, key: str) -> None:
        self.files.pop(key, None)


@cache  # one client for the whole app; creating one is slow, and they're thread-safe
def configured_storage() -> Storage | None:
    s = settings
    secret = s.storage_secret_key.get_secret_value() if s.storage_secret_key else ""
    if not (
        s.storage_endpoint
        and s.storage_bucket
        and s.storage_key_id
        and secret
        and s.storage_public_url
    ):
        return None
    return S3Storage(
        s.storage_endpoint, s.storage_region, s.storage_bucket, s.storage_key_id, secret
    )


def public_url(key: str | None) -> str | None:
    if key is None or not settings.storage_public_url:
        return None
    return f"{settings.storage_public_url.rstrip('/')}/{key}"


async def delete_quietly(storage: Storage, key: str) -> None:
    # Called once the database no longer points at the file. If deleting it fails, it's
    # only an unused file in the bucket, so log it rather than fail a request that worked.
    try:
        await storage.delete(key)
    except Exception:
        logger.warning("Could not delete unused file %s", key, exc_info=True)
