#!/usr/bin/env python
"""push_fake_orders_to_cloud.py — copia las órdenes FAKE-* del MySQL local a Cloud SQL (GCP).

Copia (scope estricto, todo lleva el prefijo FAKE- o es el producto de prueba):
  - inventory.products: el producto TEST-43898 (FK de stock_movements; solo si no existe en Cloud)
  - mercadolibre.orders / tiendanube.orders: órdenes FAKE-*
  - tiendanube.shipments: envíos FAKE-* (proyección del panel unificado de Envíos)
  - inventory.stock_movements: movimientos FAKE-* (remappea account_id/product_id)
  - platform_accounts.events: eventos FAKE-* (remappea account_id)

Remapea por clave natural, no por id:
  - cuentas: (business_id, platform, external_account_id) — los ids locales y de
    Cloud no tienen por qué coincidir (ej. la cuenta TN local id=289 es id=92 en Cloud).
  - producto: (business_id, sku/gtin).

Idempotente: saltea filas que ya existen en Cloud (claves únicas de cada tabla)
y preserva timestamps, JSONs y comprobantes (provider_doc_id) tal cual. No toca
businesses.config ni listings.

Uso:
    cd backend && .venv/bin/python scripts/push_fake_orders_to_cloud.py            # copia real
    cd backend && .venv/bin/python scripts/push_fake_orders_to_cloud.py --dry-run  # solo muestra qué copiaría
    cd backend && .venv/bin/python scripts/push_fake_orders_to_cloud.py --cleanup  # borra los FAKE-* de CLOUD SQL (no el producto)
"""
import argparse
import os
import sys
from pathlib import Path

import pymysql
from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BACKEND_DIR / ".env")

PRODUCT_ID_LOCAL = 123377          # producto TEST-43898 (FK de los movements)
FAKE_LIKE = "FAKE-%"


def die(message: str) -> None:
    print(f"✗ {message}", file=sys.stderr)
    sys.exit(1)


def env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        die(f"Falta {name} en backend/.env")
    return value


def open_local():
    host = os.getenv("DB_HOST", "").strip()
    if not host:
        die("DB_HOST está vacío en backend/.env: no hay MySQL local del que copiar")
    return pymysql.connect(
        host=host,
        port=int(os.getenv("DB_PORT", "3306")),
        user=env("USER_DB"),
        password=env("PASSWORD_DB"),
        database="information_schema",
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
    )


def open_cloud():
    creds = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    local_key = BACKEND_DIR / "service_account.json"
    if not creds and local_key.exists():
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(local_key)
    from google.cloud.sql.connector import Connector

    connector = Connector()
    conn = connector.connect(
        env("INSTANCE_DB"),
        "pymysql",
        user=env("USER_DB"),
        password=env("PASSWORD_DB"),
        db="information_schema",
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
    )
    return conn, connector


# ─────────────────────────────────────────────────────────────────────────────
# Remapeo de referencias local -> Cloud
# ─────────────────────────────────────────────────────────────────────────────

def account_map(local_cur, cloud_cur):
    """{account_id_local: account_id_cloud} matcheando por (business_id, platform, external_account_id)."""
    local_cur.execute(
        "SELECT id, business_id, platform, external_account_id "
        "FROM platform_accounts.accounts WHERE business_id = 1")
    cloud_cur.execute(
        "SELECT id, business_id, platform, external_account_id "
        "FROM platform_accounts.accounts WHERE business_id = 1")
    local_by_key = {(r["business_id"], r["platform"], r["external_account_id"]): r["id"]
                    for r in local_cur.fetchall()}
    cloud_by_key = {(r["business_id"], r["platform"], r["external_account_id"]): r["id"]
                    for r in cloud_cur.fetchall()}
    mapping = {}
    for key, local_id in sorted(local_by_key.items(), key=lambda kv: kv[1]):
        cloud_id = cloud_by_key.get(key)
        if cloud_id is None:
            die(f"Cuenta local id={local_id} ({key[1]} {key[2]}) no existe en Cloud SQL")
        mapping[local_id] = cloud_id
    return mapping


def product_target_id(local_cur, cloud_cur):
    """Devuelve (id_del_producto_en_cloud, hay_que_crearlo). Conserva 123377 si está libre."""
    local_cur.execute(
        "SELECT * FROM inventory.products WHERE id = %s", (PRODUCT_ID_LOCAL,))
    product = local_cur.fetchone()
    if not product:
        die(f"Producto TEST id={PRODUCT_ID_LOCAL} no existe en el MySQL local")

    cloud_cur.execute(
        "SELECT id, sku, gtin FROM inventory.products "
        "WHERE business_id = %s AND (sku = %s OR gtin = %s)",
        (product["business_id"], product["sku"], product["gtin"]))
    existing = cloud_cur.fetchone()
    if existing:
        print(f"→ Producto TEST ya existe en Cloud SQL (id={existing['id']}), no se crea")
        return existing["id"], False

    cloud_cur.execute(
        "SELECT id, sku FROM inventory.products WHERE id = %s", (PRODUCT_ID_LOCAL,))
    occupied = cloud_cur.fetchone()
    if occupied:
        die(f"En Cloud SQL el id={PRODUCT_ID_LOCAL} está ocupado por otro producto "
            f"(sku={occupied['sku']}); resolver a mano")
    return PRODUCT_ID_LOCAL, True


