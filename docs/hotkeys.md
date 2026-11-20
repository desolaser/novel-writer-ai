# Atajos

Todos los atajos del plugin: comandos de Obsidian, teclado y mouse. Al agregar uno,
sumarlo aquí.

## Comandos de Obsidian

Aparecen en la paleta de comandos (Ctrl/Cmd + P). El plugin no asigna teclas por
defecto; el autor las asigna en Settings → Hotkeys buscando "Novel Writer".

| Comando | Id | Qué hace |
|---|---|---|
| Open Novel Writer Companion | `novel-writer-ai:open-novel-writer` | Abre o muestra el Companion |
| Open Novel Writer Outline | `novel-writer-ai:open-novel-writer-outline` | Abre o muestra el Outline |
| Create new novel | `novel-writer-ai:create-novel` | Crea una novela |
| Import legacy lorebook | `novel-writer-ai:import-legacy-lorebook` | Importa una carpeta de notas al codex |
| Export novel | `novel-writer-ai:export-novel` | Compila la novela o la exporta por capítulo ([export.md](export.md)) |
| Copy chapter for publishing | `novel-writer-ai:copy-chapter-for-publishing` | Copia el siguiente capítulo sin publicar en el formato del sitio |
| Generate text | `novel-writer-ai:generate-text` | Continúa el texto desde el cursor (solo en un editor) |
| Acciones del editor | `novel-writer-ai:<id de la acción>` | Una por cada acción con `placement` `command` o `both` |

Ids de las acciones del editor por defecto: `summarize-selection`, `expand-selection`,
`shorten-selection`, `rephrase-selection`, `correct-selection`,
`translate-selection-spanish`, `translate-selection-english`. Son estables a propósito:
cambiarlos borraría los hotkeys que el autor les asignó.

Otras entradas:

- Ícono de libro en la ribbon: Generate text.
- Clic derecho en el editor: "Generate text" y las acciones con `placement`
  `context-menu` o `both` (agrupadas en submenús por `menuGroup`).

## Mouse

### Abrir entradas del Codex

Aplica en la lista del Codex y en el botón "Open entry" del tooltip del manuscrito.
Detalle en [codex.md](codex.md).

| Clic | Resultado |
|---|---|
| Clic | Reemplaza la entrada abierta más reciente; si no hay, pestaña nueva |
| Clic medio | Pestaña nueva |
| Ctrl/Cmd + clic | Pestaña nueva |
| Ctrl/Cmd + Alt + clic | Split |
| Ctrl/Cmd + Alt + Shift + clic | Ventana nueva |

Flechas atrás/adelante del encabezado de la pestaña: vuelven a la entrada anterior o
siguiente de esa pestaña.

Menú ⋮ de una entrada → "Generate portrait": dibuja su imagen con el Images model (ver
[codex.md](codex.md#generar-retrato)).

### Outline

- Arrastrar `⠿` de un capítulo y soltarlo sobre otro: reordena; si es de otro acto, lo
  mueve a ese acto.
- Arrastrar `⠿` de un acto y soltarlo sobre otro: reordena los actos.
- Clic en el nombre de un capítulo o acto: renombrar.
- Día y etiqueta de tiempo del capítulo expandido: Enter guarda, Escape descarta.
- Botón de descarga en la cabecera: Export novel.
- Menú "⋯" del capítulo → "Copy for publishing...": copia ese capítulo.

### Metrics

- Clic en la barra de un capítulo: abre su manuscrito (solo si ya tiene archivo).
- Clic en una entrada (Most mentioned, Gone quiet, Never mentioned): la abre, con las
  mismas reglas que "Abrir entradas del Codex".
- Clic en una celda de "Appearances by chapter": abre ese capítulo; clic en el nombre
  abre la entrada.
- Clic en un punto de vista de "Status and point of view": abre su entrada, con las
  mismas reglas que "Abrir entradas del Codex".
- Clic en el título de una sección: la pliega o despliega.

### Chat

- Clic en un badge de contexto: abre el elemento (entrada, nota, outline).
- Clic en el retrato de un personaje junto a un mensaje: abre su entrada.
- Clic en una imagen de un mensaje: la abre en grande; clic fuera la cierra.
- Clic en ← de una respuesta de la IA: deshace los cambios que hizo esa respuesta en la
  novela (pide confirmación). Solo aparece mientras Obsidian siga abierto desde esa
  respuesta. Detalle en [chat.md](chat.md#deshacer-una-respuesta).

## Teclado

### Chat

| Tecla | Dónde | Acción |
|---|---|---|
| Enter | Input del chat | Enviar |
| Shift + Enter | Input del chat | Salto de línea |
| Ctrl/Cmd + V | Input del chat | Pega una imagen (solo con un modelo con visión) |
| Enter | Editando un mensaje | Guardar |
| Shift + Enter | Editando un mensaje | Salto de línea |
| Escape | Editando un mensaje | Cancelar |
| Enter / Espacio | Selector de prompt o de modelo enfocado | Abrir el menú |
| Enter | Renombrando un chat | Guardar |
| Escape | Renombrando un chat | Cancelar |

### Outline

| Tecla | Dónde | Acción |
|---|---|---|
| Enter | Nombre de acto nuevo | Crear el acto |
| Enter | Nombre de capítulo nuevo | Crear el capítulo |
| Escape | Nombre de capítulo nuevo | Cancelar |
| Enter | Renombrando acto o capítulo | Guardar |
| Escape | Renombrando acto o capítulo | Cancelar |

| Enter | Título o campo de una escena | Guardar |
| Escape | Título o campo de una escena | Descartar el cambio |

Los outlines, resúmenes y el "qué pasa" de cada escena se guardan solos; no hace falta
ninguna tecla.

En el capítulo expandido, "▸ Details", "▸ Scenes" y "▸ Facts" abren o cierran su sección; la última
elección se recuerda. Los botones de cada sección aparecen al abrirla.

Clics en las escenas del capítulo expandido:

- `+`: agrega una escena al final. ✨: divide el outline en escenas con IA.
- ↑ / ↓: mueve la escena. Lápiz: escribe esa escena en el manuscrito. Papelera: la
  quita del plan (el manuscrito no se toca).
- "More": muestra punto de vista, escenario, objetivo, conflicto, desenlace y palabras.

Metrics, "Names without an entry": "Create" crea la entrada en la categoría elegida y la
abre; "Ignore" deja de sugerir ese nombre en esta novela; el enlace del final vuelve a
sugerir los ignorados.

Continuidad:

- Menú "⋯" del capítulo → "Check continuity...": abre el último reporte o revisa.
- En el reporte: "Go to text" abre el capítulo con el pasaje seleccionado; "Dismiss"
  quita el problema; "Check again" revisa de nuevo.
- "Facts" del capítulo expandido: ↻ extrae con IA; Enter en "+ Add a fact" lo agrega
  (Escape lo vacía); Enter guarda un hecho editado y Escape descarta; × lo borra.

### Codex

| Tecla | Dónde | Acción |
|---|---|---|
| Enter | Nombre de la entrada | Guardar |
| Enter o `,` | Input de tags | Agregar el tag |
| Escape | Input de tags | Cancelar |
| Enter | URL de referencia externa | Agregar la referencia |
| Enter | Recorte de miniatura | Confirmar |
| Escape | Recorte de miniatura | Cancelar |

### Novel Setup

| Tecla | Dónde | Acción |
|---|---|---|
| Enter | Número de capítulos | Aplicar el valor |
