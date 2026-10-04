#!/usr/bin/env python
"""Generador DEV de órdenes fake para el producto de prueba (internal_code 43898).

Simula payloads de MercadoLibre (orders_v2) y TiendaNube contra los webhooks
REALES del backend local, fakeando SOLO el fetch HTTP a Meli/TN (el webhook
nunca confía en el body: siempre re-fetchea la orden). Bitcram queda REAL
(cuenta demo) y las notificaciones de WhatsApp/Telegram se stubbean para no
spamear.

Uso:
    cd backend && .venv/bin/python scripts/fake_orders.py            # run completo
    cd backend && .venv/bin/python scripts/fake_orders.py --cleanup  # borra los FAKE-*

Los ids de las órdenes fake llevan el prefijo FAKE- para ubicarlas en el panel
y poder limpiarlas.
"""
import json
import os
import sys
import uuid

import requests

# Permitir correr desde cualquier cwd: el backend/ es el package root.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

PRODUCT_SKU = "TEST-43898"          # matchea contra inventory.products (sku/gtin)
PRODUCT_TITLE = "Arco de futbol grande (TEST)"
PRODUCT_PRICE = 100
ITEM_ID = "MLA-TEST-43898"

MELI_ORDERS = {}   # order_id -> payload fabricado
TN_ORDERS = {}


# ─── fakes HTTP ────────────────────────────────────────────────────────────────

class FakeResponse:
    def __init__(self, status_code=200, payload=None):
        self.status_code = status_code
        self._payload = payload if payload is not None else {}

    def json(self):
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.exceptions.HTTPError("%d fake" % self.status_code)


def _install_http_fakes():
    """Parchea requests.get SOLO para /orders e /items de Meli y /orders de TN.
    Cualquier otra URL (Bitcram) sigue yendo por HTTP real."""
    real_get = requests.get

    def patched_get(url, **kwargs):
        if url.startswith("https://api.mercadolibre.com/orders/"):
            oid = url.rsplit("/", 1)[-1]
            payload = MELI_ORDERS.get(oid)
            if payload is None:
                raise AssertionError("Fake Meli order %s no registrada" % oid)
            return FakeResponse(200, payload)
        if url.startswith("https://api.mercadolibre.com/items/"):
            # resolve_items() fetchea cada item por su SKU.
            return FakeResponse(200, {"seller_sku": PRODUCT_SKU, "attributes": []})
        if "https://api.tiendanube.com/v1/" in url and "/orders/" in url:
            oid = url.rsplit("/", 1)[-1]
            payload = TN_ORDERS.get(oid)
            if payload is None:
                raise AssertionError("Fake TN order %s no registrada" % oid)
            return FakeResponse(200, payload)
        return real_get(url, **kwargs)

    requests.get = patched_get


def _stub_notifications():
    """No mandar WhatsApp/Telegram reales desde eventos fake (solo log)."""
    import app.service.notifications as n

    def noop(*args, **kwargs):
        print("  [notif stub] %s" % (args[1] if len(args) > 1 else args[:1]))

    n.enviar_mensaje_whapi = noop
    n.enviar_mensaje_telegram = noop
    n.enviar_documento_whapi = noop
    n.enviar_documento_telegram = noop


# ─── payloads fabricados ───────────────────────────────────────────────────────

def meli_payload(status, quantity=1, unit_price=PRODUCT_PRICE, at=None):
    return {
        "id": 999999999,
        "status": status,
        "order_items": [{
            "item": {"id": ITEM_ID, "title": PRODUCT_TITLE, "seller_sku": PRODUCT_SKU},
            "quantity": quantity,
            "unit_price": unit_price,
        }],
        "buyer": {"id": 555000, "nickname": "FAKE-BUYER-ML"},
        "total_amount": quantity * unit_price,
        "paid_amount": quantity * unit_price,
        "currency_id": "ARS",
        "date_created": at,
        "last_updated": at,
        "payments": [],
    }


