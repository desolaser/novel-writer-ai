# Editor: autocompletado y acciones

Lo que el plugin hace dentro de las notas Markdown del manuscrito.

## Archivos

| Archivo | Responsabilidad |
|---|---|
| `main.ts` (`generateEditorText`, `runEditorAction`) | Ejecuta el autocompletado y las acciones |
| `src/context/promptBuilder.ts` | Arma el prompt de autocompletado (`buildEditorPrompt`) y el YAML del codex |
| `src/context/promptMeta.ts` | Memoria y nota del autor en cascada |
| `src/context/editorActionPrompt.ts`, `editorActionTemplate.ts` | Contexto y prompt de las acciones |
| `src/constants/editorActions.ts` | Acciones por defecto |
| `src/infrastructure/settings/editor-action-repository.ts` | Validación y CRUD de acciones |
| `src/ui/modals/EditorActionsModal.ts` | Editor de acciones en Settings |
| `src/ui/react/features/sidebar/ConfigPanel.tsx` | Pestaña Config: memoria, nota del autor, ver contexto |

## Generate text (autocompletado)

Continúa el texto desde el cursor con el modelo de propósito `writing`. Se dispara desde
el ícono de la ribbon, el comando "Generate text" o el menú contextual del editor.

- Solo se envía el texto **antes del cursor**; el frontmatter se excluye del prompt y de
  la detección de entradas del codex.
- El prompt sigue la plantilla de texto (`TEXT_TEMPLATE`): codex, story bible, memoria,
  nota del autor, outline del capítulo (si `includeOutlineInContext`), instrucciones,
  manuscrito.
- Con streaming se inserta solo el texto nuevo en la posición guardada. Reemplazar el
  documento en cada token reseteaba el viewport.

## Memoria y nota del autor

`getPromptMetaCascading` busca el valor en este orden:

1. frontmatter de la nota activa (`memoryContent`, `authorNote`),
2. `_config.md` en la carpeta de la nota o en una carpeta superior,
3. valor global de settings.

La pestaña Config los edita (guardado con debounce de 600 ms) y "View context" muestra
el prompt completo que se enviaría.

`promptMeta.ts` expone las piezas por separado para quien no trabaja sobre la nota
activa: `readFrontmatterValue` / `writeFrontmatterValue` (una nota) y
`readInheritedPromptMeta` (pasos 2 y 3 desde una carpeta). Las usan las tools
`read_memory` y `write_memory` del chat, que escriben en el capítulo o en el
`_config.md` de la carpeta de la novela (ver [chat-tools.md](chat-tools.md)).

## Acciones del editor

Operaciones de IA configurables sobre el texto: Summarize, Expand, Shorten, Rephrase,
Correct y Translate por defecto.

| Campo | Valores |
|---|---|
| `placement` | `command` (paleta de comandos), `context-menu` (clic derecho), `both` |
| `input` | `selection`, `selection-or-note` (toda la nota si no hay selección), `before-cursor` |
| `output` | `replace-input`, `insert-at-cursor` |
| `menuGroup` | Agrupa acciones en un submenú del clic derecho (por ejemplo "Translate to") |
| `instruction` | Prompt; acepta `{{input}}`, `{{selection}}`, `{{note}}`, `{{before_cursor}}`, `{{memory}}`, `{{author_note}}`, `{{chapter_outline}}`, `{{codex}}`, `{{story_bible}}` |

- Los ids de las acciones por defecto son estables para conservar los hotkeys que el
  autor les asignó en Obsidian.
- Las acciones con `command` se registran como comandos (`syncEditorActionCommands`) y se
  re-sincronizan cuando cambian los settings.
- Si la nota cambió mientras la IA generaba, no se reemplaza nada.
