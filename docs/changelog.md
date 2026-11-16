# Changelog

Un registro por cambio, el más reciente arriba. Cada entrada dice qué cambió, por qué, y
qué documento de módulo tiene el detalle.

## 2026-11-16

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
