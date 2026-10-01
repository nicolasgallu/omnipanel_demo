"""Cache en memoria del proceso (dict + Lock) — SIN Redis.

Absorbe lecturas repetidas del dashboard (lista de productos, categorías,
settings, ai.prompts, resumen de ml_listings y el chequeo de "negocio activo"
de los tokens) sin agregar infraestructura.

Características:
- Thread-safe: gunicorn corre UN proceso con 8 threads (gthread) y todas las
  operaciones van bajo un único Lock.
- LRU acotado: OrderedDict con `max_entries` (default 200); se evicta el
  menos usado recientemente.
- TTL por entrada: cada `set` recibe su ttl en segundos.
- Invalidación por versión por business_id: las claves de lectura se arman
  con la versión actual del negocio (`cache_key`); cada escritura que afecta
  productos/listados/imágenes llama `invalidate_business(business_id)`.
  Las entradas de versiones anteriores quedan huérfanas y las evapora el
  LRU/TTL (nunca se vuelven a leer). SIEMPRE se invalida DESPUÉS del commit
  de la escritura: si se invalidara antes, un lector concurrente podría
  cachear el estado viejo bajo la versión nueva.
- Deshabilitable: `configure(enabled=False)` — conftest.py lo usa para que
  la cache no contamine tests. `clear()` limpia todo.

Nota de despliegue: la cache vive en el proceso. Con workers=1 (gunicorn
actual) cubre los 8 threads; si algún día se sube workers, cada proceso
tiene su copia y el TTL acota la divergencia.
"""
import threading
import time
from collections import OrderedDict

MAX_ENTRIES = 200

_enabled = True
_max_entries = MAX_ENTRIES
_lock = threading.Lock()
_entries = OrderedDict()  # key -> (expires_monotonic, value)
_versions = {}            # business_id -> int


def configure(enabled=None, max_entries=None):
    global _enabled, _max_entries
    with _lock:
        if enabled is not None:
            _enabled = bool(enabled)
        if max_entries is not None:
            _max_entries = int(max_entries)
            while len(_entries) > _max_entries:
                _entries.popitem(last=False)


def clear():
    with _lock:
        _entries.clear()


def invalidate_business(business_id):
    """Bump de la versión del negocio: las claves cacheadas con la versión
    anterior dejan de matchear y no se vuelven a leer."""
    if business_id is None:
        return
    with _lock:
        _versions[business_id] = _versions.get(business_id, 0) + 1


def cache_key(name, business_id, *parts):
    """Clave versionada: name|business_id|version|part1|part2|...

    El business_id SIEMPRE forma parte de la clave (nunca se mezclan
    negocios) y la versión actual hace que la invalidación sea implícita.
    """
    with _lock:
        version = _versions.get(business_id, 0)
    return "|".join(
        [name, str(business_id), str(version)] + [str(p) for p in parts])


def get(key):
    """Valor cacheado o None (miss o expirado). Ningún valor cacheable es
    None, así que None = miss siempre."""
    with _lock:
        if not _enabled:
            return None
        entry = _entries.get(key)
        if entry is None:
            return None
        expires, value = entry
        if expires < time.monotonic():
            del _entries[key]
            return None
        _entries.move_to_end(key)  # LRU: el hit pasa al final
        return value


def set(key, value, ttl):
    with _lock:
        if not _enabled:
            return
        _entries[key] = (time.monotonic() + ttl, value)
        _entries.move_to_end(key)
        while len(_entries) > _max_entries:
            _entries.popitem(last=False)


def get_or_compute(business_id, name, ttl, producer, *parts):
    """Patrón estándar: hit -> valor cacheado; miss -> producer() y cachear.

    Si producer lanza, la excepción sube y NO se cachea nada.
    """
    key = cache_key(name, business_id, *parts)
    value = get(key)
    if value is None:
        value = producer()
        set(key, value, ttl)
    return value
