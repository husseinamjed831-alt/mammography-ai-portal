"""Price list in Iraqi dinars. Edit PRICES to change what customers pay."""

PRICES = {
    "report": [  # (max pages, price)
        (10, 5_000),
        (20, 10_000),
        (40, 15_000),
    ],
    "presentation": {
        "standard": 5_000,
        "animated": 15_000,
        "three_d": 20_000,
    },
}


def _truthy(v) -> bool:
    return str(v).lower() in ("1", "true", "yes", "نعم", "on")


def quote(order: dict) -> dict:
    kind = order.get("kind") or "report"
    if kind == "presentation":
        p = PRICES["presentation"]
        if order.get("tier") in p:
            tier = order["tier"]
        elif _truthy(order.get("three_d")):
            tier = "three_d"
        elif _truthy(order.get("animated")):
            tier = "animated"
        else:
            tier = "standard"
        return {"kind": kind, "tier": tier, "iqd": p[tier]}

    pages = int(order.get("pages") or 10)
    for max_pages, iqd in PRICES["report"]:
        if pages <= max_pages:
            return {"kind": kind, "pages": pages, "iqd": iqd}
    return {"kind": kind, "pages": pages, "iqd": PRICES["report"][-1][1]}
