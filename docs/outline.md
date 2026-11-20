# Outline View

Vista (`OutlineView`, tipo `novel-writer-outline`) que se abre en la barra derecha.
Muestra los actos y capítulos de la novela activa, permite escribir el outline de cada
capítulo y el resumen de cada acto, y generar outlines, memorias y borradores con IA.

## Archivos

| Archivo | Responsabilidad |
|---|---|
| `src/ui/views/OutlineView.ts` | `ItemView` que monta React |
| `src/ui/react/outlineRoot.tsx` | Orquesta el estado de la UI y delega en `outline/` |
| `src/ui/react/outline/ActoSection.tsx` | Un acto: cabecera, resumen, capítulos, agregar capítulo |
| `src/ui/react/outline/ActoHeader.tsx` | Cabecera del acto: arrastrar, colapsar, renombrar, borrar |
| `src/ui/react/outline/ActSummary.tsx` | Resumen del acto + "Generate with AI" |
| `src/ui/react/outline/ChapterRow.tsx` | Fila de capítulo y su outline |
| `src/ui/react/outline/ChapterActionsMenu.tsx` | Menú "⋯" del capítulo |
| `src/ui/react/outline/ChapterInfoSection.tsx` | "Details" plegable con su resumen; envuelve `ChapterInfoFields` |
| `src/ui/react/outline/ChapterInfoFields.tsx` | Estado, punto de vista, escenario y tiempo de la historia del capítulo expandido |
| `src/ui/react/outline/ChapterStatusDot.tsx` | Punto de color con el estado, en la fila del capítulo |
| `src/ui/react/outline/CodexEntrySelect.tsx` | Selector de una entrada del codex, agrupado por categoría |
| `src/ui/react/outline/ChapterScenes.tsx` | Escenas del capítulo expandido: agregar, dividir con IA, lista |
| `src/ui/react/outline/SceneCard.tsx` | Una escena: título, qué pasa, mover, escribir, borrar |
| `src/ui/react/outline/SceneDetailFields.tsx` | Campos plegados de una escena ("More") |
| `src/ui/react/outline/sceneActionsContext.ts` | Contexto de React con las acciones de IA de las escenas |
| `src/ui/react/components/CollapsibleSection.tsx` | Bloque con título que se pliega a una línea |
| `src/ui/react/outline/useOutlineSectionOpen.ts` | Si "Scenes" o "Facts" están abiertos; recuerda la última elección |
| `src/ui/react/components/CommitInput.tsx` | Input de una línea que guarda al perder el foco o con Enter |
| `src/ui/react/outline/useOutlineActions.ts` | Acciones de IA y batch: mensajes de progreso y confirmaciones |
| `src/ui/react/outline/outlineGenerator.ts` | `OutlineGenerator`: los generadores sin React (también los usa el chat) |
| `src/ui/react/outline/outlineGenerators.ts` | Generación de borradores de capítulo |
| `src/ui/react/outline/dragTypes.ts` | Tipos de arrastre propios |
| `src/ui/react/components/AutoSaveTextarea.tsx` | Campo con auto-guardado |

## Auto-guardado: `AutoSaveTextarea`

El outline de cada capítulo y el resumen de cada acto son `AutoSaveTextarea`. El texto
vive en el estado del propio campo y se guarda:

- 600 ms después de la última tecla,
- al perder el foco,
- al desmontarse (colapsar el capítulo, colapsar el acto o cerrar la vista).

Un valor nuevo del store solo se adopta si el campo **no tiene foco**, **no hay timer
pendiente** y **no hay guardados propios en curso**. Mientras el autor escribe, gana su
texto, aunque la IA o el chat cambien ese outline al mismo tiempo.

Por qué es así: antes cada tecla pasaba por el estado de `outlineRoot.tsx`, que
re-renderizaba el outline entero, y cada guardado recargaba el store dentro del campo.
Con muchos capítulos escribir se trababa y una recarga a destiempo reemplazaba el texto
bajo el cursor. El autor lo veía como "se bloquea la escritura".

