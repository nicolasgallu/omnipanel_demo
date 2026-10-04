#!/usr/bin/env python
"""backfill.py — backfills históricos de MercadoLibre/TiendaNube (PULL + LOAD, sin side-effects).

Subcomandos:
    orders       -> mercadolibre.orders / tiendanube.orders
    questions    -> mercadolibre.messages (kind=question)
    shipments    -> mercadolibre.shipments
    tn-shipments -> tiendanube.shipments (envíos 1:1 con la orden TN)

Nunca dispara stock, notificaciones ni IA. Idempotente por unique keys.
Reusable para cualquier cuenta/business.

Uso:
    cd backend && .venv/bin/python scripts/backfill.py orders --account-id 93
    cd backend && .venv/bin/python scripts/backfill.py questions --account-id 93 --dry-run
    cd backend && .venv/bin/python scripts/backfill.py shipments --platform mercadolibre --external-account-id 3163704794
    cd backend && .venv/bin/python scripts/backfill.py tn-shipments --platform tiendanube --external-account-id 12345
"""
import argparse
import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from dotenv import load_dotenv
load_dotenv(BACKEND_DIR / ".env")

# Cloud SQL (modo deploy): DB_HOST vacío -> connector de GCP.
os.environ["DB_HOST"] = ""
os.environ.setdefault("GOOGLE_APPLICATION_CREDENTIALS",
                      str(BACKEND_DIR / "service_account.json"))

from app.db.helpers import get_one
from app.integrations.core.backfill import (
    backfill_questions,
    backfill_questions_enrich,
    backfill_shipments,
    backfill_tn_shipments,
)
from app.integrations.core.backfill_orders import backfill_orders
from app.integrations.core.credentials import get_account_owner, UnknownAccount


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


def main():
    ap = argparse.ArgumentParser(description="Backfills históricos ML/TN")
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name in ("orders", "questions", "questions-enrich", "shipments",
                 "tn-shipments"):
        p = sub.add_parser(name)
        p.add_argument("--account-id", type=int, help="PK de platform_accounts.accounts")
        p.add_argument("--platform", choices=("mercadolibre", "tiendanube"))
        p.add_argument("--external-account-id", help="user_id ML / store_id TN")
        p.add_argument("--dry-run", action="store_true", help="solo fetch, sin escribir")
    args = ap.parse_args()

    account = resolve_account(args)
    print("Cuenta: id=%s platform=%s external=%s business=%s"
          % (account["id"], account["platform"],
             account["external_account_id"], account["business_id"]))
    if args.dry_run:
        print("MODO DRY-RUN: no se escribe nada.\n")

    if args.cmd == "orders":
        result = backfill_orders(account, dry_run=args.dry_run)
    elif args.cmd == "questions":
        result = backfill_questions(account, dry_run=args.dry_run)
    elif args.cmd == "questions-enrich":
        result = backfill_questions_enrich(account, dry_run=args.dry_run)
    elif args.cmd == "tn-shipments":
        if account["platform"] != "tiendanube":
            die("tn-shipments requiere una cuenta tiendanube")
        result = backfill_tn_shipments(account, dry_run=args.dry_run)
    else:
        result = backfill_shipments(account, dry_run=args.dry_run)

    if args.cmd == "questions-enrich":
        print("Resultado: preguntas=%d nombres=%d respuestas=%d errores=%d"
              % (result["fetched"], result["names"], result["answers"],
                 len(result["errors"])))
    else:
        print("Resultado: fetched=%d written=%d errores=%d"
              % (result["fetched"], result["written"], len(result["errors"])))
    for e in result["errors"][:20]:
        print("  ERROR:", e)
    if len(result["errors"]) > 20:
        print("  ... %d errores más" % (len(result["errors"]) - 20))


if __name__ == "__main__":
    main()
