from decimal import Decimal
from typing import Annotated

from pydantic import Field

Quantity = Annotated[Decimal, Field(gt=0, max_digits=12, decimal_places=3)]
Price = Annotated[Decimal, Field(ge=0, max_digits=12, decimal_places=2)]
