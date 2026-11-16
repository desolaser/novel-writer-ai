# Codex

Entradas de lore de la novela: personajes, lugares, objetos, etc. Cada entrada tiene
categoría, alias, descripción, notas privadas, detalles personalizados, tags,
referencias externas, miniatura y una política de contexto para la IA.

## Archivos

| Archivo | Responsabilidad |
|---|---|
| `src/ui/react/features/codex/CodexPanel.tsx` | Pestaña Codex del Companion: lista, filtros, acciones en lote |
| `src/ui/react/features/codex/CodexCategoryGroup.tsx`, `CodexEntryRow.tsx` | Grupo por categoría y fila de entrada |
| `src/ui/views/CodexEntryView.ts` | Vista de una entrada en el área principal |
| `src/ui/views/openCodexEntry.ts` | Abre una entrada con las reglas de Obsidian |
| `src/ui/react/features/codex/CodexEntryEditor/` | Editor de la entrada (pestañas Details, Research, Relations, Mentions, Tracking) |
| `src/ui/react/features/codex/CodexEntryEditor/ai/` | Generación de campos con IA |
| `src/ui/editor/codexHighlighter.ts`, `codexTooltip.ts`, `codexMatching.ts` | Resaltado de menciones en el manuscrito y tooltip |
| `src/infrastructure/storage/repos/CodexEntryRepo.ts` | Un JSON por entrada |

## Vista de entrada (`CodexEntryView`)

Las entradas se abren como hojas en el área principal, igual que una nota, no en un
modal. Así se pueden tener varias abiertas junto al manuscrito.

- Tipo de vista: `novel-writer-codex-entry`. El estado de la vista guarda `entryId`, así
  que Obsidian restaura las pestañas al reiniciar.
- El título de la pestaña es el nombre de la entrada y se actualiza si cambia (la vista
  se suscribe al store y llama a `leaf.updateHeader()`).
- Cambiar la entrada de una pestaña entra en el historial de la pestaña
  (`result.history = true`), así que las flechas atrás/adelante vuelven a la anterior.
- Si la entrada no es de la novela activa o se borró, muestra un aviso con "Close".
- Ocupa todo el ancho de la pestaña con un padding ligero (`.nw-codex-entry-view` en
  `styles.css`).

### Reglas para abrir (`openCodexEntry`)

`openCodexEntry(plugin, entryId, paneType)` sigue el comportamiento de Obsidian con las
notas. `paneTypeFor(event)` traduce el clic con `Keymap.isModEvent`:

| Clic | Resultado |
|---|---|
| Clic normal | Reemplaza la entrada usada más recientemente. Si no hay ninguna, abre una pestaña nueva (o usa una "New tab" vacía). |
| Clic medio o Ctrl/Cmd + clic | Pestaña nueva |
| Ctrl/Cmd + Alt + clic | Split |
| Ctrl/Cmd + Alt + Shift + clic | Ventana nueva |

- Nunca reemplaza una nota ni otra vista que no sea de entrada.
- No reemplaza una entrada fijada con el pin de Obsidian.
- Si la entrada ya está abierta y el clic es normal, la trae al frente.
- Las pestañas nuevas se crean junto a la hoja más reciente del área principal, aunque
  el clic venga de la barra lateral.

Todo lugar que abra una entrada debe pasar el evento del clic con `paneTypeFor` cuando
lo tenga. Hoy lo hacen la lista del Codex y el botón "Open entry" del tooltip. Los
badges y retratos del chat abren con clic normal.

## Editor (`CodexEntryEditor`)

Recibe `entryId` por prop; cada vista abierta tiene el suyo. El store ya no tiene un
`editingEntryId` global.

- Trabaja sobre un borrador local (`draft`). Los campos de texto guardan al perder el
  foco; los selectores y checkboxes guardan al momento (`patchAndSave`).
- Si la entrada cambia en otro lado (otra vista, el chat, la lista) y este editor no
  tiene cambios sin guardar, adopta la versión nueva.
- Al cerrar la pestaña con un campo sin guardar, guarda igual (flush al desmontar).
- Borrar o mover a otra novela cierra la vista (`onClose`).

## IA de entradas

`CodexAiProvider` genera campos (alias, descripción, detalles) de tres formas: un campo,
campo por campo en secuencia, o todos en una llamada con secciones delimitadas. Cada
respuesta es una **propuesta** que el autor acepta o descarta; nada se escribe solo.

## Privacidad

`EntradaCodex.notas` (pestaña Research, "Notes") es privada: nunca se manda a la IA, ni
en el contexto del autocompletado, ni en el chat, ni en el output de una tool.

## Resaltado en el manuscrito

`codexHighlighter` es una extensión de CodeMirror que marca las menciones de entradas
(por nombre y alias, según `tracking_por_nombre` y `case_sensitive`). Al pasar el mouse
aparece un tooltip con "Open entry", que abre la entrada con las reglas de arriba.
