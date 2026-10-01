import os
import threading
import uuid

from flask import Flask, jsonify
from werkzeug.exceptions import HTTPException

from app.api.admin import admin_bp
from app.api.ai import ai_bp
from app.api.auth import auth_bp
from app.api.channels import channels_bp
from app.api.credentials import credentials_bp
from app.api.images_event import images
from app.api.inventory import inventory_bp
from app.api.messages_api import messages_api_bp
from app.api.notifications_api import notifications_bp
from app.api.oauth import oauth_bp
from app.api.platform_admin import platform_bp
from app.api.publish_event import publications
from app.api.support import support_bp
from app.settings.config import CORS_ORIGIN
from app.utils.logger import set_event_id
from app.webhook.item_event import item_status
from app.webhook.meli_dispatcher import meli
from app.webhook.selling_event import sells
from app.webhook.task_worker import task_worker


def create_app():
    app = Flask(__name__)
    app.json.ensure_ascii = False

    # Webhooks (existing)
    app.register_blueprint(images)
    app.register_blueprint(publications)
    app.register_blueprint(sells)
    app.register_blueprint(item_status)
    app.register_blueprint(meli)
    # Worker interno de Cloud Tasks (handlers pesados de topics Meli).
    app.register_blueprint(task_worker)

    # REST API for the frontend (new)
    app.register_blueprint(auth_bp)
    app.register_blueprint(ai_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(inventory_bp)
    app.register_blueprint(channels_bp)
    app.register_blueprint(credentials_bp)
    app.register_blueprint(oauth_bp)
    app.register_blueprint(support_bp)
    app.register_blueprint(notifications_bp)
    app.register_blueprint(messages_api_bp)
    # Panel de plataforma: admins gestionan businesses y cuentas.
    app.register_blueprint(platform_bp)

    # Pre-calienta el pool de Cloud SQL en background: la primera conexión del
    # connector tarda ~2-3s (TLS + handshake); así el primer request del
    # usuario no paga ese costo. Best-effort: si la DB no está disponible,
    # simplemente no pasa nada.
    def _warm_db_pool():
        try:
            from app.db.helpers import get_one
            get_one("SELECT 1")
        except Exception:
            pass

    threading.Thread(target=_warm_db_pool, daemon=True).start()

    # Correlación de logs por request (Fase 1 observabilidad): cada request
    # del dashboard REST recibe un id fresco (`req-...`) que queda estampado
    # en todas sus líneas de log como [event=req-xxxx]. Las acciones que
    # registran un evento de auditoría lo reemplazan por el id de esa fila
    # (set_event_id en channels.py), así Cloud Logging se puede filtrar por
    # [event=<id>]. Los webhooks manejan su propio id y no pasan por acá
    # (ruta /webhooks/*).
    @app.before_request
    def _tag_api_request():
        from flask import request as current_request

        if current_request.path.startswith("/api/"):
            set_event_id("req-" + uuid.uuid4().hex[:8])

    @app.after_request
    def _untag_api_request(resp):
        # El contextvar vive por thread (gthread reutiliza threads entre
        # requests): limpiarlo acá evita que un id viejo contamine el
        # próximo request que toque el mismo thread.
        set_event_id(None)
        return resp

    @app.after_request
    def add_cors(resp):
        resp.headers["Access-Control-Allow-Origin"] = CORS_ORIGIN
        resp.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        resp.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
        return resp

    @app.errorhandler(HTTPException)
    def handle_http(exc):
        """Return proper JSON for /api routes; default HTML elsewhere.

        Must be registered alongside the Exception handler, otherwise 404s
        (HTTPException subclasses Exception) would be swallowed by the generic
        handler and returned as 500s.
        """
        from flask import request as current_request

        if current_request.path.startswith("/api"):
            return jsonify({
                "error": exc.name.lower().replace(" ", "_"),
                "message": exc.description,
            }), exc.code
        return exc

    @app.errorhandler(Exception)
    def handle_unexpected(exc):
        """Return JSON errors for /api routes (e.g. DB down) instead of HTML."""
        from flask import request as current_request
        from app.utils.logger import logger

        if current_request.path.startswith("/api"):
            logger.exception("Unhandled error on %s", current_request.path)
            message = str(exc)[:200] or "Error interno del servidor"
            return jsonify({"error": "internal_error", "message": message}), 500
        raise exc

    @app.route("/api/health")
    def health():
        return jsonify({"status": "ok"})

    # Sirve el frontend compilado (contenedor mergeado de Cloud Run). No-op en
    # dev/tests porque frontend_dist/ no existe.
    _serve_frontend(app)

    return app


def _serve_frontend(app):
    """Sirve frontend_dist/ (SPA) con fallback a index.html.

    Solo se activa en la imagen mergeada de Cloud Run, donde el build del
    frontend vive en frontend_dist/. En dev/tests ese directorio no existe, así
    que la API y los webhooks se comportan exactamente igual que antes.
    """
    from flask import abort, send_from_directory

    dist_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "frontend_dist")
    if not os.path.isdir(dist_dir):
        return

    @app.route("/")
    @app.route("/<path:path>")
    def spa(path=""):
        # /api/* y /webhooks/* pertenecen a los blueprints; si una request llega
        # hasta acá es que no matcheó ninguna ruta, así que devolvemos el 404
        # JSON de siempre (handle_http) en lugar del HTML del SPA.
        if path.startswith(("api/", "webhooks/")) or path in ("api", "webhooks"):
            abort(404)
        full = os.path.join(dist_dir, path)
        if path and os.path.isfile(full):
            return send_from_directory(dist_dir, path)
        return send_from_directory(dist_dir, "index.html")


app = create_app()

if __name__ == "__main__":
    # Local development: python main.py  (same shape as gunicorn in prod)
    app.run(
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8080")),
        debug=os.getenv("FLASK_DEBUG", "0") == "1",
    )
