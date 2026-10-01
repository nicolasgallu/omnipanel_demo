"""Notificaciones al negocio por WhatsApp (Whapi) y Telegram.

Dos piezas:
1. Senders de bajo nivel (Whapi existente + Telegram nuevo), cada uno con un
   retry y sin silenciar el error final.
2. El sistema de notificaciones en sí: las preferencias viven en el config
   JSON del business (`platform_accounts.businesses.config` ->
   `notifications`), y `notify_business()` es el ÚNICO punto de entrada del
   resto del backend. Lee las prefs, renderiza el mensaje del evento y
   despacha por los canales habilitados.

Regla de oro: best-effort. Un mensaje que no sale NUNCA debe romper la
máquina de estados de ventas ni la respuesta de un webhook; todo fallo se
loguea y el caller sigue de largo.
"""
import json
import re
import time
import uuid

import requests
from requests.exceptions import RequestException

from app.db.helpers import execute, get_one
from app.settings.config import APP_BASE_URL, TELEGRAM_BOT_TOKEN, TOKEN_WHAPI
from app.utils.logger import logger

BUSINESSES_TABLE = "platform_accounts.businesses"
TELEGRAM_BASE_URL = "https://api.telegram.org"


# ─── Senders de bajo nivel ────────────────────────────────────────────────────

def enviar_mensaje_whapi(token, telefono, mensaje):
    url = "https://gate.whapi.cloud/messages/text"

    payload = {
        "to": telefono,
        "body": mensaje
    }

    headers = {
        "accept": "application/json",
        "content-type": "application/json",
        "authorization": f"Bearer {token}"
    }

    for attempt in range(2):
        try:
            response = requests.post(
                url,
                json=payload,
                headers=headers,
                timeout=15
            )

            response.raise_for_status()
            logger.info(f"Whapi message sent to {telefono}.")
            return response

        except RequestException as e:
            if attempt == 0:
                logger.warning(
                    f"Error sending Whapi message to {telefono}. "
                    f"Retrying once... Error: {e}"
                )
                time.sleep(1)
            else:
                logger.exception(
                    f"Failed to send Whapi message to {telefono} after retry: {e}"
                )
                raise


def enviar_mensaje_telegram(token, chat_id, mensaje):
    """Envía un mensaje de texto vía Bot API de Telegram."""
    url = TELEGRAM_BASE_URL + "/bot{token}/sendMessage".format(token=token)
    payload = {"chat_id": chat_id, "text": mensaje}

    for attempt in range(2):
        try:
            response = requests.post(url, json=payload, timeout=15)
            response.raise_for_status()
            logger.info("Telegram message sent to chat %s.", chat_id)
            return response
        except RequestException as e:
            if attempt == 0:
                logger.warning(
                    "Error sending Telegram message to %s. Retrying once... "
                    "Error: %s", chat_id, e)
                time.sleep(1)
            else:
                logger.exception(
                    "Failed to send Telegram message to %s after retry: %s",
                    chat_id, e)
                raise


# ─── Catálogo de eventos y defaults ───────────────────────────────────────────

NOTIFICATION_EVENTS = (
    "order_confirmed",         # primera venta pagada (None -> paid)
    "order_cancelled",         # paid -> cancelled (stock revertido)
    "order_delivered",         # envío llega a 'delivered' (Meli)
    "label_ready",             # envío pasa a 'ready_to_ship' (etiqueta lista)
    "scraping_finished",       # fin de una corrida del scraper (Scrapfly)
    "message_needs_review",    # pregunta/mensaje de Meli sin responder por IA
)

# Claves viejas de eventos (configs guardados antes del rename).
LEGACY_EVENT_KEYS = {
    "shipment_ready": "label_ready",
    "pending_question": "message_needs_review",
}

# Canales por defecto (el negocio puede cambiarlos desde Configuración).
DEFAULT_CHANNELS = {
    "order_confirmed": {"whatsapp": True, "telegram": True},
    "order_cancelled": {"whatsapp": True, "telegram": True},
    "order_delivered": {"whatsapp": False, "telegram": False},
    "label_ready": {"whatsapp": True, "telegram": True},
    "scraping_finished": {"whatsapp": False, "telegram": True},
    "message_needs_review": {"whatsapp": True, "telegram": True},
}


