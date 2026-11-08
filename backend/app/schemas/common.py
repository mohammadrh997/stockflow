from decimal import ROUND_HALF_UP, Decimal
from typing import Annotated

from pydantic import Field

Quantity = Annotated[Decimal, Field(gt=0, max_digits=12, decimal_places=3)]
Price = Annotated[Decimal, Field(ge=0, max_digits=12, decimal_places=2)]
Amount = Annotated[Decimal, Field(gt=0, max_digits=12, decimal_places=2)]


def line_subtotal(quantity: Decimal, price: Decimal) -> Decimal:
    subtotal = (quantity * price).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return subtotal
