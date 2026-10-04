#!/usr/bin/env python
"""seed_tn_shipments_from_orders.py — migración one-time: tiendanube.orders -> tiendanube.shipments.

Situación GCP (04/10): la tienda TiendaNube reconectada (8182050) NO tiene
órdenes en la API (las históricas 20xxxxxx pertenecían a la encarnación
anterior de la tienda y ya no existen), así que el backfill real
(`backfill.py tn-shipments`) no trae nada. Este script alimenta la tabla de
envíos con las órdenes YA guardadas en `tiendanube.orders`, derivando el
estado por fila con la MISMA normalización (fallback sin shipping_status):
closed -> delivered; open -> pending; cancelled -> cancelled. El contexto
rico de envío (tracking/dirección) no existe en esas filas y queda vacío; el
próximo webhook de la orden lo completa (upsert por (account_id, order_id)).

Idempotente: solo INSERT ... ON DUPLICATE KEY UPDATE del status derivado
(no pisa `data` si la fila ya tenía contexto real).

Uso:
    cd backend && .venv/bin/python scripts/seed_tn_shipments_from_orders.py            # Cloud SQL (DB_HOST vacío)
    cd backend && .venv/bin/python scripts/seed_tn_shipments_from_orders.py --local    # MySQL local
    cd backend && .venv/bin/python scripts/seed_tn_shipments_from_orders.py --dry-run
"""
import argparse
import json
import os
import sys
from pathlib import Path

import pymysql
from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))
load_dotenv(BACKEND_DIR / ".env")


def die(message: str) -> None:
    print(f"✗ {message}", file=sys.stderr)
    sys.exit(1)


def env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        die(f"Falta {name} en backend/.env")
    return value


def open_conn(local: bool):
    if local:
        host = os.getenv("DB_HOST", "").strip()
        if not host:
            die("DB_HOST vacío: no hay MySQL local al que conectar")
        conn = pymysql.connect(
            host=host, port=int(os.getenv("DB_PORT", "3306")),
            user=env("USER_DB"), password=env("PASSWORD_DB"),
            db="platform_accounts", charset="utf8mb4",
            cursorclass=pymysql.cursors.DictCursor)
        return conn, None
    creds = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    local_key = BACKEND_DIR / "service_account.json"
    if not creds and local_key.exists():
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(local_key)
    from google.cloud.sql.connector import Connector
    connector = Connector()
    conn = connector.connect(
        env("INSTANCE_DB"), "pymysql",
        user=env("USER_DB"), password=env("PASSWORD_DB"),
        db="platform_accounts", charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor)
    return conn, connector


def derive_status(channel_status: str):
    """Mismo fallback de normalize_tn_shipment_status sin shipping_status."""
    if channel_status == "cancelled":
        return "cancelled"
    if channel_status == "closed":
        return "delivered"
    if channel_status == "open":
        return "pending"
    return None


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Migra tiendanube.orders -> tiendanube.shipments (one-time).")
    parser.add_argument("--local", action="store_true",
                        help="contra el MySQL local (default: Cloud SQL)")
    parser.add_argument("--dry-run", action="store_true",
                        help="solo mostrar qué se haría")
    args = parser.parse_args()

    conn, connector = open_conn(args.local)
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT account_id, order_id, channel_status FROM tiendanube.orders")
            orders = cur.fetchall()
            if args.dry_run:
                rows = [(o["order_id"], o["channel_status"],
                         derive_status(o["channel_status"])) for o in orders]
                print(f"[dry-run] {len(rows)} órdenes -> envíos derivados:")
                for order_id, raw, status in rows[:20]:
                    print(f"  {order_id}: {raw} -> {status}")
                return 0

            inserted = updated = skipped = 0
            for o in orders:
                status = derive_status(o["channel_status"])
                if status is None:
                    skipped += 1
                    continue
                # No pisar `data` si ya existe contexto real: solo el status
                # derivado cuando la fila no existía; si existe, no tocar nada
                # (el webhook ya la llenó con datos reales).
                affected = cur.execute(
                    "INSERT INTO tiendanube.shipments (account_id, order_id, status, data)"
                    " VALUES (%s, %s, %s, %s)"
                    " ON DUPLICATE KEY UPDATE id = id",
                    (o["account_id"], o["order_id"], status,
                     json.dumps({"migrated_from_orders": True})))
                if affected == 1:
                    inserted += 1
                else:
                    updated += 1
            conn.commit()
            cur.execute("SELECT COUNT(*) AS n FROM tiendanube.shipments")
            total = cur.fetchone()["n"]
            print(f"→ tiendanube.shipments: {inserted} insertadas, "
                  f"{updated} ya existían, {skipped} sin estado derivable "
                  f"(total {total})")
            return 0
    finally:
        conn.close()
        if connector is not None:
            connector.close()


if __name__ == "__main__":
    sys.exit(main())
