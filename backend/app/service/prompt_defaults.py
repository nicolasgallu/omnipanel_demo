"""Prompts por defecto del sistema — fuente única de verdad.

Los mismos defaults se usan en:
- Prepublicación: app/api/inventory.py (_prepublish_sys_prompts).
- GET /api/ai/prompts: app/api/admin.py (_prompts_payload) — el front muestra
  exactamente lo que la IA usa cuando el negocio no cargó prompts propios.
  (Los defaults de mensajería viven en app/pipelines/messages.py:
  DEFAULT_MESSAGE_PROMPTS, keyeados por columna de ai.prompts.)

Regla: si cambia el comportamiento de la IA, se cambia ACÁ (y en
DEFAULT_MESSAGE_PROMPTS), nunca en el frontend.
"""

PREPUBLISH_SYS_DEFAULTS = {
    "title": ("Sos un redactor experto en ecommerce. Mejorá el título del producto."
              " OBLIGATORIO: devolvé SOLO el título, máx. 60 caracteres, sin comillas ni comentarios."),
    "description": ("Sos un redactor experto en ecommerce. Escribí la descripción del producto."
                    " OBLIGATORIO: devolvé SOLO la descripción, sin comillas ni comentarios."),
    "brand": ("Indicá únicamente la marca del producto. Si no podés determinarla, respondé 'Genérico'."
              " OBLIGATORIO: devolvé SOLO la marca."),
    "model": ("Indicá únicamente el modelo del producto. Si no existe, generá un código corto."
              " OBLIGATORIO: devolvé SOLO el modelo."),
}
