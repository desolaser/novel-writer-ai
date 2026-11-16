# Chat

Pestaña Chats del Companion. Sirve para brainstorming, refinar capítulos y roleplay con
los personajes. Con las tools activadas la IA lee y edita la novela por su cuenta (ver
[chat-tools.md](chat-tools.md)).

## Archivos

| Archivo | Responsabilidad |
|---|---|
| `src/ui/react/features/sidebar/ChatsPanel.tsx` | Lista de chats, crear, renombrar, borrar |
| `src/ui/react/features/chat/ChatTab.tsx` | Vista del chat: mensajes, input, footer |
| `src/ui/react/features/chat/ChatLiveTurn.tsx` | La respuesta en curso: texto y tool calls en orden, Stop / Continue |
| `src/ui/react/features/chat/MessageContent.tsx` | Cuerpo de un mensaje guardado; en las respuestas, texto y grupos de tool calls en orden |
| `src/ui/react/features/chat/tools/ToolCallCard.tsx` | Una tool call (con Approve / Reject en vivo) |
| `src/ui/react/features/chat/tools/PlanChecklist.tsx` | El plan del agente (`update_plan`) como checklist dentro de su tarjeta |
| `src/ui/react/features/chat/tools/create*ToolContext.ts` | Adaptadores de las tools: store, workspace y memoria (ver [chat-tools.md](chat-tools.md)) |
| `src/ui/react/features/chat/tools/ToolCallTrace.tsx` | Tool calls guardadas de un mensaje, plegadas |
| `src/ui/react/features/chat/session/ChatSession.ts` | La sesión de un chat, fuera de React |
| `src/ui/react/features/chat/session/agentLoop.ts` | El loop del agente, sin React ni storage |
| `src/ui/react/features/chat/session/toolHistory.ts` | Cómo se escriben las tools en el historial y en el archivo |
| `src/ui/react/features/chat/session/chatSessions.ts` | Registro de sesiones por chat |
| `src/ui/react/features/chat/session/useChatSession.ts` | Hook para suscribir una vista |
| `src/ui/react/features/chat/session/chatCompletion.ts` | Modelo de chat configurado → función prompt/respuesta |
| `src/ui/react/features/chat/promptBuilder.ts` | Arma el prompt del chat (también para "View context") |
| `src/ui/react/features/chat/hooks/` | Mensajes, contexto "@", imágenes, story bible, modelo |
| `src/interfaces/chat-persistence.ts` | Contrato de guardado de mensajes que usa la sesión |

## La sesión vive fuera de la vista

Cada chat tiene una `ChatSession` (registro module-level en `chatSessions.ts`). La
vista solo se suscribe con `useChatSession` (`useSyncExternalStore`).

Por qué: el turno vivía en el componente. Abrir la lista de chats u otra pestaña lo
desmontaba, las tool calls desaparecían, las aprobaciones pendientes quedaban colgadas
y la respuesta podía guardarse en el chat que estuviera abierto en ese momento.

- La sesión guarda en el storage de la novela donde se creó
  (`NovelStore.chatPersistence()`, que fija la carpeta). Una respuesta que termina
  después de cambiar de novela igual llega a su chat.
- Si el autor cambia de novela a mitad de un turno, la siguiente tool no se ejecuta y el
  turno se detiene: las tools escriben en la novela activa.
- Borrar un chat descarta su sesión (`disposeChatSession`). Descargar el plugin detiene
  todas (`stopAllChatSessions` en `onunload`).
- Mientras un turno corre, no se puede mandar otro mensaje en ese chat.

## El loop del agente (`agentLoop.ts`)

Funciona como Claude Code: pregunta al modelo, ejecuta las tools que pide, le devuelve
los resultados y vuelve a preguntar, hasta que responde sin llamar tools. El modelo
decide cuándo terminó. Los frenos:

