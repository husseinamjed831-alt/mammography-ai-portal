"""Tiny SQLite store for bot orders, so nothing is lost on restart."""

from __future__ import annotations

import json
import sqlite3
import time
from pathlib import Path

STATUSES = ("awaiting_payment", "awaiting_review", "approved", "rejected", "delivered", "failed")


class OrderStore:
    def __init__(self, path: str | Path):
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(str(path), check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.db.execute(
            """CREATE TABLE IF NOT EXISTS orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                chat_id INTEGER NOT NULL,
                username TEXT,
                data TEXT NOT NULL,
                price INTEGER,
                status TEXT NOT NULL,
                created REAL NOT NULL,
                updated REAL NOT NULL
            )"""
        )
        self.db.commit()

    def create(self, user_id: int, chat_id: int, username: str | None, data: dict,
               price: int, status: str) -> int:
        now = time.time()
        cur = self.db.execute(
            "INSERT INTO orders (user_id, chat_id, username, data, price, status, created, updated)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (user_id, chat_id, username, json.dumps(data, ensure_ascii=False), price, status, now, now),
        )
        self.db.commit()
        return cur.lastrowid

    def get(self, order_id: int) -> dict | None:
        row = self.db.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
        if row is None:
            return None
        out = dict(row)
        out["data"] = json.loads(out["data"])
        return out

    def set_status(self, order_id: int, status: str) -> None:
        assert status in STATUSES
        self.db.execute("UPDATE orders SET status = ?, updated = ? WHERE id = ?",
                        (status, time.time(), order_id))
        self.db.commit()

    def recent(self, limit: int = 10, status: str | None = None) -> list[dict]:
        q, args = "SELECT * FROM orders", []
        if status:
            q += " WHERE status = ?"
            args.append(status)
        q += " ORDER BY id DESC LIMIT ?"
        args.append(limit)
        rows = self.db.execute(q, args).fetchall()
        return [{**dict(r), "data": json.loads(r["data"])} for r in rows]