def enviar_documento_whapi(token, telefono, media_url, caption):
    """Envía un documento (PDF) por WhatsApp vía Whapi, con caption.

    Endpoint correcto para archivos: /messages/document (con media URL +
    filename). /messages/media es para responder con media a un MessageID.
    """
    url = "https://gate.whapi.cloud/messages/document"
    filename = media_url.rsplit("/", 1)[-1] if media_url else "etiqueta.pdf"
    payload = {
        "to": telefono,
        "media": media_url,
        "filename": filename,
        "caption": caption,
    }
    headers = {
        "accept": "application/json",
        "content-type": "application/json",
        "authorization": "Bearer " + token,
    }
    for attempt in range(2):
        try:
            response = requests.post(url, json=payload, headers=headers, timeout=20)
            response.raise_for_status()
            logger.info("Whapi document sent to %s.", telefono)
            return response
        except RequestException as e:
            if attempt == 0:
                logger.warning(
                    "Error sending Whapi document to %s. Retrying once... "
                    "Error: %s", telefono, e)
                time.sleep(1)
            else:
                logger.exception(
                    "Failed to send Whapi document to %s after retry: %s",
                    telefono, e)
                raise


def enviar_documento_telegram(token, chat_id, document_url, caption):
    """Envía un documento (PDF) vía Bot API de Telegram (soporta URL)."""
    url = TELEGRAM_BASE_URL + "/bot{token}/sendDocument".format(token=token)
    payload = {"chat_id": chat_id, "document": document_url, "caption": caption}
    for attempt in range(2):
        try:
            response = requests.post(url, json=payload, timeout=20)
            response.raise_for_status()
            logger.info("Telegram document sent to chat %s.", chat_id)
            return response
        except RequestException as e:
            if attempt == 0:
                logger.warning(
                    "Error sending Telegram document to %s. Retrying once... "
                    "Error: %s", chat_id, e)
                time.sleep(1)
            else:
                logger.exception(
                    "Failed to send Telegram document to %s after retry: %s",
                    chat_id, e)
                raise


# Máximo de contactos por canal (WhatsApp y Telegram).
MAX_CONTACTS_PER_CHANNEL = 10
MAX_LABEL_LENGTH = 24


def _channel_name(channel):
    return "WhatsApp" if channel == "whatsapp" else "Telegram"


def _destination_key(channel, destination):
    """Clave de dedupe: dígitos (WPP, ignora formato) o chat id exacto (TG)."""
    return re.sub(r"\D", "", destination) if channel == "whatsapp" else destination


def _clean_destination(channel, value):
    """Valida el destino de un contacto y lo devuelve limpio (trim).

    Contrato del front: WhatsApp en formato internacional (10-15 dígitos),
    Telegram chat id numérico. Mensajes espejo de los del front.
    """
    destination = value.strip() if isinstance(value, str) else ""
    if channel == "whatsapp":
        if not destination:
            raise ValueError("Ingresá un número de WhatsApp.")
        if (not re.fullmatch(r"\+?[\d\s\-()]+", destination)
                or not 10 <= len(re.sub(r"\D", "", destination)) <= 15):
            raise ValueError(
                "Número inválido. Usá formato internacional con código de "
                "país, ej. +54 9 11 2345 6789.")
        return destination
    if not destination:
        raise ValueError("Ingresá un chat id.")
    if not re.fullmatch(r"-?\d+", destination):
        raise ValueError("El chat id tiene que ser numérico (ej. 123456789).")
    return destination


def _clean_contact_list(raw, channel):
    """Valida la lista de contactos de un canal: normaliza, dedupea y topa.

    Cada contacto queda {"id", "label", "destination", "enabled"}. El dedupe
    es por destino normalizado y el error nombra al contacto que ya lo tiene
    (mensaje espejo del front). El `id` es opaco: lo genera el front, pero si
    falta se crea uno acá para no romper el guardado.
    """
    if not isinstance(raw, list):
        raise ValueError("Los contactos de %s deben ser una lista"
                         % _channel_name(channel))
    if len(raw) > MAX_CONTACTS_PER_CHANNEL:
        raise ValueError("Máximo %d contactos de %s por negocio"
                         % (MAX_CONTACTS_PER_CHANNEL, _channel_name(channel)))

    cleaned = []
    seen = {}  # destino normalizado -> label del contacto que ya lo tiene
    for entry in raw:
        if not isinstance(entry, dict):
            raise ValueError("Cada contacto de %s debe ser un objeto"
                             % _channel_name(channel))

        contact_id = entry.get("id")
        if not isinstance(contact_id, str) or not contact_id.strip():
            contact_id = "c-" + uuid.uuid4().hex[:12]

        label = entry.get("label")
        if not isinstance(label, str) or not label.strip():
            raise ValueError("Poné una etiqueta corta (ej. Nico, Depósito).")
        label = label.strip()
        if len(label) > MAX_LABEL_LENGTH:
            raise ValueError("Máximo %d caracteres." % MAX_LABEL_LENGTH)

        destination = _clean_destination(channel, entry.get("destination"))
        key = _destination_key(channel, destination)
        if key in seen:
            raise ValueError('Este destino ya está cargado para "%s".'
                             % seen[key])
        seen[key] = label

        enabled = entry.get("enabled", True)
        if not isinstance(enabled, bool):
            raise ValueError("El estado activo del contacto debe ser "
                             "true o false")

        cleaned.append({"id": contact_id, "label": label,
                        "destination": destination, "enabled": enabled})
    return cleaned


