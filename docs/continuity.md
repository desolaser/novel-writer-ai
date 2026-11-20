# Revisión de continuidad

Busca en un capítulo pasajes que contradicen lo que la historia estableció antes: un
color de ojos que cambió, un muerto que habla, alguien que sabe algo que todavía no
supo, tiempos o distancias imposibles. Se apoya en un **registro de hechos** por
capítulo, en vez de releer la novela entera en cada revisión.

## Por qué no basta el chat

El chat puede revisar continuidad, pero en una novela larga lo hace mal: recorta los
resultados de tools viejos a 600 caracteres (`compactToolResults`), así que al llegar al
capítulo 20 ya olvidó el 3; reenvía la conversación entera en cada ronda; y su revisión
no queda guardada. El registro de hechos resuelve las tres cosas, y el chat lo usa con
`check_continuity`.

## Archivos

| Archivo | Responsabilidad |
|---|---|
| `src/types/Continuity.ts` | Hechos, problemas, reporte y el archivo |
| `src/utils/storyFacts.ts` | Hash del texto, fusión de hechos, operaciones de la lista, bloque de hechos anteriores |
| `src/utils/quoteLocation.ts` | Ubicar una cita en el texto, tolerando espacios, mayúsculas y comillas |
| `src/context/continuityPrompt.ts` | Prompts de extracción y de revisión, y lectura de sus respuestas JSON |
| `src/infrastructure/storage/repos/ContinuityRepo.ts` | `escritura/continuity.json` bajo `withFileLock`; avisa a quien escucha |
| `src/ui/react/features/continuity/continuityChecker.ts` | `ContinuityChecker`: extraer, revisar, guardar. Sin React; lo usan el Outline y el chat |
| `src/ui/react/features/continuity/ContinuityModal.tsx`, `ContinuityView.tsx`, `ContinuityIssueCard.tsx` | Reporte de un capítulo |
| `src/ui/react/features/continuity/ChapterFacts.tsx`, `AddFactInput.tsx`, `useChapterContinuity.ts` | Hechos del capítulo expandido en el Outline |
| `src/ui/react/features/continuity/continuityContext.ts` | El checker del Outline, por contexto de React |
| `src/ui/react/features/continuity/revealQuote.ts` | Abre el manuscrito y selecciona el pasaje |
| `src/tools/continuityTools.ts` | Tool `check_continuity` |

## El registro de hechos

`escritura/continuity.json` guarda, por capítulo, sus hechos, el hash del texto del que
salieron y el último reporte.

- **Extracción.** El modelo `utilities` lista hasta 12 hechos concretos que los
  capítulos siguientes deben respetar (rasgos, heridas y muertes, quién sabe qué,
  relaciones, deudas, posesiones, lugares, tiempos, reglas del mundo), en el idioma de
  la novela (`summaryLanguageRule`).
- **Solo lo que cambió.** `storyTextHash` (FNV-1a de 32 bits) ignora frontmatter y
  espacios: reescribir la memoria del capítulo no es un cambio de la historia. Un
  capítulo cuyo hash coincide no se vuelve a extraer.
- **Del autor.** En el capítulo expandido del Outline, la sección plegable "Facts"
  (cerrada por defecto, ver [outline.md](outline.md#secciones-plegables)) lista los hechos: se
  editan, se borran y se agregan. Uno editado o agregado pasa a ser `author` y se
  conserva al volver a extraer; los `ai` se reemplazan. Un hecho de la IA igual a uno
  del autor no se duplica. Corregir un hecho equivocado evita la misma falsa alarma en
  cada revisión.
- ↻ vuelve a extraer aunque el texto no haya cambiado. Si cambió, el panel lo avisa.

## La revisión

"Check continuity..." en el menú "⋯" del capítulo (deshabilitado sin manuscrito) abre
el reporte guardado o, si no hay, revisa (`ContinuityChecker.check`):

1. Extrae los hechos de los capítulos anteriores que cambiaron, y los del propio
   capítulo (así la revisión del siguiente los encuentra). Un capítulo cuya respuesta
   no se puede leer se salta y se avisa; no frena la revisión.
2. Borra del archivo los capítulos que ya no existen.
3. Manda al modelo `utilities`: story bible, entradas del codex que el capítulo nombra
   (`buildCodexYaml` sobre todo el texto, con sus reglas de privacidad), los hechos
   anteriores numerados por su lugar en la novela y con su tiempo de la historia, la
   información del capítulo y su texto. Pide solo contradicciones reales: un cambio que
   el texto explica (curación, mentira, disfraz, tiempo) no lo es.
4. La respuesta es JSON: título, cita de 5 a 20 palabras, el hecho contradicho y su
   capítulo (0 = codex), explicación. Se guarda como reporte con el hash del texto.

En el modal cada problema tiene "Go to text", que abre el manuscrito y selecciona la
cita (`findQuote` la ubica aunque la IA cambie espacios, mayúsculas o comillas;
deshabilitado si ya no está), y "Dismiss", que lo quita del reporte guardado. Si el
capítulo cambió desde la revisión, el modal lo dice. Cerrar el modal no corta una
revisión en curso: el reporte se guarda igual.

Todo usa el modelo `utilities` (decisión del autor: el más barato).

## Chat

`check_continuity` (grupo Generators, pide aprobación como los otros generadores) corre
la misma revisión y devuelve los problemas con el capítulo de cada hecho. Ver
[chat-tools.md](chat-tools.md).

## Reglas que no hay que romper

- `continuity.json` solo se cambia con `updateChapterContinuity`, dentro de
  `withFileLock`. Hay un test de control que muestra que sin el lock se pierden
  capítulos.
- Un archivo dañado no se sobrescribe: leerlo lanza un error. Si no, la siguiente
  escritura borraría todos los hechos.
- Las notas privadas de las entradas nunca llegan: el codex entra por `buildCodexYaml`.
- El panel se recarga con `onContinuityChange` del repo, no con el store de Zustand.

Tests: `test/continuity.test.cjs` (puro, prompts, archivo y lock) y
`test/continuity-checker.test.cjs` (el checker con modelo, store y vault falsos);
`check_continuity` en `test/chat-tools.test.cjs`.
