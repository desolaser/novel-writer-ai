# Línea de tiempo de la historia

Vista propia (`TimelineView`, tipo `novel-writer-timeline`) en una pestaña del área
principal. Muestra los capítulos según **cuándo pasan en la historia**, no en qué orden
se leen, en carriles por punto de vista, escenario o personaje. Sirve para ver
flashbacks, huecos de tiempo, capítulos que se pisan y quién lleva días sin aparecer.

Se abre con el comando "Open story timeline" o con el botón de la cabecera del Outline.

## Por qué no el Canvas de Obsidian

Los `.canvas` son JSON estáticos: mover un capítulo ahí no cambiaría su día, y habría
que sincronizar dos fuentes a mano. Esta vista lee y escribe los mismos campos que el
Outline.

## El tiempo de un capítulo

Un capítulo cubre un **rango de días** (`chapterDayRange` en `src/utils/chapterInfo.ts`):

| Campo | Dónde | Qué es |
|---|---|---|
| `story_day` | Capítulo | Primer día (entero, puede ser negativo) |
| `story_day_end` | Capítulo | Último día, si dura varios; vacío = un día. No puede ser anterior a `story_day` (`checkDayRange`) |
| `ChapterScene.story_day` | Escena | Día de la escena; vacío = el de la escena anterior |
| `story_time` | Capítulo | Etiqueta libre ("tercera luna"), solo para mostrar |

El rango es la **unión** de los tres: del día más temprano al más tardío entre el día del
capítulo, su último día y los días de sus escenas. Así sirve igual para un capítulo de
un día, uno de varios días sin escenas ("Day 3 to 5") y uno con escenas fechadas, y los
datos nunca se contradicen: una escena fuera del rango lo agranda.

`formatStoryTime` lo muestra como "days 3–5 (third moon)" en los prompts, en
`list_chapters` y en el resumen de "Details". Se edita en "Details" del capítulo
expandido (Day, to, When), en "More" de cada escena (Day) y en el panel de la línea de
tiempo.

## Cómo se dibuja

`buildStoryTimeline` (`src/utils/storyTimeline.ts`, puro) arma:

- **Columnas:** una por día usado (inicio, fin o día de escena), con el mismo ancho. Un
  salto se marca con una columna angosta "+39" (días que pasan). Con días 1, 2, 3 y 400
  no queda casi todo vacío, como pasaría con un eje proporcional.
- **Carriles** (selector, se recuerda en `uiPrefs.timelineLanes`):
  - *Point of view* y *Setting*: el campo del capítulo; sin él, "No point of view".
  - *Characters named*: el capítulo aparece en el carril de **cada** entrada de la
    categoría "Characters" que nombra (todas las entradas si no hay esa categoría),
    con la misma búsqueda que Metrics (`chapterEntryMentions`). Lee los manuscritos, así
    que solo corre en este modo; el botón ↻ vuelve a leerlos.
  - *No lanes*: un solo carril.
  - Orden: según el primer capítulo de cada carril en la lectura; el vacío al final.
- **Barras:** cada capítulo va de la columna de su primer día a la del último. Dentro de
  un carril, las que se pisan se apilan en filas (`stack`).
- **Escenas:** las fechadas son marcas numeradas sobre la barra, en su día.
- **Flashback** (↶, borde punteado): empieza antes que algún capítulo que se lee antes.
  Superponerse no es volver atrás.
- **Undated:** los capítulos sin ningún día.

La vista es una grilla CSS (`TimelineGrid.tsx`): fila de días fija arriba, nombre del
carril fijo a la izquierda, barras y marcas como elementos de la grilla.

## Editar desde la vista

- **Arrastrar una barra a otro día** la mueve conservando su duración: día, último día
  y días de sus escenas se corren lo mismo (`moveChapterToDay`). Las escenas se guardan
  con `changeChapterScenes`, recalculadas sobre las escenas del archivo.
- **Arrastrar a "Undated"** le quita todos los días, también a sus escenas
  (`clearChapterDays`).
- **Arrastrar desde "Undated"** a un día se lo pone.
- **Clic** abre el panel (`TimelineDetails`): Day, To day, When y el día de cada escena,
  cualquier número (no solo las columnas que ya existen); "Open manuscript" y "Show in
  Outline". **Doble clic** abre el manuscrito.
- El arrastre usa su propio tipo (`application/x-nw-timeline-chapter`): soltar otra cosa
  no mueve nada.

Todo pasa por `updateCapitulo` y `changeChapterScenes` del store, así que el Outline y
la vista se actualizan solos.

## Archivos

| Archivo | Responsabilidad |
|---|---|
| `src/utils/chapterInfo.ts` | `chapterDayRange`, `formatDayRange`, `formatStoryTime`, `checkDayRange` |
| `src/utils/storyTimeline.ts` | Columnas, carriles, barras, flashbacks; mover y quitar días; menciones por capítulo |
| `src/types/StoryTimeline.ts` | Tipos de la línea de tiempo |
| `src/ui/views/TimelineView.ts` | `ItemView` |
| `src/ui/react/features/timeline/` | `TimelineRoot`, barra, grilla, barra de capítulo, "Undated", panel, menciones y guardado |

## Chat

`set_chapter_info` acepta `to_day`; `set_scene`, `day`. `list_chapters` y `read_outline`
muestran los rangos. Ver [chat-tools.md](chat-tools.md).

Tests: `test/story-timeline.test.cjs`; rangos en `test/chat-tools.test.cjs`.
