"""Fill an empty StockFlow instance with demo data through its public API.

Usage (from backend/):
    uv run python -m scripts.seed_demo --api-url URL --admin-email EMAIL

The admin password and the demo user's password are asked for at the prompt
(or read from SEED_ADMIN_PASSWORD and SEED_DEMO_PASSWORD), never stored in code.
"""

import argparse
import getpass
import io
import os
import sys
from datetime import date
from typing import Any

import httpx
from PIL import Image, ImageDraw, ImageFont


class SeedError(Exception):
    pass


class Api:
    def __init__(self, base_url: str) -> None:
        # The free Render instance can take up to a minute to wake up.
        self.client = httpx.Client(base_url=base_url.rstrip("/"), timeout=90)

    def login(self, email: str, password: str) -> None:
        response = self.client.post("/auth/token", data={"username": email, "password": password})
        self._check(response)
        self.client.headers["Authorization"] = f"Bearer {response.json()['access_token']}"

    def get(self, path: str, **params: Any) -> Any:
        return self._check(self.client.get(path, params=params)).json()

    def post(self, path: str, body: dict[str, Any] | None = None) -> Any:
        return self._check(self.client.post(path, json=body or {})).json()

    def patch(self, path: str, body: dict[str, Any]) -> Any:
        return self._check(self.client.patch(path, json=body)).json()

    def upload(self, path: str, filename: str, data: bytes) -> httpx.Response:
        return self.client.put(path, files={"file": (filename, data, "image/png")})

    @staticmethod
    def _check(response: httpx.Response) -> httpx.Response:
        if response.is_error:
            raise SeedError(
                f"{response.request.method} {response.request.url.path} "
                f"-> {response.status_code}: {response.text}"
            )
        return response


PRODUCTS = [
    # sku, name, sale price, cost price
    ("CHAIR-ERG", "Ergonomic Office Chair", "185.00", "120.00"),
    ("DESK-STD", "Standing Desk", "420.00", "290.00"),
    ("MON-27", "27-inch Monitor", "260.00", "190.00"),
    ("KB-MECH", "Mechanical Keyboard", "75.00", "45.00"),
    ("MOUSE-WL", "Wireless Mouse", "28.00", "15.00"),
    ("LAMP-LED", "LED Desk Lamp", "35.00", "18.00"),
    ("CAB-3D", "Three-drawer Filing Cabinet", "140.00", "95.00"),
    ("BOARD-120", "Whiteboard 120 x 90 cm", "65.00", "38.00"),
    ("PAPER-A4", "A4 Paper, box of 5 reams", "22.50", "14.00"),
    ("CABLE-HDMI", "HDMI Cable 2 m", "9.50", "3.20"),
]

# Left without an image on purpose, so the demo shows that state too
WITHOUT_IMAGE = {"PAPER-A4", "CABLE-HDMI"}
COLORS = ["#1F3A5F", "#E8590C", "#2F7D6D", "#6B4FA0", "#B23A48", "#3A6EA5", "#7A6A2F", "#4A5568"]


def placeholder_image(label: str, color: str) -> bytes:
    """A coloured square with a short label: drawn here, so there are no image files to license."""
    image = Image.new("RGB", (600, 600), color)
    font = ImageFont.load_default(size=130)
    ImageDraw.Draw(image).text((300, 300), label, fill="white", font=font, anchor="mm")
    out = io.BytesIO()
    image.save(out, "PNG")
    return out.getvalue()


SUPPLIERS = [
    ("Tigris Office Supply", "orders@tigris-office.example.com", "+964 770 000 0101"),
    ("Zagros Furniture Works", "sales@zagros-furniture.example.com", "+964 750 000 0202"),
    ("Cedar Tech Distributors", "b2b@cedar-tech.example.com", "+961 1 000 303"),
]

CUSTOMERS = [
    ("Sumer Consulting", "office@sumer-consulting.example.com", "Baghdad, Karrada"),
    ("Babylon Coworking", "hello@babylon-cowork.example.com", "Baghdad, Mansour"),
    ("Nineveh Dental Clinic", "admin@nineveh-dental.example.com", "Mosul"),
    ("Erbil Startup Hub", "team@erbil-hub.example.com", "Erbil, 100m Street"),
]


