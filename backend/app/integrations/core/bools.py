"""Parseo canónico de booleanos — fuente única para todo el backend.

MercadoLibre (y la UI) representan "verdadero" de varias formas (True, "True",
"true", 1, "1", "Si", "Sí", "si", "sí", "yes", "on"). Todos los lugares que
necesitan decidir "¿esto es sí o no?" deben usar `is_truthy`, no listas propias.
"""

_TRUTHY_STRINGS = {"true", "1", "si", "sí", "yes", "on"}


def is_truthy(value):
    """True si `value` representa un booleano verdadero, False en caso contrario."""
    if value is True:
        return True
    if value is False or value is None:
        return False
    if isinstance(value, (int, float)):
        return value == 1
    return str(value).strip().lower() in _TRUTHY_STRINGS
