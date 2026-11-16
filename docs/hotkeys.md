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

### Outline

- Arrastrar `⠿` de un capítulo y soltarlo sobre otro: reordena; si es de otro acto, lo
  mueve a ese acto.
- Arrastrar `⠿` de un acto y soltarlo sobre otro: reordena los actos.
- Clic en el nombre de un capítulo o acto: renombrar.

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

Los outlines y resúmenes se guardan solos; no hace falta ninguna tecla.

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