# ─────────────────────────────────────────────────────────────────────────────
# Copia
# ─────────────────────────────────────────────────────────────────────────────

def insert_rows(cloud_cur, table, rows, remap=None, skip_cols=("id",)):
    """Inserta filas (dicts) salteando las que ya existen por clave única.
    Devuelve (insertadas, salteadas)."""
    if not rows:
        return 0, 0
    columns = [c for c in rows[0].keys() if c not in skip_cols]
    sql = ("INSERT INTO {t} ({c}) VALUES ({p}) "
           "ON DUPLICATE KEY UPDATE id = id").format(
        t=table, c=", ".join(columns), p=", ".join(["%s"] * len(columns)))
    inserted = skipped = 0
    for row in rows:
        params = []
        for col in columns:
            value = row[col]
            if remap and col in remap:
                value = remap[col][value] if value in remap[col] else value
            params.append(value)
        try:
            affected = cloud_cur.execute(sql, params)
        except pymysql.err.IntegrityError as exc:  # FK rota u otro problema real
            die(f"INSERT en {table} falló: {exc} — fila: {row.get('order_id') or row.get('external_id')}")
        if affected == 1:
            inserted += 1
        else:
            skipped += 1
    return inserted, skipped


def copy_fake_data(local_cur, cloud_cur, acc_map, product_cloud_id, create_product, dry_run):
    summary = []

    # 1) Producto TEST (necesario para el FK de stock_movements).
    local_cur.execute("SELECT * FROM inventory.products WHERE id = %s", (PRODUCT_ID_LOCAL,))
    product = local_cur.fetchone()
    if create_product:
        if dry_run:
            print(f"[dry-run] inventory.products: crearía id={PRODUCT_ID_LOCAL} (sku TEST-43898)")
        else:
            cols = list(product.keys())
            sql = "INSERT IGNORE INTO inventory.products ({}) VALUES ({})".format(
                ", ".join(cols), ", ".join(["%s"] * len(cols)))
            cloud_cur.execute(sql, [product[c] for c in cols])
            print(f"→ inventory.products: producto TEST creado con id={PRODUCT_ID_LOCAL}")
        summary.append(("inventory.products", 1, 0))

    # 2) Órdenes.
    for table, label in (("mercadolibre.orders", "Meli"), ("tiendanube.orders", "TiendaNube")):
        local_cur.execute(f"SELECT * FROM {table} WHERE order_id LIKE %s", (FAKE_LIKE,))
        rows = local_cur.fetchall()
        remap = {"account_id": acc_map}
        if dry_run:
            print(f"[dry-run] {table}: copiaría {len(rows)} órdenes (account_id remapeado)")
            summary.append((table, len(rows), 0))
            continue
        inserted, skipped = insert_rows(cloud_cur, table, rows, remap=remap)
        print(f"→ {table} ({label}): {inserted} insertadas, {skipped} ya existían")
        summary.append((table, inserted, skipped))

    # 3) Envíos TN (proyección tiendanube.shipments de las órdenes FAKE-*).
    local_cur.execute(
        "SELECT * FROM tiendanube.shipments WHERE order_id LIKE %s", (FAKE_LIKE,))
    rows = local_cur.fetchall()
    if dry_run:
        print(f"[dry-run] tiendanube.shipments: copiaría {len(rows)} envíos (account_id remapeado)")
        summary.append(("tiendanube.shipments", len(rows), 0))
    else:
        inserted, skipped = insert_rows(cloud_cur, "tiendanube.shipments", rows,
                                        remap={"account_id": acc_map})
        print(f"→ tiendanube.shipments: {inserted} insertados, {skipped} ya existían")
        summary.append(("tiendanube.shipments", inserted, skipped))

    # 4) Movimientos de stock.
    local_cur.execute(
        "SELECT * FROM inventory.stock_movements WHERE order_id LIKE %s", (FAKE_LIKE,))
    rows = local_cur.fetchall()
    remap = {"account_id": acc_map, "product_id": {PRODUCT_ID_LOCAL: product_cloud_id}}
    if dry_run:
        print(f"[dry-run] inventory.stock_movements: copiaría {len(rows)} movimientos")
        summary.append(("inventory.stock_movements", len(rows), 0))
    else:
        inserted, skipped = insert_rows(cloud_cur, "inventory.stock_movements", rows, remap=remap)
        print(f"→ inventory.stock_movements: {inserted} insertados, {skipped} ya existían")
        summary.append(("inventory.stock_movements", inserted, skipped))

    # 5) Eventos.
    local_cur.execute(
        "SELECT * FROM platform_accounts.events WHERE external_id LIKE %s", (FAKE_LIKE,))
    rows = local_cur.fetchall()
    if dry_run:
        print(f"[dry-run] platform_accounts.events: copiaría {len(rows)} eventos")
        summary.append(("platform_accounts.events", len(rows), 0))
    else:
        inserted, skipped = insert_rows(cloud_cur, "platform_accounts.events", rows,
                                        remap={"account_id": acc_map})
        print(f"→ platform_accounts.events: {inserted} insertados, {skipped} ya existían")
        summary.append(("platform_accounts.events", inserted, skipped))

    return summary


