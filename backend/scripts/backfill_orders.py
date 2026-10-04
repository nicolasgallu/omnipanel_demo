#!/usr/bin/env python
"""backfill_orders.py — carga el histórico de órdenes de una cuenta (ML/TN) a Cloud SQL.

PULL + LOAD sin efectos secundarios: pagina el listado del canal y llama a
record_order() (upsert idempotente). NO toca stock, NO postea a Bitcram, NO
notifica, NO responde IA. Reusable para cualquier cuenta/business.

Uso:
    cd backend && .venv/bin/python scripts/backfill_orders.py --account-id 93
    cd backend && .venv/bin/python scripts/backfill_orders.py --account-id 93 --dry-run --preview 2
    cd backend && .venv/bin/python scripts/backfill_orders.py --platform tiendanube --external-account-id 7625382
"""
import argparse
import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from dotenv import load_dotenv
load_dotenv(BACKEND_DIR / ".env")

# Cloud SQL (modo deploy): DB_HOST vacío -> connector de GCP. El .env trae
# DB_HOST local para dev/tests; forzarlo vacío acá apunta al Cloud SQL de prod.
os.environ["DB_HOST"] = ""
os.environ.setdefault("GOOGLE_APPLICATION_CREDENTIALS",
                      str(BACKEND_DIR / "service_account.json"))

from app.db.helpers import get_one
from app.integrations.core.backfill_orders import backfill_orders
from app.integrations.core.credentials import get_account_owner, UnknownAccount
from app.integrations.core.order_records import normalize_order


def die(message):
    print("✗ " + message, file=sys.stderr)
    sys.exit(1)


def resolve_account(args):
    if args.account_id:
        try:
            return get_one(
                "SELECT * FROM platform_accounts.accounts WHERE id = :id",
                {"id": args.account_id})
        except LookupError:
            die("No existe la cuenta id=%s" % args.account_id)
    if args.platform and args.external_account_id:
        try:
            return get_account_owner(args.external_account_id, args.platform)
        except UnknownAccount:
            die("No existe la cuenta %s id=%s"
                % (args.platform, args.external_account_id))
    die("Indicá --account-id o (--platform + --external-account-id)")


def show_preview(previews):
    if not previews:
        return
    print("\n--- Preview (primeras órdenes, normalizadas) ---")
    for platform, order in previews:
        norm = normalize_order(platform, order)
        print("[%s] id=%s status=%s buyer=%s total=%s items=%d"
              % (platform, order.get("id"), norm.get("channel_status"),
                 norm.get("buyer_name"), norm.get("total"),
                 len(norm.get("items") or [])))
        for it in (norm.get("items") or [])[:3]:
            print("    - sku=%s title=%s qty=%s price=%s"
                  % (it.get("sku"), it.get("title"),
                     it.get("quantity"), it.get("unit_price")))


def main():
    ap = argparse.ArgumentParser(description="Backfill histórico de órdenes ML/TN")
    ap.add_argument("--account-id", type=int, help="PK de platform_accounts.accounts")
    ap.add_argument("--platform", choices=("mercadolibre", "tiendanube"))
    ap.add_argument("--external-account-id", help="user_id ML / store_id TN")
    ap.add_argument("--dry-run", action="store_true", help="solo fetch + preview, sin escribir")
    ap.add_argument("--preview", type=int, default=0, help="cuántas órdenes mostrar (normalizadas)")
    args = ap.parse_args()

    account = resolve_account(args)
    print("Cuenta: id=%s platform=%s external=%s business=%s"
          % (account["id"], account["platform"],
             account["external_account_id"], account["business_id"]))
    if args.dry_run:
        print("MODO DRY-RUN: no se escribe nada.\n")

    result = backfill_orders(account, dry_run=args.dry_run,
                             preview_limit=args.preview)

    show_preview(result["previews"])
    print("\nResultado: fetched=%d written=%d errores=%d"
          % (result["fetched"], result["written"], len(result["errors"])))
    for e in result["errors"][:20]:
        print("  ERROR:", e)
    if len(result["errors"]) > 20:
        print("  ... %d errores más" % (len(result["errors"]) - 20))


if __name__ == "__main__":
    main()
