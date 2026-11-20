# Tests

## Dónde y cómo se corren

- Todos los tests viven en `test/` en la raíz, con nombre `*.test.cjs`. Nunca dentro de
  `src/`.
- `npm test` corre todos, cada archivo en su propio proceso. Tiene que ser así: cada
  test parchea el cargador de módulos de Node con sus propios mocks, y en un mismo
  proceso se pisarían.
- Scripts por archivo para iterar rápido: `test:models`, `test:storage`, `test:chat`.
  Usan `--test-isolation=none`, que sirve para un solo archivo.
- Sin dependencias nuevas: solo `node:test`, `node:assert/strict` y el `typescript` que
  ya está en el proyecto.

| Archivo | Cubre |
|---|---|
| `chat-agent.test.cjs` | Loop del agente (rondas, pausa, repeticiones, stop, compactación) y `ChatSession` (aprobación, auto-approve, stop aunque el modelo o una tool no respondan, traza guardada, tools apagadas en Settings, `alwaysAsk`, deshacer una respuesta); parser con argumentos del catálogo |
| `chat-tools.test.cjs` | Tools del chat contra una novela en memoria: catálogo completo y grupos de Settings, privacidad del codex, detalles, estructura (borrar incluido), escenas, blueprint, memoria, workspace, plan, generadores y continuidad |
| `draft-length.test.cjs` | Largo de un borrador: rango del Story Bible, punto medio, rango por defecto, override y la regla del prompt |
| `draft-ending.test.cjs` | Borradores cortados a mitad de oración: detección y recorte hasta la última oración completa |
| `file-changes.test.cjs` | Diferencia entre copias de la novela y plan para deshacer una respuesta (conflictos incluidos) |
| `turn-segments.test.cjs` | Orden de texto y tool calls de una respuesta (con y sin `textOffset`, texto editado) |
| `codex-schema-merge.test.cjs` | Copia de categorías y detalles entre novelas (ids nuevos, nombres repetidos, vínculos, selección parcial) |
| `novel-metrics.test.cjs` | Pestaña Metrics: palabras, párrafos, oraciones, diálogo, variedad de vocabulario, largo de capítulos y objetivo, menciones del codex, palabras y frases repetidas |
| `writing-log.test.cjs` | Registro de escritura: fechas locales, suma de días, log dañado, ritmo, rachas, proyección, marcas de escrituras del plugin y el tracker (línea base, generado, pegado y cortado, borrar lo pegado o generado, IA en el editor, cambio de novela) |
| `chapter-scenes.test.cjs` | Escenas: operaciones de la lista, largo de cada escena, manuscrito por escenas (separadores, frontmatter, escena del cursor), bloques del prompt y su privacidad, prompt y respuesta de "Split into scenes" |
| `continuity.test.cjs` | Continuidad: hash del texto, fusión de hechos (los del autor quedan), bloque de hechos anteriores, ubicar una cita, prompts y respuestas, archivo bajo lock con caso de control, archivo dañado, aviso a quien escucha, limpieza |
| `continuity-checker.test.cjs` | `ContinuityChecker` con modelo, store y vault falsos: qué capítulos se extraen, reporte guardado, hechos del autor en la revisión, capítulo ilegible saltado, capítulo sin texto |
| `chapter-info.test.cjs` | Información del capítulo: línea del prompt, entradas ocultas a la IA, días y tiempo de la historia, estados, fecha de publicación, agrupado en Metrics |
| `chat-repo-lock.test.cjs` | Escrituras concurrentes a un chat, con caso de control |
| `estructura-lock.test.cjs` | Escrituras concurrentes a `estructura.json`, con caso de control (también para las escenas de un capítulo); el rebuild conserva la información y las escenas de los capítulos |
| `manuscript-export.test.cjs` | Exportar: sintaxis de Obsidian quitada, cursivas y negritas, cada formato de capítulo, libro (orden, filtro por estado, encabezados, idioma), Markdown y HTML, EPUB (mimetype primero y sin comprimir), DOCX, siguiente capítulo sin publicar |
| `model-purposes.test.cjs` | Perfiles por propósito, migraciones de settings, presupuestos de output, borradores escena por escena y de una escena. Mockea React (`useState`, `useMemo`) y el store (hook con `getState`) para `useOutlineActions` y `OutlineGenerator` |
| `editor-actions.test.cjs` | Acciones del editor |
| `promptTemplates.test.cjs` | Plantillas de prompt |
| `startup-novel.test.cjs` | Novela que se abre al cargar (guardada, borrada, ninguna) |
| `summary-language.test.cjs` | Regla de idioma de los resúmenes de capítulo, de acto y del outline por memoria |

## Cómo cargan el código TypeScript

No hay bundler en los tests. Cada archivo transpila el `.ts` real al vuelo con
`ts.transpileModule` (CommonJS, ES2020). Dos formas en uso:

- Registrar `require.extensions['.ts']` y hacer `require('../src/....ts')`. Es la forma
  preferida cuando el módulo importa otros módulos del plugin.
- Compilar un solo archivo a mano con `new Module(...)._compile(...)`
  (`promptTemplates`). Sirve para un módulo sin dependencias internas.

## Mocks

`obsidian` no existe fuera de la app, así que cualquier módulo que lo importe (aunque
sea indirectamente) necesita un mock, interceptando `Module._load`:

```js
const originalLoad = Module._load;
Module._load = function (name, parent, isMain) {
	if (name === 'obsidian') return { TFile, TFolder };
	if (name.endsWith('/modals/ConfirmModal')) {
		return { confirmDialog: async () => true };
	}
	return originalLoad.call(this, name, parent, isMain);
};
```

- Comparar con `endsWith('/ruta/Modulo')` sobre el especificador tal como está escrito
  en el `import`, no sobre la ruta absoluta.
- Si un cambio agrega un import de algo que toca Obsidian en un módulo que ya tiene
  test, ese test se rompe con `MODULE_NOT_FOUND`. Se arregla agregando el mock en el
  test, no quitando el import.
- Para concurrencia o persistencia, usar un vault falso en memoria (`fakeApp()`) con
  demoras aleatorias en `read`/`modify`, para que los cruces ocurran de verdad.
- Un test de un arreglo de concurrencia debe incluir un caso de control que muestre que
  el problema ocurre sin el arreglo; si no, pasar no prueba nada.
- Mantener la lógica fuera de React cuando se pueda (como `agentLoop.ts` y
  `ChatSession.ts`): se testea sin montar componentes.
