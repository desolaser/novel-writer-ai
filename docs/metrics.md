# Metrics

Pestaña "Metrics" del Companion: estadísticas de la novela activa. Solo lectura, todo
se calcula en local y nada llega a la IA.

## Dónde está

| Pieza | Archivo |
|---|---|
| Cálculo (puro) | `src/utils/novelMetrics.ts` (`computeNovelMetrics`) |
| Análisis de texto (puro) | `src/utils/textStats.ts` |
| Palabras vacías (es + en) | `src/constants/stopwords.ts` |
| Tipos del resultado | `src/types/NovelMetrics.ts` |
| Contrato de lectura | `src/interfaces/metrics-source.ts` (`MetricsSource`) |
| Ritmo de escritura (puro) | `src/utils/writingLog.ts` (`writingPace`, `mergeWritingDays`) |
| Registro diario | `src/infrastructure/storage/writingTracker.ts`, `repos/WritingLogRepo.ts`, `pluginWrites.ts`; armado en `src/factories/writing-tracker-factory.ts` |
| Carga y recálculo | `src/ui/react/features/metrics/useNovelMetrics.ts` |
| UI | `src/ui/react/features/metrics/` (`MetricsPanel` y una sección por archivo) |

`computeNovelMetrics` recibe actos, capítulos, el texto de cada capítulo, entradas,
categorías y el rango de palabras del Novel Setup, y devuelve todo el reporte. No toca
Obsidian ni el store: se testea directo (`test/novel-metrics.test.cjs`). El hook lee los
manuscritos con `readCapituloTexto` (pasa por `withEstructuraLock`) a través de
`MetricsSource` y le pasa los datos.

## Qué muestra

| Sección | Contenido |
|---|---|
| Writing pace | Hoy, últimos 7 y 30 días, promedio por día escrito, racha actual y más larga, mejor día, columnas de los últimos 30 días, fecha estimada de fin |
| Overview | Palabras, capítulos escritos/total, actos, capítulos con outline, páginas (250 palabras/página), tiempo de lectura (250 palabras/minuto), entradas del codex, palabras distintas |
| Chapter length | Promedio, mediana, más corto y más largo (solo capítulos con texto); barras por capítulo en orden de lectura con la banda del objetivo; cuántos quedan dentro, debajo o encima |
| Words per act | Barras por acto |
| Codex | Entradas activas, nombradas en el manuscrito, nunca nombradas, archivadas; entradas por categoría |
| Most mentioned | Entradas por cantidad de menciones (15, con "Show all") |
| Gone quiet | Entradas con 3+ menciones que no aparecen hace 3+ capítulos escritos |
| Never mentioned | Entradas activas sin ninguna mención, como chips |
| Appearances by chapter | Mapa de calor: entradas más mencionadas (12, con "Show all") × capítulos |
| Most used words | Top 25 sin palabras vacías ni números; "Hide codex names" quita nombres y alias |
| Repeated phrases | Frases de 3 palabras repetidas, con al menos 2 palabras que no sean vacías |
| Style | Palabras por oración y por párrafo, % de diálogo, variedad de vocabulario (MATTR, ventana de 500), letras por palabra |

Clic en la barra de un capítulo con manuscrito, o en una celda del mapa de calor: lo abre. Clic en una entrada: la abre
con las reglas de `openCodexEntry` (Ctrl/Cmd + clic, pestaña nueva, etc.).

## Reglas del conteo

- **Palabras**: secuencias de letras o números (`\p{L}\p{N}`), con apóstrofo interno
  (`it's`). Guiones de diálogo y puntuación no cuentan. Por eso el total puede diferir
  un poco del de `novel_status` del chat (que separa por espacios).
- Antes de contar, `cleanMarkdown` quita frontmatter, comentarios `%%…%%` y `<!-- -->`,
  embeds `![[…]]` e imágenes, y deja solo el texto visible de los links.
- **Párrafos**: líneas no vacías que no son encabezados (`#`) ni separadores (`***`).
- **Oraciones**: cortan en `.`, `!`, `?` o `…` seguidos de espacio o fin de línea.
- **Diálogo** (estimación): un párrafo que abre con raya (`—`, `–` o `--`) alterna habla
  y narración en cada raya; si no, cuenta lo que esté entre comillas (`"…"`, `“…”`,
  `«…»`).
- **Menciones**: misma búsqueda que la pestaña Mentions (`findMentions` de
  `src/utils/codexMentions.ts`), por nombre y alias, sobre el texto limpio. Las entradas
  archivadas no cuentan.
- **Objetivo**: `wordsPerChapter` del blueprint. Sin Novel Setup no hay banda ni conteo
  de dentro/fuera.

## Cuándo se recalcula