| Freno | Comportamiento |
|---|---|
| Stop | El autor puede parar en cualquier momento y el turno termina enseguida. Las aprobaciones pendientes cuentan como rechazadas. Los proveedores no permiten cancelar la petición en vuelo: `ChatSession.untilStopped` deja de esperarla y su respuesta se descarta sin ejecutar tools. Una tool que sigue corriendo tampoco se espera; su tarjeta dice que quizás terminó. |
| Pausa por rondas | Cada `toolRoundsBeforePause` rondas (25 por defecto, en Settings) se pausa y aparece **Continue**, que sigue el mismo turno. |
| Llamadas repetidas | Una llamada idéntica (misma tool, mismos argumentos) ya ejecutada 2 veces desde la última escritura exitosa no se ejecuta; el modelo recibe un error pidiéndole usar el resultado que ya tiene. |
| Modelo que solo repite | Dos rondas seguidas hechas solo de repeticiones rechazadas pausan el turno. |

Después de una escritura exitosa, releer lo mismo vuelve a estar permitido (cambió).

El loop no sabe nada de React ni de archivos: recibe sus dependencias
(`AgentLoopDeps`) y modifica un `AgentLoopState`, lo que permite pausarlo y retomarlo, y
testearlo con un modelo falso.

## Historial que lee el modelo

- Los mensajes guardados se aplanan con `messagesToHistory`. Una respuesta con tools
  lleva al final una línea por tool usada (`[Tools used in this answer]`).
- Dentro de un turno, la respuesta del modelo queda en el historial con sus bloques de
  tool, pero los valores largos recortados a 300 caracteres
  (`describeCallsForHistory`). Sin los bloques el modelo olvidaba qué había pedido; con
  los valores completos un capítulo escrito en la ronda 1 se reenviaba en cada ronda.
- Solo los dos últimos bloques de resultados quedan enteros; los anteriores se recortan
  a 600 caracteres (`compactToolResults`).

## Persistencia de la respuesta

- El mensaje del autor se guarda al enviarlo.
- La respuesta se crea después de la primera contestación del modelo y se actualiza
  tras cada ronda. Si Obsidian se cierra a mitad, queda lo hecho hasta ahí.
- Las tool calls se guardan en `Mensaje.toolCalls` (`MensajeToolCall`): nombre, tipo,
  argumentos, estado, resultado. Argumentos y resultados se recortan a 1500 caracteres;
  el capítulo vive en su archivo, no en el chat.
- Orden: el texto de la respuesta se guarda entero (las rondas unidas por una línea en
  blanco) y cada tool call guarda `textOffset`, los caracteres que la IA había escrito
  cuando la hizo. `splitTurn` (`src/utils/turnSegments.ts`) los vuelve a intercalar,
  así que en vivo y al recargar se ve texto, tools, texto... en el orden real, como en
  Claude Code. Las respuestas guardadas antes de esto no tienen `textOffset` y muestran
  las tools al final. Si el autor editó el texto, el corte se corre al siguiente
  párrafo para no partir uno por la mitad. Entre texto y tools hay el mismo espacio
  que entre mensajes (`styles.css`, junto a `.nw-tool-trace`).
- Una tool guardada como `pending`/`awaiting`/`running` sin sesión viva se muestra como
  "Interrupted".
- La vista recarga los mensajes del disco cuando cambia `snapshot.version`, que la
  sesión sube en cada escritura. No hay mensajes temporales en memoria.

## Aprobaciones

Cada tool de escritura espera la decisión del autor en una tarjeta:

- **Approve**: ejecuta esta.
- **Approve all for this answer**: ejecuta esta y todas las escrituras hasta que termine
  la respuesta.
- **Reject**: no la ejecuta; el modelo recibe que fue rechazada.

El toggle **Auto-approve** del footer (setting `chatAutoApproveWrites`, apagado por
defecto) ejecuta las escrituras sin preguntar. La tarjeta en vivo muestra los
argumentos completos, para leer todo antes de aprobar.

## Footer

- **Tools**: incluye las instrucciones de tools (~2600 tokens por request). Se apaga solo
  en roleplay.
- **Auto-approve**: ver arriba. Deshabilitado si las tools están apagadas.
- **Story bible**: manda premisa, estilo, tiempo verbal e idioma de la novela; en
  roleplay solo el idioma.
- Selector de modelo y de prompt de chat, ver contexto, chat nuevo, configuración de
  prompts.

## Nombre del chat

Con el primer mensaje del autor se genera el nombre (`chatNameGeneration`: heurística
local o modelo de utilidades). Se pide en paralelo con la respuesta.