Un campo nuevo con auto-guardado debe usar `AutoSaveTextarea`, no copiar la lógica. Un
guardado que falla muestra un `Notice`.

## Información del capítulo

Cada capítulo puede tener, además de su outline (`ChapterInfo` en
`src/domain/entities/Estructura.ts`; todos los campos son opcionales):

| Campo | Qué es |
|---|---|
| `status` | Etapa: `idea`, `outlined`, `drafted`, `revised`, `final` (`src/constants/chapterStatus.ts`). Vacío = "Not set" |
| `pov_entry_id` | Entrada del codex desde cuyo punto de vista se narra |
| `location_entry_id` | Entrada del codex donde pasa principalmente |
| `story_day` | Día dentro de la historia (entero, puede ser negativo). Sirve para ordenar por cronología |
| `story_day_end` | Último día, si el capítulo dura varios; vacío = un día. Ver [timeline.md](timeline.md#el-tiempo-de-un-capítulo) |
| `story_time` | Etiqueta libre ("tercera luna del invierno"), para calendarios inventados |
| `published_on` | Fecha local (`YYYY-MM-DD`) en que se publicó online; ver [export.md](export.md#publicar-por-capítulo) |

- **Dónde se edita.** Al expandir un capítulo, arriba de su outline, en la sección
  plegable "Details" (`ChapterInfoSection` → `ChapterInfoFields`). Los selectores guardan al cambiar; día y etiqueta al perder el
  foco o con Enter (Escape descarta); la fecha de publicación, al cambiar. En la fila
  colapsada un punto de color muestra el estado (hueco si no tiene) y un ícono verde,
  si está publicado.
- **Suscripción.** `ChapterInfoFields` lee `entradas` y `categorias` del store por su
  cuenta, no por `outlineRoot.tsx`: así un cambio del codex no re-renderiza el Outline
  entero. Solo se monta con el capítulo expandido.
- **Selector de entradas.** Agrupa por categoría y pone primero "Characters" (punto de
  vista) o "Locations" (escenario). Las entradas archivadas no aparecen, salvo la ya
  elegida. Cualquier entrada sirve, aunque no sea de esa categoría.
- **Rebuild de la estructura.** `replaceEstructura` conserva la información de los
  capítulos que mantienen su nombre, igual que su id y su archivo (`keptInfo` en
  `EstructuraRepo.ts`).
- **Dónde se usa.** Los borradores y el autocompletado reciben punto de vista,
  escenario y tiempo (ver abajo y [editor.md](editor.md#información-del-capítulo)); el
  chat los lee con `list_chapters` y los escribe con `set_chapter_info` (ver
  [chat-tools.md](chat-tools.md)); Metrics los agrupa (ver
  [metrics.md](metrics.md#estado-y-punto-de-vista)).
- **Privacidad.** La IA nunca recibe el nombre de una entrada archivada o con política
  "Never", aunque sea el punto de vista (`chapterInfoPromptLine` en
  `src/utils/chapterInfo.ts`). El estado y la fecha de publicación no van a los
  prompts: no dicen nada de la historia.

Tests: `test/chapter-info.test.cjs`, `test/estructura-lock.test.cjs` (rebuild) y
`test/chat-tools.test.cjs` (tools).

## Secciones plegables

Información, escenas y hechos son opcionales: quien no los usa tiene que poder seguir
usando el Outline como antes. Por eso en el capítulo expandido son `CollapsibleSection`
**cerradas por defecto**: una sola línea ("▸ Details · Drafted · Elena · day 12",
"▸ Scenes (3)", "▸ Facts (5)"), sin sus botones. "Details" cerrado muestra un resumen
de lo que tiene puesto (`chapterInfoFacts`, con estado y fecha de publicación), así el
estado y el punto de vista siguen a la vista. Al abrir una sección se ven su contenido
y sus botones.

La última elección se guarda por sección (`settings.uiPrefs.outlineSections`) y vale
para los capítulos que se expandan después: quien usa escenas las deja abiertas una
vez. Los capítulos ya expandidos no cambian al plegar otro.

## Escenas

El outline del capítulo sigue siendo su resumen (lo usan el historial y las memorias
de los capítulos siguientes). Las escenas lo desglosan, son opcionales y, si existen,
el borrador se escribe **una escena a la vez**.

| Campo (`ChapterScene`) | Qué es |
|---|---|
| `title` | Pocas palabras. Vacío: "Scene N" |
| `summary` | Qué pasa |
| `pov_entry_id`, `location_entry_id` | Punto de vista y escenario si cambian; vacío = los del capítulo |
| `goal`, `conflict`, `outcome` | Qué quiere el personaje, qué se lo impide, cómo termina o el gancho |
| `target_words` | Palabras de la escena; vacío = una parte pareja del largo del capítulo |
| `story_day` | Día de la escena; vacío = el de la escena anterior. Agranda el rango del capítulo |

- **Dónde se editan.** Debajo del outline del capítulo expandido (`ChapterScenes`),
  en la sección plegable "Scenes".
  "Qué pasa" siempre a la vista (`AutoSaveTextarea`); el resto bajo "More" (un punto
  avisa si hay algo puesto). Título y campos de una línea guardan al perder el foco o
  con Enter. ↑/↓ reordenan. La fila colapsada muestra "3 sc.".
- **Guardado atómico.** Todo cambio pasa por `changeChapterScenes(id, cambio)`
  (`EstructuraRepo.ts`): el cambio se aplica a las escenas **del archivo**, dentro de
  `withEstructuraLock`. Guardar la lista entera con `updateCapitulo` perdía escenas
  cuando dos ediciones se cruzaban (hay un test de control). Las operaciones de lista
  son puras (`src/utils/chapterScenes.ts`).
- **Dividir con IA** (botón ✨, pide outline). `OutlineGenerator.splitIntoScenes` manda
  outline, información del capítulo, historial y story bible al modelo `utilities` y
  pide un JSON de 2 a 6 escenas (`buildSplitScenesPrompt` en
  `src/context/scenePrompt.ts`). `parseScenesResponse` tolera texto y bloques de código
  alrededor, resuelve punto de vista y escenario por nombre o alias solo entre entradas
  visibles para la IA, y deja vacíos los iguales a los del capítulo. Si ya había
  escenas, pregunta antes de reemplazarlas.
- **Borrador por escenas.** `draftText` ve escenas y escribe cada una con su largo
  (`sceneLengths`: la escena con `target_words` lo conserva, las demás se reparten lo
  que queda del objetivo del capítulo, mínimo 150; mínimo y máximo con la misma
  proporción que el rango del capítulo). Cada pedido lleva el plan de escenas y la
  escena actual (`sceneDraftBlock`), lee las escenas anteriores y termina en esa
  escena. Se unen con `* * *`. El progreso dice "scene 2/4". Vale para el botón del
  capítulo, "Generate drafts" y `draft_chapter` del chat.
- **Una escena sola** (ícono de lápiz). La escena N del plan es la sección N del
  manuscrito, contando cambios de escena (`src/utils/sceneSections.ts`). Si esa sección
  tiene texto, pregunta y la reemplaza; si es la siguiente, la agrega al final; si
  falta una anterior, avisa sin gastar un pedido. Se coloca sobre el manuscrito tal
  como está al terminar (el autor pudo seguir escribiendo) y respeta sus separadores.
  Al texto de la IA se le quitan títulos y separadores en los bordes (`trimSceneEdges`).
- **Acciones de IA sin prop drilling.** `outlineRoot.tsx` da `SceneActionsProvider`
  (dividir, escribir escena, confirmar); solo `ChapterScenes` lo lee.
- **Privacidad.** Punto de vista y escenario de una escena pasan por
  `linkedEntryName(..., forAi)`: una entrada "Never" o archivada no se nombra.
- **Rebuild.** `replaceEstructura` conserva las escenas de los capítulos que mantienen
  su nombre.

El editor sabe en qué escena está el cursor (ver
[editor.md](editor.md#información-del-capítulo)) y el chat las lee y escribe (ver
[chat-tools.md](chat-tools.md)).

Tests: `test/chapter-scenes.test.cjs`, `test/model-purposes.test.cjs` (borradores),
`test/estructura-lock.test.cjs` (lock y rebuild) y `test/chat-tools.test.cjs`.

## Suscripción al store

`outlineRoot.tsx` usa `useNovelWriter(useShallow(...))` con solo lo que dibuja (actos,
capítulos, acciones, store, novelas). Así un cambio del chat, del codex o de settings
no re-renderiza el outline. Si se agrega algo que el outline necesita del store, sumarlo
a ese selector.

## Reordenar con arrastre

Capítulos y actos se arrastran desde el ícono `⠿`. El payload usa tipos propios
(`application/x-nw-chapter`, `application/x-nw-act`, en `dragTypes.ts`), no
`text/plain`:

- soltar un capítulo sobre un textarea no escribe su id en el texto;
- arrastrar texto seleccionado dentro de un campo no dispara un reordenamiento, porque
  los destinos solo aceptan su propio tipo (`carriesDragType`).

Un capítulo soltado sobre otro de otro acto se mueve a ese acto.

## Acciones de IA

Desde la cabecera (`OutlineHeader`) y el menú de cada capítulo:

- generar el outline de un capítulo (desde el contexto o desde la memoria),
- generar la memoria de un capítulo o de todos (se escribe en el `memoryContent` del
  manuscrito, entre los marcadores de `src/utils/generatedMemory.ts`; lo que está
  fuera de ellos es del autor y no se toca),
- generar el resumen de un acto,
- crear los manuscritos que faltan,
- generar borradores de capítulo, con el largo del Story Bible (ver abajo),
- dividir el outline en escenas y escribir una escena (ver [Escenas](#escenas)),
- revisar la continuidad de un capítulo ("Check continuity..." en el menú; ver
  [continuity.md](continuity.md)).

El trabajo lo hace `OutlineGenerator`, sin React: lee el store con `getState()` y lanza
errores con mensajes para el autor. `useOutlineActions` solo agrega el estado de
progreso y las confirmaciones. Las tools del chat (`generate_outline`, `summarize_act`,
`draft_chapter`, `refresh_story_context`) usan la misma clase, así que un cambio a un
generador vale para los dos lados.

Todas usan los modelos de propósito `writing` o `utilities` (ver
[models-and-prompts.md](models-and-prompts.md)). El "historial" que reciben (qué pasó
antes) lo arma `buildChapterHistory` (`src/context/chapterHistory.ts`): outlines de los
capítulos recientes y resúmenes de acto para los lejanos, nunca extractos de la prosa.

### Borradores: largo, final y contexto

`generateChapterDraftText` (`outlineGenerators.ts`) pide el capítulo con el modelo
`writing` y sigue pidiendo hasta llegar al mínimo del rango. El bucle (`draftToLength`)
es el mismo para una escena (`generateSceneDraftText`, ver [Escenas](#escenas)); cambia
el prompt y el control de largo.

- **De dónde sale el largo.** Solo del Story Bible: "words per chapter" de cada novela
  (`DraftLength`, `src/utils/draftLength.ts`). Cualquier largo dentro del rango sirve; el
  modelo apunta al punto medio (2000-4000 → 3000) y el máximo es un techo. Sin Novel
  Setup se usa `DEFAULT_WORD_RANGE` (2000-4000). `OutlineGenerator.draftLength()` lo lee.
  Antes había un campo "Words" en la cabecera del Outline (`draftWordCount`, uno para
  todo el vault) que no coincidía con el rango que usa `novel_status`; se quitó, y el
  setting viejo se borra al cargar.
- **Largo en el prompt.** `draftLengthRule` (`src/context/promptBuilder.ts`) da el rango,
  el punto al que apuntar y el techo, y pide ajustar las escenas al largo en vez de
  cortar el final. "Aproximadamente N palabras" solo no bastaba: un capítulo de 2000
  volvía con 3000.
- **Presupuesto.** `chapterOutputBudget` deja un margen de 1,25 sobre el punto medio
  (antes 1,5). Con 1,5 el límite de output alcanzaba para ~3000 palabras en español y
  era lo que cortaba el texto.
- **Final cortado.** Si una respuesta termina a mitad de oración (llegó al límite), se
  recorta hasta la última oración completa (`src/utils/draftEnding.ts`). Si el borrador
  ya llegó al largo, una sola petición corta (hasta 200 palabras) cierra la escena.
- **Memoria del capítulo correcto.** El prompt recibe la memoria y la nota del autor
  del capítulo que se escribe (`ScenePromptMeta`, leído por
  `OutlineGenerator.chapterMeta`). Antes salían de la nota abierta en el editor, así
  que desde el Outline o el chat llegaba la "historia hasta aquí" de otro capítulo, o
  ninguna.
- **Codex.** Las entradas se detectan en el outline además del texto ya escrito. Antes
  solo en el texto, y en la primera petición no hay texto: el modelo no recibía los
  lugares y personajes que el outline nombra.
- **Información del capítulo.** `chapterMeta` agrega a `ScenePromptMeta` la línea
  `Chapter info: Point of view: X. Setting: Y. Story time: day 12 (...)`. Va después de
  la nota del autor, y también entra en el texto de detección del codex: el punto de
  vista y el escenario llegan al bloque del codex aunque el texto no los nombre.

Tests: `test/draft-length.test.cjs`, `test/draft-ending.test.cjs` y
`test/model-purposes.test.cjs`.

### Idioma de los resúmenes

Las instrucciones de los prompts están en inglés; sin una regla explícita la IA tiende
a resumir en inglés aunque la novela esté en español. Por eso el resumen de capítulo,
el resumen de acto y el outline por memoria terminan con `summaryLanguageRule`
(`src/context/blueprintPrompt.ts`):

- con idioma en el blueprint, lo nombra ("Write the summary in Spanish...");
- sin idioma, pide el mismo idioma que el texto resumido (el manuscrito, los outlines
  del acto o los capítulos previos);
- va al final del prompt, después del texto, donde más pesa;
- se manda aunque la story bible esté apagada (`includeInPrompts`): apagarla oculta la
  premisa, no el idioma.

Un prompt nuevo que resuma texto del autor debe terminar con esta regla. Tests en
`test/summary-language.test.cjs`.

## Hechos del capítulo

Debajo de las escenas, el capítulo expandido muestra sus hechos para la revisión de
continuidad (`ChapterFacts`, en `src/ui/react/features/continuity`). `outlineRoot.tsx`
da el `ContinuityChecker` por `ContinuityProvider`. Ver
[continuity.md](continuity.md#el-registro-de-hechos).

## Exportar, publicar y línea de tiempo

El botón con barras de la cabecera abre la línea de tiempo (ver
[timeline.md](timeline.md)). El botón de descarga de la cabecera abre "Export novel" y el menú "⋯" del capítulo
tiene "Copy for publishing..." (deshabilitado sin manuscrito). Ver
[export.md](export.md).

## Persistencia

Todas las escrituras van por `updateActo` / `updateCapitulo` del store, que terminan en
`EstructuraRepo` dentro de `withEstructuraLock`. Ver [storage.md](storage.md).

## Abrir un capítulo desde otro lado

`plugin.openOutlineChapter(id)` abre la vista y dispara el evento de ventana
`novel-writer:open-outline-chapter`; `outlineRoot.tsx` expande ese capítulo y lo
desplaza a la vista. Lo usa el chat al abrir un outline de su contexto.
