"""Descarga de etiquetas de envío (PDF) de MercadoLibre.

Endpoint moderno documentado: GET /marketplace/shipments/{id}/labels (PDF
directo). Fallback legacy del vendedor: GET /shipment_labels?shipment_ids=...
&response_type=pdf (responde un ZIP con el PDF adentro).

Reglas de Meli (verificadas contra la doc oficial):
- La etiqueta está disponible cuando el envío pasa a 'ready_to_ship'
  (pago procesado). Se puede reimprimir hasta que pasa a 'delivered'.
- Envíos Full (Fulfillment) no tienen etiqueta por API pública
  (SHPLAB0218 / INVALID_SHIPMENT_FF_PUBLIC).
"""
import io
import time
import zipfile

from app.integrations.mercadolibre.product_handler import _meli_request
from app.utils.logger import logger

MELI_BASE_URL = "https://api.mercadolibre.com"
LABELS_BUCKET = "pictures_ecommerce_guiaslocales"


class LabelUnavailable(Exception):
    """La etiqueta no está disponible (mensaje legible para el usuario)."""


def _pdf_bytes_from_response(response):
    """Normaliza la respuesta de Meli a bytes de PDF (ZIP o PDF directo)."""
    raw = response.content
    if not raw:
        raise LabelUnavailable("MercadoLibre devolvió una etiqueta vacía")
    # ZIP (endpoint legacy): extraer el primer archivo.
    if raw[:2] == b"PK":
        try:
            with zipfile.ZipFile(io.BytesIO(raw)) as z:
                for name in z.namelist():
                    if name.lower().endswith(".pdf") or len(z.namelist()) == 1:
                        return z.read(name)
                raise LabelUnavailable("El ZIP de la etiqueta no trae PDF")
        except LabelUnavailable:
            raise
        except Exception as exc:
            raise LabelUnavailable("No se pudo leer la etiqueta: %s" % exc)
    # PDF directo.
    if raw[:5] == b"%PDF-":
        return raw
    # Algunas respuestas traen el PDF con un prefijo mínimo; si no matchea,
    # devolverlo igual: el caller decide.
    return raw


def _label_error(response):
    """Mensaje legible desde la respuesta de error de Meli."""
    try:
        body = response.json()
    except Exception:
        body = {}
    if isinstance(body, dict):
        # Endpoint moderno: causa conocida de Full (antes que el message
        # genérico, que en este caso es "INVALID_SHIPMENT_FF_PUBLIC").
        if body.get("error") == "SHPLAB0218" or "INVALID_SHIPMENT_FF_PUBLIC" in str(body):
            return ("No disponible para envíos Full (Fulfillment): la etiqueta "
                    "la gestiona MercadoLibre internamente.")
        msg = body.get("message")
        if body.get("error") == "unauthorized_scopes" and isinstance(msg, str) \
                and "delivered" in msg:
            return "La etiqueta ya no está disponible (envío entregado)."
        # Endpoint legacy: failed_shipments[].message.
        for fs in body.get("failed_shipments") or []:
            if isinstance(fs, dict) and fs.get("message"):
                return str(fs["message"])
        if msg and isinstance(msg, str):
            return msg
    if response.status_code == 404:
        return "Envío no encontrado en MercadoLibre"
    return "MercadoLibre todavía no generó la etiqueta — volvé a intentar en unos minutos."


def fetch_shipment_label_pdf(token, shipment_id, retries=1, delay=2):
    """Devuelve los bytes del PDF de la etiqueta del envío.

    Levanta LabelUnavailable con mensaje legible si no está disponible. Con
    retries>1 reintenta el fallo "todavía no generada" con espera (el webhook
    de ready_to_ship puede llegar antes que la etiqueta).
    """
    last_error = None
    for attempt in range(max(1, retries)):
        # 1) Endpoint moderno documentado.
        response = _meli_request(
            "GET", MELI_BASE_URL + "/marketplace/shipments/" + str(shipment_id) + "/labels",
            token, timeout=30)
        if response.status_code == 200:
            return _pdf_bytes_from_response(response)
        modern_error = _label_error(response)

        # 2) Fallback legacy (ZIP con el PDF).
        response = _meli_request(
            "GET", MELI_BASE_URL + "/shipment_labels", token,
            params={"shipment_ids": str(shipment_id), "response_type": "pdf"},
            timeout=30)
        if response.status_code == 200:
            return _pdf_bytes_from_response(response)

        # El error definitivo: el del legacy, salvo que responda 404 (ahí el de
        # la moderna es más específico: SHPLAB0218/Full, delivered, etc.).
        last_error = _label_error(response)
        if response.status_code == 404:
            last_error = modern_error
        if attempt < retries - 1:
            logger.warning("Label not ready for shipment %s (intento %d/%d): %s",
                           shipment_id, attempt + 1, retries, last_error)
            time.sleep(delay)
    raise LabelUnavailable(last_error or "Etiqueta no disponible")


def upload_label_to_gcs(shipment_id, pdf_bytes):
    """Sube la etiqueta al bucket público (necesario para mandarla como
    documento por Whapi/Telegram) y devuelve la URL pública."""
    from google.cloud import storage  # deferred: heavy import

    blob_path = "shipment_labels/{}.pdf".format(shipment_id)
    bucket = storage.Client().bucket(LABELS_BUCKET)
    blob = bucket.blob(blob_path)
    blob.upload_from_string(pdf_bytes, content_type="application/pdf")
    logger.info("Label uploaded to gs://%s/%s", LABELS_BUCKET, blob_path)
    return blob.public_url