- Al abrir la pestaña y cuando cambian actos, capítulos, entradas o categorías del store.
- Cuando se modifica el archivo de un capítulo (evento `modify` del vault), 3 segundos
  después del último cambio. Solo mientras la pestaña está abierta.
- Con el botón de recargar del encabezado.

Lee todos los manuscritos cada vez. Para novelas muy largas, si se vuelve lento, el
lugar para cachear es el hook (por ruta y `mtime`), no `computeNovelMetrics`.

## Mapa de calor de apariciones

`EntryMentions.perChapter` guarda las menciones de cada entrada en cada capítulo (índice 0
= capítulo #1). La intensidad de una celda (4 niveles) es relativa al capítulo con más
menciones **de esa misma entrada**: muestra el patrón de presencia de cada personaje, no
compara personajes entre sí. El número exacto va en el tooltip. Columnas de 14 px con
scroll horizontal y el nombre fijo a la izquierda.

## Ritmo de escritura

### Qué se cuenta

`WritingTracker` (uno por instancia del plugin, creado en `main.ts`) escucha el evento
`modify` del vault. Guarda el conteo de palabras de cada manuscrito de la novela activa
(línea base) y, cuando uno se guarda, suma la diferencia al día de hoy:

- `added` / `removed`: palabras que el autor tecleó o borró. El ritmo usa el neto.
- `generated`: neto de lo que escribió el propio plugin. Dos vías:
  - Escrituras al archivo entero (`writeCapituloTexto`: borradores del outline y tools
    del chat; el deshacer de respuestas en `novelSnapshot.ts`) llaman a
    `markPluginWrite(path)` (`pluginWrites.ts`) antes de escribir. Todo el guardado
    marcado (4 s) cuenta como generado.
  - Texto de la IA en el editor ("Generate text" y acciones del editor, en `main.ts`)
    avisa las palabras exactas con `noteEdit(path, 'generated', neto)`. El streaming
    cuenta sobre el texto acumulado, porque un fragmento puede cortar una palabra.
- `pasted`: neto de lo que entró y salió por el portapapeles
  (`src/ui/editor/clipboardTracking.ts`). `editor-paste` suma lo pegado menos la
  selección que reemplaza; el evento `cut` del documento resta lo cortado (sin selección,
  CodeMirror corta la línea entera). Mover texto (cortar y pegar) da cero.
- Lo avisado con `noteEdit` se descuenta del siguiente guardado de ese archivo
  (`attributeSave`, `src/utils/writingAttribution.ts`); lo que queda es del autor.
- **Lo borrado sale primero de lo ajeno.** El tracker recuerda, por archivo y durante la
  sesión, las palabras pegadas o generadas que siguen en el texto (una pila, la más
  reciente arriba). Cuando el autor borra, se descuentan de ahí (pegar un párrafo y
  borrarlo da cero, no −N para el autor); solo lo que sobra es `removed`. La pila se
  pierde al recargar el plugin: borrar después texto pegado antes cuenta como del autor.
- Ambigüedades conocidas: pegar y borrar dentro de un mismo guardado no se distingue de
  conservar parte de lo pegado, y se resuelve a favor de lo ajeno (nunca resta al
  autor). Escribir pegado a una palabra generada puede errar por una palabra.
- Mismo conteo de palabras que el resto de la pestaña (`countProseWords`).

Las líneas base se toman cuando la novela se activa o aparecen capítulos nuevos (el
`main.ts` se suscribe a `capitulos` del store). Lo que cambió con Obsidian cerrado, o
llegó sincronizado de otro dispositivo, no se acredita: ese dispositivo ya lo registró.
Solo se sigue la novela activa.

### Dónde se guarda

`__writing_log.json` en la carpeta de la novela (`WritingLog`, un registro por día con
actividad). El tracker junta los conteos en memoria y los escribe 10 s después del
último, y al descargar el plugin. `WritingLogRepo.addWritingDays` corre dentro de
`withFileLock`, relee el archivo y **suma** los conteos: dos dispositivos que sincronizan
el vault no se pisan los días. El archivo no entra en las copias para deshacer
respuestas del chat. Ver [storage.md](storage.md).

### Qué se muestra

`writingPace` (puro) calcula:

- Hoy, últimos 7 y 30 días; promedio de los días con escritura de los últimos 30.
- Racha: días seguidos con neto positivo hasta hoy, o hasta ayer si hoy todavía no hay
  nada. Racha más larga y mejor día de todo el registro.
- Proyección: si hay objetivo (`totals.targetWords` = capítulos × punto medio del rango
  del Novel Setup), palabras que faltan ÷ ritmo reciente (neto de los últimos 30 días,
  o desde el primer día del registro si empezó hace menos). Sin ritmo, no hay fecha.
