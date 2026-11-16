# Changelog

Un registro por cambio, el más reciente arriba. Cada entrada dice qué cambió, por qué, y
qué documento de módulo tiene el detalle.

## 2026-11-16

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