def seed(api: Api, demo_email: str, demo_password: str) -> None:
    if api.get("/products", include_archived=True, limit=1):
        raise SeedError("This instance already has products. The seed only runs on empty data.")

    print("Warehouses and locations")
    main = api.get("/warehouses")[0]
    api.patch(f"/warehouses/{main['id']}", {"name": "Baghdad Warehouse"})
    erbil = api.post("/warehouses", {"name": "Erbil Warehouse", "code": "ERB"})
    shelf_a = api.post("/locations", {"name": "Shelf A", "warehouse_id": main["id"]})
    shelf_b = api.post("/locations", {"name": "Shelf B", "warehouse_id": main["id"]})

    print("Products and partners")
    products = {}
    for sku, name, sale_price, cost_price in PRODUCTS:
        products[sku] = api.post(
            "/products",
            {"sku": sku, "name": name, "sale_price": sale_price, "cost_price": cost_price},
        )["id"]

    print("Product images")
    for i, (sku, *_) in enumerate(PRODUCTS):
        if sku in WITHOUT_IMAGE:
            continue
        data = placeholder_image(sku.split("-")[0], COLORS[i % len(COLORS)])  # CHAIR, DESK, ...
        response = api.upload(f"/products/{products[sku]}/image", f"{sku}.png", data)
        if response.status_code == 503:
            print("  skipped: the API has no image storage configured")
            break
        api._check(response)
    suppliers = [
        api.post("/partners", {"name": n, "email": e, "phone": p, "is_supplier": True})["id"]
        for n, e, p in SUPPLIERS
    ]
    customers = [
        api.post("/partners", {"name": n, "email": e, "address": a, "is_customer": True})["id"]
        for n, e, a in CUSTOMERS
    ]

    def order(kind: str, partner: int, warehouse: int, lines: list[tuple[str, str]]) -> int:
        body = {
            "partner_id": partner,
            "warehouse_id": warehouse,
            "lines": [{"product_id": products[sku], "quantity": qty} for sku, qty in lines],
        }
        return int(api.post(f"/{kind}-orders", body)["id"])

    def confirm(kind: str, order_id: int) -> dict[str, Any]:
        api.post(f"/{kind}-orders/{order_id}/confirm")
        key = "purchase_order_id" if kind == "purchase" else "sales_order_id"
        return dict(api.get("/transfers", **{key: order_id})[0])

    def validate(
        transfer: dict[str, Any],
        location_id: int | None = None,
        ship: dict[str, str] | None = None,
    ) -> None:
        """Validate a transfer. With `ship` ({sku: quantity}), only that much moves."""
        body: dict[str, Any] = {"location_id": location_id} if location_id else {}
        if ship is not None:
            sku_of = {product_id: sku for sku, product_id in products.items()}
            body["lines"] = [
                {"line_id": line["id"], "quantity": ship.get(sku_of[line["product_id"]], "0")}
                for line in transfer["lines"]
            ]
        api.post(f"/transfers/{transfer['id']}/validate", body)

    def backorder(kind: str, order_id: int) -> dict[str, Any]:
        key = "purchase_order_id" if kind == "purchase" else "sales_order_id"
        return dict(api.get("/transfers", state="ready", **{key: order_id})[0])

    def invoice(kind: str, order_id: int, post: bool = True, pay: str | None = None) -> None:
        """Invoice what has moved so far; optionally post it and record a payment.

        pay="all" pays the full total.
        """
        key = "purchase_order_id" if kind == "purchase" else "sales_order_id"
        created = api.post("/invoices", {key: order_id})
        if not post:
            return
        posted = api.post(f"/invoices/{created['id']}/post", {})
        if pay is not None:
            amount = posted["amount_total"] if pay == "all" else pay
            api.post(
                f"/invoices/{created['id']}/payments",
                {"amount": amount, "paid_on": date.today().isoformat()},
            )

    print("Purchase orders")
    po = order(
        "purchase",
        suppliers[1],
        main["id"],
        [("CHAIR-ERG", "40"), ("DESK-STD", "15"), ("CAB-3D", "10"), ("BOARD-120", "8")],
    )
    validate(confirm("purchase", po))  # into the default location
    furniture_po = po

    po = order(
        "purchase",
        suppliers[2],
        main["id"],
        [("MON-27", "30"), ("KB-MECH", "50"), ("MOUSE-WL", "60"), ("CABLE-HDMI", "100")],
    )
    validate(confirm("purchase", po), shelf_a["id"])
    electronics_po = po

    po = order("purchase", suppliers[0], main["id"], [("PAPER-A4", "120"), ("LAMP-LED", "25")])
    validate(confirm("purchase", po), shelf_b["id"])

    po = order(
        "purchase",
        suppliers[2],
        erbil["id"],
        [("MON-27", "12"), ("KB-MECH", "20"), ("CHAIR-ERG", "10")],
    )
    validate(confirm("purchase", po))

    po = order("purchase", suppliers[1], main["id"], [("DESK-STD", "10"), ("CHAIR-ERG", "20")])
    # part of it arrived; the rest stays on a backorder (goods still on the way)
    validate(confirm("purchase", po), ship={"DESK-STD": "10", "CHAIR-ERG": "12"})

    order("purchase", suppliers[0], erbil["id"], [("PAPER-A4", "40")])  # draft

    po = order("purchase", suppliers[2], main["id"], [("MOUSE-WL", "25")])
    api.post(f"/purchase-orders/{po}/cancel")

    print("Internal transfer and stock count")
    api.post(
        "/transfers/internal",
        {
            "from_location_id": shelf_a["id"],
            "to_location_id": main["default_location_id"],
            "lines": [
                {"product_id": products["MON-27"], "quantity": "10"},
                {"product_id": products["KB-MECH"], "quantity": "15"},
            ],
            "note": "Restock the front of the warehouse",
        },
    )
    api.post(
        "/transfers/adjustments",
        {
            "location_id": shelf_b["id"],
            "lines": [{"product_id": products["LAMP-LED"], "counted_quantity": "23"}],
            "note": "Monthly count: two lamps broken in storage",
        },
    )

    print("Sales orders")
    so = order(
        "sales",
        customers[0],
        main["id"],
        [("CHAIR-ERG", "12"), ("DESK-STD", "6"), ("MON-27", "12")],
    )
    validate(confirm("sales", so))  # automatic split across locations
    first_sale = so

    so = order("sales", customers[3], erbil["id"], [("MON-27", "4"), ("KB-MECH", "4")])
    validate(confirm("sales", so))
    erbil_sale = so

    so = order(
        "sales",
        customers[1],
        main["id"],
        [("CHAIR-ERG", "20"), ("BOARD-120", "4"), ("LAMP-LED", "10")],
    )
    confirm("sales", so)  # delivery left ready: stock reserved

    order("sales", customers[2], main["id"], [("CAB-3D", "3"), ("PAPER-A4", "10")])  # draft

    so = order("sales", customers[1], main["id"], [("KB-MECH", "5")])
    api.post(f"/sales-orders/{so}/cancel")

    print("Partial deliveries")
    so = order("sales", customers[0], main["id"], [("KB-MECH", "10"), ("MOUSE-WL", "10")])
    validate(confirm("sales", so), ship={"KB-MECH": "10", "MOUSE-WL": "6"})
    partial_sale = so  # 4 mice left on an open backorder

    so = order("sales", customers[3], erbil["id"], [("CHAIR-ERG", "6")])
    validate(confirm("sales", so), ship={"CHAIR-ERG": "4"})
    api.post(f"/transfers/{backorder('sales', so)['id']}/cancel")  # customer didn't want the rest

    print("Invoices and bills")
    invoice("sales", first_sale, pay="all")
    invoice("sales", erbil_sale, pay="500.00")
    invoice("sales", partial_sale, post=False)  # draft for what has shipped so far
    invoice("purchase", furniture_po, pay="all")
    invoice("purchase", electronics_po)  # posted, not paid yet

    print("Demo user")
    api.post(
        "/users",
        {
            "email": demo_email,
            "name": "Demo User",
            "password": demo_password,
            "sales_access": "manager",
            "purchase_access": "manager",
            "inventory_access": "manager",
        },
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed an empty StockFlow instance with demo data.")
    parser.add_argument("--api-url", default="http://localhost:8000")
    parser.add_argument("--admin-email", required=True)
    parser.add_argument("--demo-email", default="demo@example.com")
    args = parser.parse_args()

    admin_password = os.environ.get("SEED_ADMIN_PASSWORD") or getpass.getpass("Admin password: ")
    demo_password = os.environ.get("SEED_DEMO_PASSWORD") or getpass.getpass("Demo user password: ")

    api = Api(args.api_url)
    try:
        api.login(args.admin_email, admin_password)
        seed(api, args.demo_email, demo_password)
    except SeedError as exc:
        print(f"Seed failed: {exc}", file=sys.stderr)
        return 1
    print(f"Done. Demo login: {args.demo_email}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
