"""Step timing helper: breadcrumbs con duración para cadenas largas de acciones.

Uso:
    with step("post_items"):
        response = requests.post(...)
    # -> `step=post_items duration=1010ms`

Cada bloque loguea su duración al salir (aunque el bloque levante, el
context manager propaga la excepción y loguea igual). Best-effort: nunca
interfiere con el flujo de la acción.
"""
import time
from contextlib import contextmanager

from app.utils.logger import logger


@contextmanager
def step(name, **fields):
    start = time.monotonic()
    try:
        yield
    finally:
        extra = ""
        if fields:
            extra = " " + " ".join(
                "{}={}".format(k, v) for k, v in fields.items())
        logger.info("step=%s duration=%.0fms%s",
                    name, (time.monotonic() - start) * 1000, extra)
