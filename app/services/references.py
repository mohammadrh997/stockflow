import enum

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession


class RefSequence(enum.StrEnum):
    purchase_order = "purchase_order_ref_seq"
    sales_order = "sales_order_ref_seq"
    receipt = "receipt_ref_seq"
    delivery = "delivery_ref_seq"


async def next_number(db: AsyncSession, sequence: RefSequence) -> int:
    return await db.scalar(select(func.nextval(sequence.value)))