import contextvars
import logging
import sys

# Per-request correlation: each webhook sets the event id of the row it is
# processing, and every app log line emitted during that request carries it.
_event_id = contextvars.ContextVar("event_id", default=None)

logger = logging.getLogger()

APP_LOG_FORMAT = "%(asctime)s / %(module)s / %(levelname)s / [event=%(event_id)s] / %(message)s"


class _EventFilter(logging.Filter):
    """Guarantee every record has an event_id before it reaches the formatter."""

    def filter(self, record):
        record.event_id = _event_id.get() or "-"
        return True


class _SafeFormatter(logging.Formatter):
    """Formatter that can never raise: missing fields default instead.

    (The previous plain formatter crashed with KeyError on any log record
    without event_id — e.g. werkzeug's request logs — and that crash could
    kill the HTTP response mid-flight.)
    """

    def format(self, record):
        if not hasattr(record, "event_id"):
            record.event_id = "-"
        return super().format(record)


def _configure_logging():
    root = logging.getLogger()

    if not root.handlers:
        root.setLevel(logging.INFO)
        app_handler = logging.StreamHandler(sys.stderr)
        app_handler.setFormatter(_SafeFormatter(APP_LOG_FORMAT, "%Y-%m-%d %H:%M:%S"))
        app_handler.addFilter(_EventFilter())
        root.addHandler(app_handler)

    # Werkzeug/Flask access logs: plain format, own handler. Keeping them out
    # of the app's event_id format means a formatting problem can never break
    # request handling again.
    werkzeug = logging.getLogger("werkzeug")
    if not werkzeug.handlers:
        werkzeug.propagate = False
        wsgi_handler = logging.StreamHandler(sys.stderr)
        wsgi_handler.setFormatter(logging.Formatter("%(message)s"))
        wsgi_handler.addFilter(_EventFilter())
        werkzeug.addHandler(wsgi_handler)
        werkzeug.setLevel(logging.INFO)


_configure_logging()


def set_event_id(event_id):
    """Tag all log lines of the current request with this event id (None = untagged)."""
    _event_id.set(event_id)
