"""Read one bill file with Gemini and print what came back, without saving anything.

For trying the model and the prompt on real bills. Needs GEMINI_API_KEY in .env.

Usage (from backend/):
    uv run python -m scripts.read_bill path/to/bill.pdf
"""

import asyncio
import sys
from pathlib import Path

from app.services.bill_reader import (
    BillUnreadable,
    InvalidBillFile,
    ReaderUnavailable,
    bill_file_type,
    configured_bill_reader,
)


async def main(data: bytes) -> int:
    reader = configured_bill_reader()
    if reader is None:
        print("Set GEMINI_API_KEY in .env first.", file=sys.stderr)
        return 1
    try:
        bill = await reader.read(data, await bill_file_type(data))
    except (InvalidBillFile, BillUnreadable, ReaderUnavailable) as exc:
        print(f"Failed: {exc}", file=sys.stderr)
        return 1

    print(f"Supplier:  {bill.supplier_name}")
    print(f"Number:    {bill.bill_number}")
    print(f"Date:      {bill.bill_date}")
    print(f"Currency:  {bill.currency}")
    print(f"Total:     {bill.total}")
    for line in bill.lines:
        code = f" [{line.product_code}]" if line.product_code else ""
        print(f"  {line.quantity} x {line.unit_price}  {line.description}{code}")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__, file=sys.stderr)
        sys.exit(2)
    sys.exit(asyncio.run(main(Path(sys.argv[1]).read_bytes())))
