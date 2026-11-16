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
| `src/ui/react/features/codex/modals/CategoriasModal.tsx`, `DetallesModal.tsx` | Categorías custom y detalles personalizados |
| `src/ui/react/features/codex/modals/CodexSchemaImportModal.tsx`, `SchemaChecklist.tsx` | Importar categorías y detalles de otra novela |
| `src/utils/codexSchemaMerge.ts` | Fusión de categorías y detalles entre novelas |

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

## Categorías y detalles entre novelas

Las categorías custom y los detalles personalizados (con sus opciones y sus categorías)
son de cada novela. Para reusarlos se **copian**, nunca se comparten: cambiar o borrar
uno en una novela no toca a las demás, y cada carpeta de novela sigue siendo
autosuficiente.

Hay dos formas de copiarlos:

- **Al crear una novela**: el diálogo "New novel" tiene "Codex structure" (ver
  [novels.md](novels.md)). Copia todo de la novela elegida.
- **Después**: botón "Import from novel..." en los modales "Categories" y "Custom
  Details" (`CodexSchemaImportModal`). Se elige la novela y se marcan categorías y
  detalles; los que ya existen aquí con el mismo nombre aparecen deshabilitados. Avisa
  si un detalle marcado pertenece a una categoría que no se importa.

Reglas de la copia (`mergeCodexSchema` en `src/utils/codexSchemaMerge.ts`, lógica pura):

- Nunca copia entradas ni sus valores.
- Todo lo copiado lleva ids nuevos y las referencias se remapean.
- Se compara por nombre (sin mayúsculas ni espacios en los bordes). Si ya existe, se
  salta y se deja como está. Los elementos sin nombre nunca cuentan como repetidos.
- Las 6 categorías por defecto se emparejan por nombre: en cada novela tienen ids
  distintos.
- Un vínculo detalle-categoría se copia si los dos extremos existen en el destino y al
  menos uno se agregó en esta copia. Los vínculos entre dos elementos que el destino ya
  tenía no se tocan.
- Los detalles nuevos van después de los existentes, en el orden de la novela origen.

Archivos: `src/types/CodexSchema.ts` (tipos),
`src/infrastructure/storage/repos/CodexSchemaRepo.ts` (leer, fusionar y escribir),
`NovelStore.readCodexSchemaOf` / `importCodexSchema`, y las acciones del mismo nombre en
`codexSlice`. Test: `test/codex-schema-merge.test.cjs`.

## Privacidad

`EntradaCodex.notas` (pestaña Research, "Notes") es privada: nunca se manda a la IA, ni
en el contexto del autocompletado, ni en el chat, ni en el output de una tool.

Las tools del chat respetan además lo que el autor oculta a la IA, igual que el prompt
del autocompletado: una entrada con política "Never" no existe para ellas y un detalle
con `incluir_ia` apagado no se muestra ni se escribe. Ver
[chat-tools.md](chat-tools.md#reglas-que-no-hay-que-romper).

## Menciones

La pestaña Mentions y la tool `find_mentions` usan la misma lógica
(`src/utils/codexMentions.ts`): nombre y alias como palabra completa, sin acentos, con
o sin mayúsculas según `case_sensitive`.

## Resaltado en el manuscrito

`codexHighlighter` es una extensión de CodeMirror que marca las menciones de entradas
(por nombre y alias, según `tracking_por_nombre` y `case_sensitive`). Al pasar el mouse
aparece un tooltip con "Open entry", que abre la entrada con las reglas de arriba.