def default_settings():
    """Shape completo que devuelve GET /api/notifications/settings."""
    return {
        "whatsapp_contacts": [],
        "telegram_contacts": [],
        "events": {k: dict(v) for k, v in DEFAULT_CHANNELS.items()},
    }


# ─── Preferencias del negocio (businesses.config -> notifications) ────────────

def _raw_config(business_id):
    try:
        row = get_one(
            "SELECT config FROM " + BUSINESSES_TABLE + " WHERE id = :b",
            {"b": business_id})
    except LookupError:
        return {}
    raw = row.get("config")
    if raw is None:
        return {}
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except ValueError:
            logger.warning("Malformed config JSON for business %s", business_id)
            return {}
    return raw if isinstance(raw, dict) else {}


def _save_config(business_id, config):
    execute(
        "UPDATE " + BUSINESSES_TABLE + " SET config = :c WHERE id = :b",
        {"c": json.dumps(config, ensure_ascii=False), "b": business_id})


def load_notification_settings(business_id):
    """Prefs guardadas + defaults: GET nunca devuelve el shape incompleto.

    Compat retroactiva: si el config tiene el formato viejo (un solo destino
    por canal), se migra en memoria a una lista de 1 contacto etiquetado
    "Principal". La API ya no expone campos legacy.
    """
    stored = _raw_config(business_id).get("notifications") or {}
    settings = default_settings()
    if not isinstance(stored, dict):
        return settings

    for channel, list_key, legacy_key in (
            ("whatsapp", "whatsapp_contacts", "whatsapp_phone"),
            ("telegram", "telegram_contacts", "telegram_chat_id")):
        contacts = stored.get(list_key)
        if isinstance(contacts, list):
            settings[list_key] = contacts
        else:
            legacy = stored.get(legacy_key)
            if isinstance(legacy, str) and legacy:
                settings[list_key] = [{
                    "id": "legacy-" + channel,
                    "label": "Principal",
                    "destination": legacy,
                    "enabled": True,
                }]

    events = stored.get("events")
    if isinstance(events, dict):
        # Compat retroactiva: configs guardados con las claves viejas de eventos.
        for legacy, current in LEGACY_EVENT_KEYS.items():
            if legacy in events and current not in events:
                events[current] = events[legacy]
        for key in NOTIFICATION_EVENTS:
            entry = events.get(key)
            if not isinstance(entry, dict):
                continue
            if isinstance(entry.get("whatsapp"), bool):
                settings["events"][key]["whatsapp"] = entry["whatsapp"]
            if isinstance(entry.get("telegram"), bool):
                settings["events"][key]["telegram"] = entry["telegram"]
    return settings


def save_notification_settings(business_id, settings):
    """Persiste el objeto completo (reemplazo) en businesses.config."""
    config = _raw_config(business_id)
    config["notifications"] = settings
    _save_config(business_id, config)


def validate_notification_settings(data):
    """Valida el payload del PUT. Devuelve settings limpios o levanta ValueError."""
    if not isinstance(data, dict):
        raise ValueError("El body debe ser un objeto JSON")

    settings = default_settings()

    # Contactos por canal (listas, máx. 10). El PUT reemplaza el objeto
    # completo; si una lista no viene, queda vacía (la borra).
    settings["whatsapp_contacts"] = _clean_contact_list(
        data.get("whatsapp_contacts") or [], "whatsapp")
    settings["telegram_contacts"] = _clean_contact_list(
        data.get("telegram_contacts") or [], "telegram")

    events = data.get("events")
    if events is not None:
        if not isinstance(events, dict):
            raise ValueError("El campo events debe ser un objeto")
        for key in NOTIFICATION_EVENTS:
            entry = events.get(key)
            if entry is None:
                continue
            if not isinstance(entry, dict):
                raise ValueError("La configuración del evento %s es inválida" % key)
            for channel in ("whatsapp", "telegram"):
                value = entry.get(channel)
                if value is None:
                    continue
                if not isinstance(value, bool):
                    raise ValueError(
                        "Los canales de %s deben ser true o false" % key)
                settings["events"][key][channel] = value

    return settings


