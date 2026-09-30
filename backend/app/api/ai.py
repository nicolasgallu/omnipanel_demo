"""REST API for the AI assistant (title/description generation via DeepSeek)."""
from flask import Blueprint, jsonify, request

from app.api.auth_utils import require_auth
from app.service.llm_api import call_deepseek_api
from app.utils.logger import logger

ai_bp = Blueprint("ai_api", __name__, url_prefix="/api/ai")

SYS_PROMPTS = {
    "title": (
        "Sos un redactor experto en ecommerce (MercadoLibre/Tienda Nube Argentina). "
        "Mejorá el título del producto según el prompt del usuario. "
        "OBLIGATORIO: devolvé SOLO el título mejorado, sin comillas, sin comentarios ni nada extra. "
        "Máximo 60 caracteres."
    ),
    "description": (
        "Sos un redactor experto en ecommerce (MercadoLibre/Tienda Nube Argentina). "
        "Escribí la descripción del producto según el prompt del usuario. "
        "OBLIGATORIO: devolvé SOLO la descripción, sin comillas, sin comentarios ni nada extra. "
        "Usá un tono comercial claro y directo."
    ),
}


@ai_bp.route("/generate", methods=["POST"])
@require_auth
def generate():
    data = request.get_json(silent=True) or {}
    kind = data.get("kind")
    prompt = (data.get("prompt") or "").strip()
    current = (data.get("current") or "").strip()

    if kind not in SYS_PROMPTS:
        return jsonify({"error": "bad_request", "message": "kind inválido"}), 400
    if not prompt:
        return jsonify({"error": "bad_request", "message": "Escribí un prompt"}), 400

    user_prompt = {"prompt": prompt}
    if current:
        user_prompt["texto_actual"] = current

    try:
        text = call_deepseek_api(SYS_PROMPTS[kind], user_prompt)
    except Exception as exc:
        logger.exception("AI generate failed (kind=%s)", kind)
        return jsonify({"error": "ai_error",
                        "message": "No se pudo generar con IA: %s" % exc}), 502

    if not text:
        return jsonify({"error": "ai_error", "message": "La IA no devolvió nada"}), 502

    return jsonify({"text": str(text).strip()})