def tn_payload(status, payment_status, quantity=1, unit_price=PRODUCT_PRICE, at=None):
    """Payload TN fake con contexto de envío (doc oficial del Order resource):
    shipping_status + shipping_address + shipping_option + tracking. El estado
    de envío derivado sigue al order.status: open -> unpacked/shipped,
    closed -> delivered, cancelled -> cancelled."""
    shipping_status = "delivered" if status == "closed" else "unpacked"
    tracking = "FAKE-TRACK-%s" % (str(at)[11:13] if at else "TN")
    return {
        "number": 999999,
        "status": status,
        "payment_status": payment_status,
        "shipping_status": shipping_status,
        "shipping_pickup_type": "ship",
        "shipping": "table",
        "shipping_option": "Correo Argentino a domicilio",
        "shipping_tracking_number": tracking if status in ("closed",) else None,
        "shipping_cost_customer": "950",
        "shipping_cost_owner": "0",
        "shipping_min_days": 2,
        "shipping_max_days": 5,
        "shipping_address": {
            "address": "Av. Siempre Viva", "number": "742", "floor": "",
            "locality": "CABA", "city": "Buenos Aires",
            "province": "Buenos Aires", "zipcode": "1407",
            "country": "AR", "phone": None,
        },
        "products": [{
            "sku": PRODUCT_SKU,
            "name": PRODUCT_TITLE,
            "price": unit_price,
            "quantity": quantity,
        }],
        "customer": {"id": 777000, "name": "FAKE BUYER TN"},
        "total": quantity * unit_price,
        "currency": "ARS",
        "created_at": at,
        "updated_at": at,
    }


# ─── runner ────────────────────────────────────────────────────────────────────

def _iso(h=0):
    from datetime import datetime, timedelta
    return (datetime.utcnow() - timedelta(hours=h)).isoformat() + "Z"


class Runner:
    def __init__(self, client, meli_user_id, tn_store_id):
        self.client = client
        self.meli_user_id = meli_user_id
        self.tn_store_id = tn_store_id
        self.results = []

    def meli(self, oid, status, label=None, hour=0):
        MELI_ORDERS[oid] = meli_payload(status, at=_iso(hour))
        resp = self.client.post("/webhooks/meli", json={
            "topic": "orders_v2",
            "resource": "/orders/" + oid,
            "user_id": self.meli_user_id,
        })
        self.results.append((label or ("ML " + status), oid, resp.get_json(), resp.status_code))

    def tn(self, oid, status, payment_status, label=None, hour=0):
        TN_ORDERS[oid] = tn_payload(status, payment_status, at=_iso(hour))
        resp = self.client.post("/webhooks/sells", json={
            "store_id": self.tn_store_id,
            "id": oid,
        })
        self.results.append((label or ("TN %s+%s" % (status, payment_status)),
                             oid, resp.get_json(), resp.status_code))


def _set_trigger(trigger):
    from app.db.helpers import execute, get_one
    import json as _json
    row = get_one("SELECT config FROM platform_accounts.businesses WHERE id = 1")
    cfg = _json.loads(row["config"]) if isinstance(row["config"], str) else (row["config"] or {})
    cfg.setdefault("stock_sync", {})
    cfg["stock_sync"]["trigger"] = trigger
    execute("UPDATE platform_accounts.businesses SET config = :c WHERE id = 1",
            {"c": _json.dumps(cfg, ensure_ascii=False)})
    print("== trigger seteado: %s ==" % trigger)


# ─── reporte ───────────────────────────────────────────────────────────────────

def _row_report(oid):
    from app.db.helpers import get_all, get_one
    out = {}
    for table, has_payment in (("mercadolibre.orders", False),
                               ("tiendanube.orders", True)):
        cols = ("order_id, status, channel_status, status_history"
                + (", payment_status" if has_payment else ""))
        try:
            row = get_one(
                "SELECT " + cols + " FROM " + table + " WHERE order_id = :o",
                {"o": oid})
            out["tabla"] = table
            out["status_interno"] = row.get("status")
            out["channel_status"] = row.get("channel_status")
            out["payment_status"] = row.get("payment_status")
            hist = row.get("status_history")
            if isinstance(hist, str):
                hist = json.loads(hist)
            out["history"] = [e.get("key") for e in (hist or [])]
            break
        except LookupError:
            continue
    movements = get_all(
        "SELECT direction, status, provider_doc_id, error_message"
        " FROM inventory.stock_movements WHERE order_id = :o ORDER BY id",
        {"o": oid})
    out["movements"] = [{
        "dir": m["direction"], "status": m["status"],
        "doc": m.get("provider_doc_id"), "err": m.get("error_message"),
    } for m in movements]
    return out


