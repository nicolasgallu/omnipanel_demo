# SKILL_FRONT.md — Protocolo de Front (para el dueño del producto)

> Regla de oro: **NINGÚN cambio de front se implementa sin que el concepto
> esté aprobado en el chat.** Este archivo define cómo se comunica ese
> concepto para que alguien que no programa front pueda evaluarlo con los
> ojos y no con la jerga.

---

## Cuándo aplica este protocolo

Siempre, antes de tocar `frontend/src`, cuando:

1. Un cambio de **backend** tiene impacto visual o de interacción en la app.
2. Pedís un **cambio de UI** (nuevo botón, nueva pantalla, nuevo paso, nuevo
   estado visual, etc.).
3. Surge una **duda de diseño** ("¿cómo va a quedar si falla X?").

Si el cambio es solo backend (sin impacto en lo que se ve), no aplica.

---

## Qué te entrego antes de codear: el "Concepto de Front"

Una descripción en **lenguaje llano**, pantalla por pantalla, que responde:

### 1. Qué cambia y por qué (1 línea)
Ej: "Al vincular un producto a catálogo, el panel de MercadoLibre va a mostrar
si estás ganando o perdiendo la ficha."

### 2. La interacción, paso a paso (sin jerga)
Formato fijo, en segunda persona:

> "Cuando hacés **X**, va a pasar **Y**. Por detrás se llama a `GET/POST ...`."

Ejemplos del formato:
- *"Cuando pasás el mouse sobre una foto, aparece un **botón rojo de tacho**.
  Si lo tocás, se elimina esa imagen (por detrás: `DELETE
  /api/inventory/products/{id}/images/{imageId}` borra el archivo del bucket y
  el registro de la DB)."*
- *"Cuando publicás en MercadoLibre vas a ver un **paso nuevo** con dos
  opciones: **Tradicional** y **Catálogo**. Si elegís Catálogo, se busca solo
  la ficha estándar por tu nombre/SKU (por detrás: `GET
  /api/mercadolibre/catalog/search`)."*

### 3. TODOS los estados posibles (obligatorio)
Para cada pantalla/cambio, enumero:

- **Vacío** (sin datos todavía)
- **Cargando** (mientras espera al backend)
- **Éxito** (qué se ve cuando salió bien)
- **Error** (qué se ve cuando falla, y qué dice el mensaje)

Y si es un flujo (publicar/editar):

- **Antes de publicar** (pasos del wizard, uno por uno)
- **Después de publicar** (cómo queda la pantalla)
- **Al editar** (a qué paso te lleva y qué podés tocar)
- **Si falla** (qué muestra el tracker, qué botón reintenta)

### 4. Escenarios cubiertos (checklist)
Los casos que contemplamos, incluyendo los raros:

- Happy path
- Item ya vinculado / ya en catálogo
- Item en revisión (`under_review`) o pausado
- Sin ficha de catálogo encontrada
- Categoría que obliga catálogo
- Fallo de la API de Meli (mensaje que vas a ver)
- Empleado (sin permiso) intentando la acción

### 5. Glosario mínimo
Si uso una palabra borrosa, la defino al pie (ver glosario abajo).

---

## Formato de entrega

- **Texto en el chat** (nada de código; ASCII simple solo si ayuda).
- Cierra SIEMPRE con: **"¿Apruebo con este concepto o ajustamos algo?"**
- No toco `frontend/src` hasta tu OK (o tu corrección).

---

## Glosario (las palabras borrosas que suelo usar)

| Término | Qué significa para tus ojos |
|---|---|
| **Modal** | Ventana que aparece **centrada**, tapando el resto con un fondo oscuro semi-transparente. Ej: la confirmación de "¿Eliminar?". |
| **Drawer** | Panel que se **desliza desde la derecha** y ocupa casi toda la pantalla. Es donde ves el detalle del producto (Datos generales / MercadoLibre / Tienda Nube). |
| **Chip / Pill / Badge** | **Etiquetita redondeada** de color con texto corto ("Catálogo", "Pausado", "Publicado"). Solo informa. |
| **Toast** | Mensajito chico que aparece un par de segundos y se va solo (aviso de éxito, p. ej. "Cambios guardados"). |
| **Wizard** | **Secuencia de pasos numerados** para completar una acción (ej. publicar: Categoría → Tipo → Configurar → Publicar). |
| **Tracker** | La **barrita de pasos** arriba del wizard: círculos con número/check que muestran en qué paso estás. |
| **Toggle** | **Interruptor on/off** (se desliza de izquierda a derecha). |
| **Read-only** | Campo que **se ve pero no se puede editar** (gris o con candado). |
| **Hover** | Lo que pasa cuando **pasás el mouse por encima** (aparece/desaparece algo). |
| **Endpoint** | La **URL del backend** que se llama por detrás (ej. `GET /api/...`) y qué hace (traer datos, guardar, borrar). |
| **Estado vacío / empty state** | Lo que se muestra cuando **no hay datos** (mensaje o dibujito "no hay nada"). |
| **Spinner** | La **ruedita/círculo girando** que indica "cargando". |
| **Botón fantasma (ghost)** | Botón **sin relleno**, solo borde y texto (menos protagonismo). |

