# Changelog

Un registro por cambio, el más reciente arriba. Cada entrada dice qué cambió, por qué, y
qué documento de módulo tiene el detalle.

## 2026-11-19

### Capítulos: estado, punto de vista, escenario y tiempo de la historia
- Cada capítulo puede tener estado (Idea → Final), punto de vista y escenario (entradas
  del codex), día de la historia y una etiqueta de tiempo libre. Se editan al expandir
  el capítulo en el Outline; la fila muestra el estado con un punto de color.
- Los borradores y "Generate text" reciben punto de vista, escenario y tiempo, y esas
  entradas entran al bloque del codex aunque el texto no las nombre. Nunca el nombre
  de una entrada "Never" o archivada.
- Chat: `list_chapters` muestra la información y la tool nueva `set_chapter_info` la
  escribe (grupo Structure, ~135 tokens más).
- Metrics: sección "Status and point of view" con capítulos y palabras por estado y por
  narrador.
- Rebuild de la estructura conserva la información de los capítulos que mantienen su
  nombre.
- Base para la línea de tiempo (por `story_day`) y la publicación por capítulos (por
  estado).
- Tests: `test/chapter-info.test.cjs`, `test/chat-tools.test.cjs`,
  `test/estructura-lock.test.cjs`. Detalle:
  [outline.md](outline.md#información-del-capítulo), [editor.md](editor.md),
  [chat-tools.md](chat-tools.md), [metrics.md](metrics.md#estado-y-punto-de-vista).

## 2026-11-16

### Metrics: lo pegado no cuenta como escrito
- El texto pegado se contaba como tecleado por el autor. Ahora `clipboardTracking.ts`
  avisa al tracker lo que entra por `editor-paste` y lo que sale por `cut`, y se guarda
  aparte (`WritingDay.pasted`). Cortar y pegar dentro de la novela da cero.
- "Generate text" y las acciones del editor avisan las palabras exactas que insertan
  (`noteEdit`) en vez de marcar 4 s del archivo: lo que el autor teclea alrededor ya no
  se cuenta como de la IA.
- "Writing pace" muestra lo pegado y lo generado de hoy como "no contado".
- Pegar un texto y después borrarlo restaba esas palabras al autor (el "Today" quedaba
  negativo). Ahora lo borrado sale primero de las palabras pegadas o generadas que
  siguen en el archivo, la más reciente primero (`src/utils/writingAttribution.ts`).
- Tests: `test/writing-log.test.cjs`. Detalle: [metrics.md](metrics.md#qué-se-cuenta).

### Metrics: ritmo de escritura y mapa de apariciones
- Registro diario de palabras por novela (`__writing_log.json`): `WritingTracker` cuenta
  la diferencia de palabras cada vez que se guarda un manuscrito de la novela activa.
  Lo que escribe el plugin (borradores, chat, Generate text, acciones del editor,
  deshacer) se marca con `markPluginWrite` y se guarda aparte: no cuenta como del autor.
- Sección "Writing pace": hoy, 7 y 30 días, promedio por día escrito, rachas, mejor
  día, columnas de 30 días y fecha estimada de fin según el objetivo del Novel Setup.
- Sección "Appearances by chapter": mapa de calor entradas × capítulos
  (`EntryMentions.perChapter`).
- El registro se escribe con `withFileLock` sumando sobre lo que hay en disco, y queda
  fuera de las copias para deshacer respuestas del chat.
- Tests: `test/writing-log.test.cjs`, `test/novel-metrics.test.cjs`. Detalle:
  [metrics.md](metrics.md#ritmo-de-escritura), [storage.md](storage.md).

### Pestaña Metrics en el Companion
- Nueva pestaña "Metrics" junto a Codex, Config y Chats con estadísticas de la novela
  activa: resumen (palabras, capítulos escritos y con outline, páginas, tiempo de
  lectura), largo de capítulos (promedio, mediana, extremos, barras contra el objetivo
  del Novel Setup), palabras por acto, codex (entradas por categoría, más mencionadas,
  "gone quiet" y nunca mencionadas), palabras más usadas (con o sin nombres del codex),
  frases repetidas y estilo (oración, párrafo, diálogo, variedad de vocabulario).
- El cálculo es puro (`src/utils/novelMetrics.ts`, `src/utils/textStats.ts`) y la UI lo
  recalcula al editar un manuscrito, con 3 s de espera.
- Tests: `test/novel-metrics.test.cjs`. Detalle: [metrics.md](metrics.md).

### Chat: retratos del codex con un modelo de imágenes
- Nuevo **Images model** en Settings (`imageModelId`), aparte de chat, writing y
  utilities: el chat coordina y otro modelo dibuja. Solo lista perfiles de OpenRouter
  marcados 🖌, y vacío no hereda el modelo por defecto.
- Tool nueva `generate_portrait` (grupo Generators): dibuja el retrato de una entrada
  con su descripción y detalles visibles para la IA, lo recorta a cuadrado y lo pone
  como imagen de la entrada. Solo se ofrece si hay un Images model.
- `getActiveModelConfig` comparte con `getImageModelConfig` la conversión de un perfil a
  opciones (`configForProfile`).
- "Generate portrait" en el menú ⋮ de la entrada del codex, entre "Move to" y "Clear
  Thumbnail": mismo prompt y modelo, iniciado por el autor (`usePortraitGeneration.ts`).
  Deshabilitado sin Images model.
- Tests: `test/chat-tools.test.cjs`. Detalle: [chat-tools.md](chat-tools.md),
  [models-and-prompts.md](models-and-prompts.md#modelo-de-imágenes),
  [codex.md](codex.md#generar-retrato).

### El largo de los borradores sale solo del Story Bible
- Se quitó el campo "Words" de la cabecera del Outline y el setting `draftWordCount`
  (uno para todo el vault). Los borradores usaban ese número mientras `novel_status`
  usaba el rango del Story Bible, así que podían no coincidir.
- Ahora el largo es el "words per chapter" de cada novela (`DraftLength`,
  `src/utils/draftLength.ts`); sin Novel Setup, 2000-4000. El modelo apunta al punto
  medio y cualquier largo dentro del rango sirve: el bucle para al llegar al mínimo y
  el máximo es el techo del prompt.
- `draft_chapter` usa el rango por defecto; su argumento `words` lo reemplaza con un
  margen de ±10 %.
- El setting viejo se borra al cargar. Tests: `test/draft-length.test.cjs`.
  Detalle: [outline.md](outline.md#borradores-largo-final-y-contexto).

### Borradores más cerca del largo, sin final cortado y con el contexto correcto
- Un capítulo de 2000 palabras volvía con ~3000 y cortado a mitad de oración. El margen
  de output (1,5) dejaba escribir de más hasta chocar con el límite.
  - Margen 1,25 y una regla de largo con techo (objetivo + 10 %) en `draftLengthRule`.
  - Un texto cortado se recorta hasta la última oración completa y, si ya llegó al
    largo, una petición corta cierra la escena (`src/utils/draftEnding.ts`).
- Arreglo: el borrador usaba la memoria y la nota del autor de la nota abierta en el
  editor, no las del capítulo. Desde el Outline o el chat, la "historia hasta aquí"
  era la de otro capítulo o ninguna.
- Arreglo: el codex se detectaba solo en el texto ya escrito; ahora también en el
  outline, así el primer pedido ya recibe los lugares y personajes del capítulo.
- Tests: `test/draft-ending.test.cjs`, `test/model-purposes.test.cjs`. Detalle:
  [outline.md](outline.md#borradores-largo-final-y-contexto).

### Chat: nombres en las tarjetas y Settings más claros
- La tarjeta de una tool muestra a qué apunta una referencia antes de aprobarla
  (`#11 → #11 Capítulo 11`), para capítulos, actos y entradas (`callTargets.ts`).
  Antes `delete_chapter` solo mostraba el número.
- Settings → Chat tools explica qué hacen los grupos, y cada uno muestra cuántos tokens
  suma por mensaje y sus tools.
- Tests: `test/chat-tools.test.cjs`. Detalle: [chat-tools.md](chat-tools.md).

### Chat: grupos de tools en Settings, deshacer respuestas, generadores y más tools
- **Grupos en Settings** (Chat Options → Chat tools): un toggle por grupo
  (`chatToolGroups`); un grupo apagado no se manda al modelo y la sesión rechaza sus
  llamadas. Con todo encendido son 36 tools, ~3150 tokens.
- **`read_note` configurable** (`chatNoteAccess`): todo el vault (por defecto), solo la
  carpeta de la novela, o apagado.
- **Memoria de la novela en `__config.json`.** La memoria global de Settings vale para
  todo el vault; cada novela ahora tiene la suya, entre la del capítulo y la global.
  Se edita en Config → "This novel" y con `write_memory` sin capítulo. `_config.md` ya
  no se escribe; se sigue leyendo como legado (`NovelConfigRepo.ts`).
- **Deshacer una respuesta**: botón ← en las respuestas que cambiaron la novela.
  Restaura los archivos que cambió y deja los que el autor tocó después
  (`novelSnapshot.ts`, `fileChanges.ts`). Vive en memoria hasta reiniciar Obsidian.
- **Tools nuevas**: `delete_chapter` (pregunta siempre: `alwaysAsk`), `update_blueprint`,
  y el grupo Generators: `generate_outline`, `summarize_act`, `draft_chapter`,
  `refresh_story_context`.
- Los generadores del Outline salieron de `useOutlineActions` a `OutlineGenerator`
  (sin React); el Outline y el chat usan la misma clase.
- No se hizo una tool de retratos: el plugin no tiene un generador de retratos que
  reutilizar.
- Tests: `test/chat-tools.test.cjs`, `test/chat-agent.test.cjs`,
  `test/file-changes.test.cjs`; mocks nuevos en `test/model-purposes.test.cjs`.
  Detalle: [chat-tools.md](chat-tools.md), [chat.md](chat.md), [editor.md](editor.md),
  [storage.md](storage.md), [outline.md](outline.md), [hotkeys.md](hotkeys.md).

### Chat: texto y tool calls en el orden en que pasaron
- Al recargar el chat, todo lo que dijo la IA quedaba arriba y todas las tool calls
  abajo, plegadas en un solo grupo. En vivo pasaba lo mismo.
- Cada tool call guarda `textOffset` (cuánto texto había escrito la IA al hacerla) y
  `splitTurn` (`src/utils/turnSegments.ts`) intercala texto y grupos de tools. Lo usan
  la respuesta en curso (`ChatLiveTurn.tsx`) y los mensajes guardados
  (`MessageContent.tsx`, nuevo, sacado de `ChatTab.tsx`).
- Las respuestas viejas, sin `textOffset`, siguen mostrando las tools al final.
- Más aire entre texto y grupos de tools (10 px, lo mismo que entre mensajes) y letra
  de 13 px en el resumen "N tool calls" y en las tarjetas.
- Tests: `test/turn-segments.test.cjs` y `test/chat-agent.test.cjs`. Detalle:
  [chat.md](chat.md).

### Chat: Stop ya no se queda en "Stopping..." y `update_plan` sin errores
- Stop solo se revisaba entre pasos, así que esperaba a que el modelo respondiera. Si
  la petición tardaba o se colgaba, el chat quedaba en "Stopping..." y no dejaba
  escribir. Ahora `ChatSession` deja de esperar la petición (y la tool en curso) al
  apretar Stop, y descarta lo que llegue después.
- `update_plan` fallaba con "Missing required argument(s): steps": el parser leía
  `[x] paso` como un argumento llamado `x`. Ahora, dentro de un valor multi-línea, solo
  abren argumento los nombres que la tool tiene. Un plan sin `[[steps]]` también
  funciona.
- Tests en `test/chat-agent.test.cjs`. Detalle: [chat.md](chat.md),
  [chat-tools.md](chat-tools.md).

### Chat: 18 tools nuevas y privacidad del codex en las tools
- El agente solo podía tocar el texto y el outline de los capítulos y la descripción y
  los alias del codex. Ahora también:
  - estructura: `read_act`, `create_act`, `update_act` (nombre y resumen),
    `rename_chapter`, `move_chapter`;
  - codex: `list_codex_fields`, `set_codex_detail`, `archive_codex_entry`,
    `find_mentions`; `update_codex_entry` suma categoría, tags y primer mensaje;
    `read_codex_entry` muestra tags, primer mensaje y qué entradas la referencian;
  - novela: `read_blueprint`, `novel_status`, `read_memory`, `write_memory`;
  - workspace: `update_plan` (checklist en el chat), `open_chapter`,
    `open_codex_entry`, `read_selection`, `read_note`;
  - `read_chapter` lee un rango de párrafos (`from`/`to`).
- Arreglo de privacidad: las tools ignoraban la política "Never" de las entradas y
  `incluir_ia` de los detalles, que el prompt del autocompletado sí respetaba. Las
  reglas quedan en `src/tools/codexShared.ts`.
- `ToolContext` se partió por dominio y hay dos adaptadores nuevos
  (`createWorkspaceToolContext.ts`, `createMemoryToolContext.ts`). Las definiciones
  pasaron a `src/tools/definitions/`, un archivo por dominio.
- Lógica compartida movida a `src/utils`: `codexMentions.ts` (también la usa la
  pestaña Mentions), `generatedMemory.ts` (también la usa el outline) y `planSteps.ts`.
- El bloque `[TOOLS]` pasa de ~800 a ~2600 tokens por request.
- Tests: `test/chat-tools.test.cjs`. Detalle: [chat-tools.md](chat-tools.md),
  [chat.md](chat.md), [codex.md](codex.md), [editor.md](editor.md).

### Codex: copiar categorías y detalles entre novelas
- Las categorías custom y los detalles personalizados eran solo de cada novela, así
  que una novela nueva empezaba sin ellos.
- El diálogo "New novel" tiene "Codex structure": copiar todo de otra novela o solo
  las categorías por defecto (por defecto). Recuerda la última elección
  (`settings.newNovelCodexSourceId`).
- "Import from novel..." en los modales "Categories" y "Custom Details" copia lo que
  se marque de otra novela.
- Se copian, no se comparten: cada novela sigue siendo independiente. No se copian
  entradas. Lo que ya existe con el mismo nombre se salta.
- Lógica pura en `mergeCodexSchema` (`src/utils/codexSchemaMerge.ts`); lectura y
  escritura en `CodexSchemaRepo.ts`.
- Tests: `test/codex-schema-merge.test.cjs`. Detalle: [codex.md](codex.md),
  [novels.md](novels.md), [storage.md](storage.md).

### Novelas: abrir la última novela, no una borrada
- Al abrir el vault salía "Novel not found": `lastActiveNovelId` solo se guardaba al
  crear una novela, así que cambiar de novela no lo actualizaba y quedaba apuntando a
  una que luego se borró.
- `setActiveNovel` ahora guarda `lastActiveNovelId` cada vez que cambia la novela
  (también `null` al borrar la activa).
- Al cargar, `resolveStartupNovelId` (`src/utils/startupNovel.ts`) usa la novela
  guardada si existe; si no, la de `updated_at` más reciente.
- `NovelStore.setActive` devuelve `false` si la novela no existe, y el store de React
  ya no marca como activa una novela que no se pudo abrir.
- Tests: `test/startup-novel.test.cjs`. Detalle: [novels.md](novels.md),
  [storage.md](storage.md).

### Outline: resúmenes en el idioma de la novela
- El resumen de capítulo (outline desde el manuscrito) no decía en qué idioma
  responder; el de acto solo lo decía si la story bible estaba apagada. Como las
  instrucciones están en inglés, a veces la IA resumía en inglés una novela en español.
- Nueva `summaryLanguageRule` (`src/context/blueprintPrompt.ts`): usa el idioma del
  blueprint y, si no hay, el del texto que se resume. Va al final del prompt, después
  del texto, y no depende de `includeInPrompts`.
- La usan el resumen de capítulo, el de acto y el outline por memoria.
- Tests: `test/summary-language.test.cjs`. Detalle: [outline.md](outline.md).

### Outline: escribir ya no se traba
- Los campos de outline y resumen de acto son `AutoSaveTextarea`: el texto vive en el
  campo y una tecla ya no re-renderiza el outline entero. Una recarga del store no pisa
  lo que se está escribiendo. Guarda tras 600 ms, al perder el foco y al cerrarse.
- `outlineRoot.tsx` se suscribe al store con `useShallow` y solo a lo que dibuja.
- Arrastrar capítulos y actos usa tipos propios: soltar sobre un textarea ya no escribe
  el id, y arrastrar texto en un campo no reordena.
- Detalle: [outline.md](outline.md).

### Codex: entradas en hojas, como notas
- El editor de entradas pasó de un modal a `CodexEntryView`, en el área principal. Se
  pueden tener varias abiertas; Obsidian las restaura al reiniciar.
- Se abren con las reglas de Obsidian: clic normal reemplaza la entrada más reciente
  (nunca una nota), clic medio o Ctrl/Cmd + clic abre pestaña nueva. Historial
  atrás/adelante por pestaña.
- El editor recibe `entryId` por prop; se quitó `editingEntryId` del store. Adopta los
  cambios hechos en otro lado y guarda al cerrar la pestaña.
- La vista ocupa todo el ancho con padding ligero.
- Detalle: [codex.md](codex.md), [hotkeys.md](hotkeys.md).

### Chat: sesión persistente y agente autónomo
- El turno vive en una `ChatSession` por chat, fuera de React: cambiar de pestaña ya no
  pierde las tool calls ni las aprobaciones, y la respuesta siempre llega a su chat.
- Se acabaron los chats duplicados: abrir una vista ya no resetea el chat activo, que
  ahora se recuerda por novela.
- Los cambios a un archivo de chat pasan por `withFileLock`; renombrar el chat mientras
  se guardaba la respuesta ya no la borra.
- La respuesta se guarda mientras avanza, con la traza de tools (`Mensaje.toolCalls`).
- Loop autónomo como Claude Code: sigue hasta terminar; pausa con Continue cada 25
  rondas (`toolRoundsBeforePause`, reemplaza `maxToolRounds` = 4), rechaza llamadas
  idénticas repetidas, botón Stop.
- "Approve all for this answer" y toggle Auto-approve (`chatAutoApproveWrites`, apagado
  por defecto).
- Tools nuevas: `edit_chapter` y `search_novel`. Instrucciones de autonomía en el prompt
  de tools.
- Detalle: [chat.md](chat.md), [chat-tools.md](chat-tools.md).

### Documentación
- Se creó `docs/` con un archivo por módulo, este changelog y [hotkeys.md](hotkeys.md).
  `CLAUDE.md` queda como resumen de la arquitectura.
