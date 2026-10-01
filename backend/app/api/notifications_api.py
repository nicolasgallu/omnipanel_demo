"""REST API de notificaciones (business-only).

- GET  /api/notifications/settings -> contactos por canal (máx. 10 de
  WhatsApp y 10 de Telegram, cada uno {id, label, destination, enabled})
  + eventos habilitados. Sin campos legacy.
- PUT  /api/notifications/settings -> guarda el objeto completo (reemplazo).
- POST /api/notifications/test     -> mensaje de prueba por un canal; con
  `contact` opcional ({destination}) para probar un contacto concreto.

Las preferencias viven en businesses.config -> notifications (mismo patrón
que stock_sync / logo_url). Los tokens de los canales (Whapi / Telegram) son
de plataforma (env) y nunca viajan por esta API.
"""
from flask import Blueprint, jsonify, request

from app.api.auth_utils import current_business_id, require_auth, require_business
from app.service.notifications import (
    ChannelUnavailable,
    DestinationMissing,
    load_notification_settings,
    save_notification_settings,
    send_test_message,
    validate_notification_settings,
)
from app.utils.logger import logger

notifications_bp = Blueprint("notifications_api", __name__, url_prefix="/api")

DESTINATION_MESSAGES = {
    "whatsapp": "Configurá tu número de WhatsApp antes de enviar una prueba",
    "telegram": "Configurá tu chat id de Telegram antes de enviar una prueba",
}


@notifications_bp.route("/notifications/settings", methods=["GET"])
@require_auth
@require_business
def get_notification_settings():
    return jsonify(load_notification_settings(current_business_id()))


@notifications_bp.route("/notifications/settings", methods=["PUT"])
@require_auth
@require_business
def put_notification_settings():
    data = request.get_json(silent=True) or {}
    try:
        settings = validate_notification_settings(data)
    except ValueError as exc:
        return jsonify({"error": "bad_request", "message": str(exc)}), 400

    save_notification_settings(current_business_id(), settings)
    logger.info("Notification settings saved for business %s", current_business_id())
    return jsonify({"status": "ok"})


@notifications_bp.route("/notifications/test", methods=["POST"])
@require_auth
@require_business
def test_notification():
    data = request.get_json(silent=True) or {}
    channel = data.get("channel")
    if channel not in ("whatsapp", "telegram"):
        return jsonify({"error": "bad_request",
                        "message": "El canal debe ser whatsapp o telegram"}), 400

    try:
        send_test_message(current_business_id(), channel,
                          data.get("contact"))
    except ValueError as exc:
        # Destino/contacto inválido -> error de validación legible (400).
        return jsonify({"error": "bad_request", "message": str(exc)}), 400
    except DestinationMissing:
        return jsonify({"error": "missing_destination",
                        "message": DESTINATION_MESSAGES[channel]}), 400
    except ChannelUnavailable:
        return jsonify({"error": "channel_unavailable",
                        "message": ("El canal de %s no está disponible en la "
                                    "plataforma todavía" % channel.capitalize())}), 503
    except Exception as exc:
        logger.exception("Test notification failed (%s)", channel)
        return jsonify({"error": "send_failed",
                        "message": ("No se pudo enviar el mensaje de prueba. "
                                    "Revisá el destino y volvé a intentar. (%s)"
                                    % str(exc)[:120])}), 502

    return jsonify({"status": "ok"})