---

## Ejemplo 1 (plantilla real): tacho en las imágenes

> **Qué cambia:** vas a poder borrar fotos desde el detalle del producto.
>
> **Interacción:** cuando abrís un producto y mirás sus fotos, **al pasar el
> mouse** sobre la foto grande o sobre cada miniatura aparece un **botoncito
> rojo con ícono de tacho**. Si lo tocás, la imagen se elimina al instante
> (por detrás: `DELETE /api/inventory/products/{id}/images/{imageId}` borra el
> archivo del bucket de GCS y su registro en la DB).
>
> **Estados:** sin fotos → se ve el hueco "Subir imagen". Borrando → la imagen
> desaparece y se reordena el resto. Error → mensajito rojo "No se pudo
> eliminar la imagen" y queda como estaba.
>
> **Escenarios:** borrar la principal (pasa a mostrarse la siguiente), borrar
> la última (queda el hueco vacío), borrar mientras no hay conexión (error).
>
> ¿Apruebo con este concepto o ajustamos algo?

## Ejemplo 2 (plantilla real): paso "Tipo" de catálogo

> **Qué cambia:** al publicar en MercadoLibre podés elegir entre publicación
> **Tradicional** (como siempre) o **Catálogo** (la ficha la pone Meli).
>
> **Interacción:** después de elegir categoría aparece un **paso nuevo** con
> dos tarjetas: Tradicional a la izquierda, Catálogo a la derecha. Si elegís
> **Catálogo**, se busca automáticamente la ficha estándar por tu nombre/SKU
> (por detrás: `GET /api/mercadolibre/catalog/search`) y elegís una de la
> lista. El paso "Configurar" queda **simplificado**: solo precio/stock/tipo
> de publicación, y el título/fotos aparecen read-only ("los define
> MercadoLibre"). Si la categoría **obliga** catálogo, la tarjeta Tradicional
> queda gris y bloqueada con un aviso ámbar.
>
> **Después de publicar:** en el panel del producto aparece una **card de
> catálogo** con la etiqueta "Catálogo", el link a la ficha, y el estado de
> **competencia** (Ganando/Empatando/Perdiendo/No puede competir) con el
> "precio para ganar" y los beneficios que te faltan. Si ya estabas publicado
> como tradicional, en esa card hay un botón **"Vincular a catálogo"** que
> abre el buscador de fichas **dentro de la card** (sin ventana centrada).
>
> **Al editar** un producto en catálogo, "Actualizar" manda **solo precio y
> stock** a Meli (la ficha no se toca).
>
> **Si falla el vínculo:** se cierra el buscador y aparece el error de Meli en
> lenguaje claro (ej. "Esa ficha no corresponde a la categoría del producto").
>
> **Escenarios:** ficha de otro rubro (error claro), item en revisión (Meli lo
> rechaza con su motivo), ya vinculado (botón no aparece), sin ficha
> encontrada ("no encontramos fichas"), salir del catálogo (confirmación
> centrada, vuelve la tradicional).
>
> ¿Apruebo con este concepto o ajustamos algo?

---

## Cómo lo uso yo (el agente)

1. Detecto un cambio con impacto de front → **primero escribo el Concepto de
   Front** con las 5 secciones.
2. Espero tu OK (o tu corrección).
3. Recién ahí implemento, y al final reporto: qué toqué, qué estados se
   cubrieron, y qué tests pasaron (backend contra la DB local +, cuando
   aplica, pruebas reales contra las plataformas).
4. Si durante la implementación aparece un escenario nuevo NO previsto en el
   concepto, lo aviso y lo agrego al reporte.