def _panel_summary(client, token):
    resp = client.get("/api/sales/orders?q=FAKE-&page_size=200",
                      headers={"Authorization": "Bearer " + token})
    body = resp.get_json()
    print("\n── Panel (GET /api/sales/orders?q=FAKE-) ──")
    print("  total=%s counts=%s" % (body["total"], body["counts"]))
    for it in body["items"]:
        print("  %-14s %-6s %-16s sync=%-14s hist=%s" % (
            it["number"], it["channel"], it["status"], it["stock_sync"],
            [e["raw_status"] for e in it["history"]]))


def _report_all(client, token):
    from app.db.helpers import get_all
    oids = [r["order_id"] for r in get_all(
        "SELECT order_id FROM mercadolibre.orders WHERE order_id LIKE 'FAKE-%'"
        " UNION SELECT order_id FROM tiendanube.orders WHERE order_id LIKE 'FAKE-%'"
        " ORDER BY order_id")]
    print("\n" + "=" * 72)
    print("ESTADO EN DB POR ORDEN")
    print("=" * 72)
    for oid in oids:
        rep = _row_report(oid)
        print("  %-16s tabla=%s interno=%s canal=%s pago=%s" % (
            oid, rep.get("tabla"), rep.get("status_interno"),
            rep.get("channel_status"), rep.get("payment_status")))
        print("     history: %s" % rep.get("history"))
        for m in rep.get("movements"):
            print("     mov %-8s %-16s doc=%s %s" % (
                m["dir"], m["status"], m["doc"],
                ("err=" + str(m["err"])) if m["err"] else ""))
    _panel_summary(client, token)


def cleanup():
    from app.db.helpers import execute
    for table in ("mercadolibre.orders", "tiendanube.orders"):
        execute("DELETE FROM " + table + " WHERE order_id LIKE 'FAKE-%'")
    execute("DELETE FROM tiendanube.shipments WHERE order_id LIKE 'FAKE-%'")
    execute("DELETE FROM inventory.stock_movements WHERE order_id LIKE 'FAKE-%'")
    execute("DELETE FROM platform_accounts.events WHERE external_id LIKE 'FAKE-%'")
    print("Fake orders FAKE-* eliminadas (orders + shipments + movements + events).")


# ─── main ──────────────────────────────────────────────────────────────────────

