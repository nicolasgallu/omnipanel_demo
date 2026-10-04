"""REST API for the AI assistant (title/description generation via DeepSeek)."""
from flask import Blueprint, jsonify, request

from app.api.auth_utils import current_business_id, require_auth
from app.db.helpers import get_one
from app.service.llm_api import call_deepseek_api
from app.service.prompt_defaults import PREPUBLISH_SYS_DEFAULTS
from app.utils.logger import logger

ai_bp = Blueprint("ai_api", __name__, url_prefix="/api/ai")

# kind (contrato del endpoint) -> columna de ai.prompts que guarda el system
# prompt del negocio. La personalización vive en la DB (página Prompts AI),
# no acá: antes esto hardcodeaba sus propios prompts y no respetaba lo que el
# negocio cargaba.
_PROMPT_COLUMNS = {
    "title": "ai_generate_title",
    "description": "ai_generate_description",
}


def _sys_prompt(kind, business_id):
    """System prompt del negocio para `kind`, con fallback al default del
    sistema (prompt_defaults.py): cada negocio puede personalizar su prompt
    de título/descripción; si no lo hizo, se usa el default global."""
    default = PREPUBLISH_SYS_DEFAULTS[kind]
    try:
        row = get_one(
            "SELECT " + _PROMPT_COLUMNS[kind] + " AS prompt"
            " FROM ai.prompts WHERE business_id = :b",
            {"b": business_id})
    except LookupError:
        return default
    return row.get("prompt") or default


@ai_bp.route("/generate", methods=["POST"])
@require_auth
def generate():
    data = request.get_json(silent=True) or {}
    kind = data.get("kind")
    prompt = (data.get("prompt") or "").strip()
    current = (data.get("current") or "").strip()

    if kind not in _PROMPT_COLUMNS:
        return jsonify({"error": "bad_request", "message": "kind inválido"}), 400
    if not prompt:
        return jsonify({"error": "bad_request", "message": "Escribí un prompt"}), 400

    user_prompt = {"prompt": prompt}
    if current:
        user_prompt["texto_actual"] = current

    try:
        text = call_deepseek_api(
            _sys_prompt(kind, current_business_id()), user_prompt)
    except Exception as exc:
        logger.exception("AI generate failed (kind=%s)", kind)
        return jsonify({"error": "ai_error",
                        "message": "No se pudo generar con IA: %s" % exc}), 502

    if not text:
        return jsonify({"error": "ai_error", "message": "La IA no devolvió nada"}), 502

    return jsonify({"text": str(text).strip()})
