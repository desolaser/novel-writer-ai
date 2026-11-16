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
- generar borradores de capítulo, con el largo del Story Bible (ver abajo).

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
`writing` y sigue pidiendo hasta llegar al mínimo del rango.

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

## Persistencia

Todas las escrituras van por `updateActo` / `updateCapitulo` del store, que terminan en
`EstructuraRepo` dentro de `withEstructuraLock`. Ver [storage.md](storage.md).

## Abrir un capítulo desde otro lado

`plugin.openOutlineChapter(id)` abre la vista y dispara el evento de ventana
`novel-writer:open-outline-chapter`; `outlineRoot.tsx` expande ese capítulo y lo
desplaza a la vista. Lo usa el chat al abrir un outline de su contexto.