# ─── Mensajes ─────────────────────────────────────────────────────────────────

def platform_display_name(platform):
    return {"mercadolibre": "MercadoLibre", "tiendanube": "Tienda Nube"}.get(
        platform, platform)


def _format_money(total):
    return "${:,.0f}".format(total or 0).replace(",", ".")


def _order_summary(order):
    """(cantidad, total) desde el payload crudo de la orden (sin HTTP)."""
    if not isinstance(order, dict):
        return None, None
    raw = order.get("products") if "products" in order else order.get("order_items")
    if not isinstance(raw, list):
        return None, None
    quantity, total = 0, 0.0
    for item in raw:
        if not isinstance(item, dict):
            continue
        try:
            q = int(item.get("quantity") or 0)
            price = float(item.get("unit_price") or item.get("price") or 0)
        except (TypeError, ValueError):
            continue
        quantity += q
        total += q * price
    return quantity, total


def render_message(event_key, context):
    """Plantillas por evento. context = {platform?, order_id?, order?, ...}."""
    context = context if isinstance(context, dict) else {}
    platform = platform_display_name(context.get("platform") or "")
    order_id = str(context.get("order_id") or "—")

    if event_key == "order_confirmed":
        msg = "🟢 Venta confirmada · {} · Orden {}".format(platform, order_id)
        quantity, total = _order_summary(context.get("order"))
        if quantity:
            msg += " · {} producto{} · {}".format(
                quantity, "s" if quantity != 1 else "", _format_money(total))
        return msg
    if event_key == "order_cancelled":
        return "🔴 Orden cancelada · {} · Orden {} · stock revertido".format(
            platform, order_id)
    if event_key == "order_delivered":
        return "📦 Orden entregada · {} · Orden {}".format(platform, order_id)
    if event_key == "label_ready":
        shipment_id = str(context.get("shipment_id") or "—")
        return ("🏷️ Envío listo para despachar · Envío {} · Orden {}. "
                "MercadoLibre todavía no terminó de generar la etiqueta — "
                "descargala desde la app en unos minutos.").format(
                    shipment_id, order_id)
    if event_key == "scraping_finished":
        total = int(context.get("total") or 0)
        errors = int(context.get("errors") or 0)
        msg = "🔎 Scraping finalizado · {} producto{} analizado{}".format(
            total, "s" if total != 1 else "", "s" if total != 1 else "")
        if errors:
            msg += " · {} error{}".format(errors, "es" if errors != 1 else "")
        return msg
    if event_key == "message_needs_review":
        buyer = str(context.get("buyer_name") or "Comprador")
        product = str(context.get("product_title") or "producto")
        snippet = (str(context.get("snippet") or "")[:80])
        reason = str(context.get("reason") or "")
        mid = context.get("message_id")
        link = "{}/preguntas?open={}".format(APP_BASE_URL, mid)
        return ("🔔 Nueva consulta sin responder · {}\n{}: “{}”\nMotivo: {}\n"
                "Respondé desde acá: {}").format(product, buyer, snippet, reason, link)
    return "🔔 {}".format(context.get("message") or event_key)


# ─── Dispatch ─────────────────────────────────────────────────────────────────

def _safe_send(send_fn, *args):
    """Un canal que falla no afecta a los demás ni al caller."""
    try:
        send_fn(*args)
    except Exception:
        logger.exception("Notification send failed (%s)",
                         getattr(send_fn, "__name__", "unknown"))


def _shipment_ready_caption(context):
    """Caption del documento de la etiqueta (sin la nota de fallback)."""
    shipment_id = str(context.get("shipment_id") or "—")
    order_id = str(context.get("order_id") or "—")
    return "🏷️ Etiqueta lista para despachar · Envío {} · Orden {}".format(
        shipment_id, order_id)