def main():
    from app.db.helpers import get_all
    from main import app
    from app.api.auth_utils import make_token

    if "--cleanup" in sys.argv:
        cleanup()
        return

    from app.db.helpers import get_all as _get_all

    token = make_token({"id": 1, "business_id": 1, "role": "business",
                        "email": "x@x.com", "full_name": "x"})

    client = app.test_client()

    if "--report" in sys.argv:
        _report_all(client, token)
        return

    accounts = _get_all(
        "SELECT id, platform, external_account_id FROM platform_accounts.accounts"
        " WHERE business_id = 1")
    meli_acc = next((a for a in accounts if a["platform"] == "mercadolibre"), None)
    tn_acc = next((a for a in accounts if a["platform"] == "tiendanube"), None)
    if not meli_acc or not tn_acc or not meli_acc.get("external_account_id") \
            or not tn_acc.get("external_account_id"):
        print("Faltan cuentas ML/TN con external_account_id para business 1")
        return

    _install_http_fakes()
    _stub_notifications()

    r = Runner(client, meli_acc["external_account_id"], tn_acc["external_account_id"])

    print("=" * 72)
    print("PASS 1 — trigger = confirmed (config actual del business 1)")
    print("=" * 72)

    # Meli: secuencia completa confirmada -> pagada -> cancelada.
    r.meli("FAKE-ML-1001", "confirmed", "ML confirmed (venta)", hour=3)
    r.meli("FAKE-ML-1001", "payment_required", "ML payment_required", hour=2)
    r.meli("FAKE-ML-1001", "payment_in_process", "ML payment_in_process", hour=1)
    r.meli("FAKE-ML-1001", "paid", "ML paid (no duplica)", hour=0)
    r.meli("FAKE-ML-1001", "cancelled", "ML cancelled (reversa)", hour=0)
    # Meli: confirmada -> cancelada sin pagar nunca.
    r.meli("FAKE-ML-1002", "confirmed", "ML confirmed (venta)", hour=2)
    r.meli("FAKE-ML-1002", "cancelled", "ML cancelled (reversa sin pago)", hour=0)
    # Meli: confirmada y queda pendiente.
    r.meli("FAKE-ML-1003", "confirmed", "ML confirmed (queda pendiente)", hour=0)
    # Meli: cancelada sola (nunca se confirmó para nosotros).
    r.meli("FAKE-ML-1004", "cancelled", "ML cancelled sola", hour=0)
    # Meli: re-delivery del mismo estado (dedup de history).
    r.meli("FAKE-ML-1003", "confirmed", "ML confirmed re-delivery (dedup)", hour=0)

    # TN: secuencia completa.
    r.tn("FAKE-TN-2001", "open", "pending", "TN open+pending (venta)", hour=4)
    r.tn("FAKE-TN-2001", "open", "authorized", "TN open+authorized", hour=3)
    r.tn("FAKE-TN-2001", "open", "paid", "TN open+paid (no duplica)", hour=2)
    r.tn("FAKE-TN-2001", "closed", "paid", "TN closed (entregada)", hour=0)
    # TN: refunded después de venta.
    r.tn("FAKE-TN-2002", "open", "pending", "TN open+pending (venta)", hour=2)
    r.tn("FAKE-TN-2002", "open", "refunded", "TN refunded (reversa)", hour=0)
    # TN: cancelada después de venta.
    r.tn("FAKE-TN-2003", "open", "pending", "TN open+pending (venta)", hour=2)
    r.tn("FAKE-TN-2003", "cancelled", "paid", "TN cancelled (reversa)", hour=0)
    # TN: voided después de venta.
    r.tn("FAKE-TN-2004", "open", "pending", "TN open+pending (venta)", hour=2)
    r.tn("FAKE-TN-2004", "open", "voided", "TN voided (reversa)", hour=0)
    # TN: re-delivery.
    r.tn("FAKE-TN-2005", "open", "pending", "TN open+pending (venta)", hour=0)
    r.tn("FAKE-TN-2005", "open", "pending", "TN re-delivery (dedup)", hour=0)
    # TN: closed sola (sin open previo).
    r.tn("FAKE-TN-2006", "closed", "paid", "TN closed sola (entregada)", hour=0)

    print("\n" + "=" * 72)
    print("PASS 2 — trigger = paid (para comparar cuándo descuenta)")
    print("=" * 72)
    _set_trigger("paid")

    r.meli("FAKE-ML-3001", "confirmed", "ML confirmed (NO vende)", hour=3)
    r.meli("FAKE-ML-3001", "paid", "ML paid (venta)", hour=2)
    r.meli("FAKE-ML-3001", "cancelled", "ML cancelled (reversa)", hour=0)
    r.meli("FAKE-ML-3002", "confirmed", "ML confirmed (NO vende)", hour=2)
    r.meli("FAKE-ML-3002", "cancelled", "ML cancelled (nada que revertir)", hour=0)
    r.tn("FAKE-TN-3001", "open", "pending", "TN open+pending (NO vende)", hour=3)
    r.tn("FAKE-TN-3001", "open", "paid", "TN open+paid (venta)", hour=2)
    r.tn("FAKE-TN-3001", "closed", "paid", "TN closed (entregada)", hour=0)
    r.tn("FAKE-TN-3002", "open", "refunded", "TN refunded sin venta (sin reversa)", hour=0)

    # Dejar el trigger como estaba (confirmed, la elección del usuario).
    _set_trigger("confirmed")

    print("\n" + "=" * 72)
    print("RESPUESTAS DE LOS WEBHOOKS")
    print("=" * 72)
    for label, oid, body, code in r.results:
        print("  %-32s %-16s -> %s %s" % (label, oid, code, body.get("status")))

    _report_all(client, token)
    print("\nListo. Para limpiar: .venv/bin/python scripts/fake_orders.py --cleanup")


if __name__ == "__main__":
    main()
