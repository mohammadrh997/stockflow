from decimal import ROUND_HALF_UP, Decimal
from typing import Annotated

from pydantic import BeforeValidator, Field

Quantity = Annotated[Decimal, Field(gt=0, max_digits=12, decimal_places=3)]
Price = Annotated[Decimal, Field(ge=0, max_digits=12, decimal_places=2)]
Amount = Annotated[Decimal, Field(gt=0, max_digits=12, decimal_places=2)]


def _blank_to_none(value: object) -> object:
    if isinstance(value, str):
        return value.strip() or None
    return value


# The supplier's own number for an order or a bill. Spaces around it are dropped, and an
# empty one means there is none.
PartnerReference = Annotated[
    Annotated[str, Field(max_length=100)] | None, BeforeValidator(_blank_to_none)
]


def line_subtotal(quantity: Decimal, price: Decimal) -> Decimal:
    subtotal = (quantity * price).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return subtotal