def _dispatch_contacts(business_id, channel, contacts, token, document_url,
                       message):
    """Manda el evento a todos los contactos activos del canal.

    Best-effort por contacto (via `_safe_send`): si un destino falla, los
    demás siguen. Secuencial alcanza para máx. 10 contactos (los senders ya
    reintentan una vez); no vale la pena threads en Flask.
    """
    if not token:
        logger.warning("%s notification skipped for business %s: sin token de plataforma",
                       _channel_name(channel), business_id)
        return
    active = [c for c in contacts if c.get("enabled")]
    if not active:
        logger.warning("%s notification skipped for business %s: sin contactos activos",
                       _channel_name(channel), business_id)
        return
    for contact in active:
        dest = contact.get("destination")
        if not dest:
            continue
        if channel == "whatsapp":
            if document_url:
                _safe_send(enviar_documento_whapi, token, dest,
                           document_url, message)
            else:
                _safe_send(enviar_mensaje_whapi, token, dest, message)
        else:
            if document_url:
                _safe_send(enviar_documento_telegram, token, dest,
                           document_url, message)
            else:
                _safe_send(enviar_mensaje_telegram, token, dest, message)


def notify_business(business_id, event_key, context):
    """Envía el evento al negocio por los canales habilitados. Nunca levanta.

    Soporta documentos: si context trae `document_url` (p. ej. la etiqueta en
    PDF de `label_ready`), se manda como documento con caption; si no, el
    mensaje de texto renderizado (fallback). El documento es una URL pública
    que se reutiliza para todos los contactos (no se regenera por destino).
    """
    try:
        settings = load_notification_settings(business_id)
    except Exception:
        logger.exception("Could not load notification settings for business %s",
                         business_id)
        return
    events = settings.get("events") or {}
    channels = events.get(event_key) or {}
    if not channels.get("whatsapp") and not channels.get("telegram"):
        return

    document_url = context.get("document_url") if isinstance(context, dict) else None
    caption = _shipment_ready_caption(context) if document_url else None
    message = caption if document_url else render_message(event_key, context)

    if channels.get("whatsapp"):
        _dispatch_contacts(business_id, "whatsapp",
                           settings.get("whatsapp_contacts") or [],
                           TOKEN_WHAPI, document_url, message)
    if channels.get("telegram"):
        _dispatch_contacts(business_id, "telegram",
                           settings.get("telegram_contacts") or [],
                           TELEGRAM_BOT_TOKEN, document_url, message)


# ─── Mensaje de prueba (POST /api/notifications/test) ─────────────────────────

class ChannelUnavailable(Exception):
    """La plataforma no configuró el token del canal (env)."""


class DestinationMissing(Exception):
    """El negocio no cargó su destino para el canal."""


TEST_MESSAGE = "✅ Mensaje de prueba de Omnipanel: ¡tus notificaciones están funcionando!"


def send_test_message(business_id, channel, contact=None):
    """Envía el mensaje de prueba por un canal. Levanta errores controlados.

    `contact` (opcional) es el contacto que se quiere probar
    ({destination}); sin él se usa el primer contacto activo guardado.
    """
    settings = load_notification_settings(business_id)
    destination = None
    if isinstance(contact, dict):
        destination = contact.get("destination")
        if destination is not None and not isinstance(destination, str):
            raise ValueError("El destino del contacto debe ser texto")
    if channel == "whatsapp":
        if not TOKEN_WHAPI:
            raise ChannelUnavailable("WhatsApp")
        phone = None
        if destination is not None:
            phone = _clean_destination(channel, destination)
        else:
            active = [c for c in (settings.get("whatsapp_contacts") or [])
                      if c.get("enabled")]
            phone = active[0].get("destination") if active else None
        if not phone:
            raise DestinationMissing("WhatsApp")
        enviar_mensaje_whapi(TOKEN_WHAPI, phone, TEST_MESSAGE)
        return
    if channel == "telegram":
        if not TELEGRAM_BOT_TOKEN:
            raise ChannelUnavailable("Telegram")
        chat_id = None
        if destination is not None:
            chat_id = _clean_destination(channel, destination)
        else:
            active = [c for c in (settings.get("telegram_contacts") or [])
                      if c.get("enabled")]
            chat_id = active[0].get("destination") if active else None
        if not chat_id:
            raise DestinationMissing("Telegram")
        enviar_mensaje_telegram(TELEGRAM_BOT_TOKEN, chat_id, TEST_MESSAGE)
        return
    raise ValueError("Canal desconocido: " + str(channel))