def cleanup_cloud(cloud_cur):
    """Borra SOLO las filas FAKE-* de Cloud SQL (mismo criterio que fake_orders.py --cleanup)."""
    for table in ("mercadolibre.orders", "tiendanube.orders"):
        cloud_cur.execute(f"DELETE FROM {table} WHERE order_id LIKE %s", (FAKE_LIKE,))
    cloud_cur.execute("DELETE FROM tiendanube.shipments WHERE order_id LIKE %s", (FAKE_LIKE,))
    cloud_cur.execute("DELETE FROM inventory.stock_movements WHERE order_id LIKE %s", (FAKE_LIKE,))
    cloud_cur.execute("DELETE FROM platform_accounts.events WHERE external_id LIKE %s", (FAKE_LIKE,))
    print("Fake orders FAKE-* eliminadas de Cloud SQL "
          "(orders + shipments + movements + events). "
          "El producto TEST no se borra (mismo criterio que el cleanup local).")


def verify(cloud_cur):
    print("\n── Verificación en Cloud SQL ──")
    cloud_cur.execute(
        "SELECT 'mercadolibre.orders' AS tbl, COUNT(*) AS n FROM mercadolibre.orders WHERE order_id LIKE %s "
        "UNION ALL SELECT 'tiendanube.orders', COUNT(*) FROM tiendanube.orders WHERE order_id LIKE %s "
        "UNION ALL SELECT 'tiendanube.shipments', COUNT(*) FROM tiendanube.shipments WHERE order_id LIKE %s "
        "UNION ALL SELECT 'inventory.stock_movements', COUNT(*) FROM inventory.stock_movements WHERE order_id LIKE %s "
        "UNION ALL SELECT 'platform_accounts.events', COUNT(*) FROM platform_accounts.events WHERE external_id LIKE %s",
        (FAKE_LIKE, FAKE_LIKE, FAKE_LIKE, FAKE_LIKE, FAKE_LIKE))
    for row in cloud_cur.fetchall():
        print(f"  {row['tbl']}: {row['n']}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Copia las órdenes FAKE-* del MySQL local a Cloud SQL.")
    parser.add_argument("--dry-run", action="store_true", help="solo mostrar qué se copiaría")
    parser.add_argument("--cleanup", action="store_true", help="borrar las FAKE-* de Cloud SQL")
    args = parser.parse_args()

    local_conn = open_local()
    cloud_conn, cloud_connector = open_cloud()
    try:
        with local_conn.cursor() as local_cur, cloud_conn.cursor() as cloud_cur:
            if args.cleanup:
                cleanup_cloud(cloud_cur)
                cloud_conn.commit()
                verify(cloud_cur)
                return 0

            acc_map = account_map(local_cur, cloud_cur)
            if acc_map:
                print("→ Mapeo de cuentas local→Cloud: " +
                      ", ".join(f"{k}→{v}" for k, v in sorted(acc_map.items())))
            product_cloud_id, create_product = product_target_id(local_cur, cloud_cur)

            summary = copy_fake_data(local_cur, cloud_cur, acc_map,
                                     product_cloud_id, create_product, args.dry_run)

            if args.dry_run:
                print("\n[dry-run] No se escribió nada en Cloud SQL.")
                return 0

            cloud_conn.commit()
            print("\n── Resumen de la copia ──")
            for table, inserted, skipped in summary:
                print(f"  {table}: +{inserted} · {skipped} ya existían")
            verify(cloud_cur)
            print("\n✓ Listo. Para revertir: .venv/bin/python scripts/push_fake_orders_to_cloud.py --cleanup")
            return 0
    finally:
        local_conn.close()
        cloud_conn.close()
        cloud_connector.close()


if __name__ == "__main__":
    sys.exit(main())
