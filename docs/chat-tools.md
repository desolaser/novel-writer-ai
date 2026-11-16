# Tools del chat

Funciones que la IA del chat puede llamar para leer y editar la novela. El loop que las
ejecuta está en [chat.md](chat.md).

## Protocolo de texto

No se usa tool-calling nativo. Los 11 proveedores comparten
`generateCompletion(prompt, model, options)` con el historial aplanado a un solo string,
y NovelAI / oobabooga no tienen API de tools. El modelo escribe bloques:

```
[[tool: edit_chapter]]
[[chapter]] Chapter 3
[[find]]
texto exacto
[[replace]]
texto nuevo
[[/tool]]
```

`src/utils/toolCallParsing.ts` los extrae con mucha tolerancia (corchetes simples,
espacios, fences, marcador de cierre faltante). Un bloque mal escrito pierde esa
llamada, no la respuesta entera. Lo que está fuera de los bloques es la prosa que ve el
autor.

`src/context/toolPrompt.ts` arma las instrucciones (`[TOOLS] ... [/TOOLS]`) con las
reglas de autonomía: mostrar un plan con `update_plan` en tareas de tres pasos o más,
seguir hasta terminar sin preguntar si continuar, resumir al final, leer antes de
editar, preferir `edit_chapter`, no repetir una llamada idéntica y mantener al día el
resumen del acto.

## Catálogo

Las definiciones están en `src/tools/definitions/`, un archivo por dominio;
`registry.ts` las junta en `TOOL_DEFINITIONS`.

"read" quiere decir que corre sin aprobación porque no cambia la novela. Por eso también
son "read" las tools que abren vistas y `update_plan`.

### Manuscrito (`manuscriptDefinitions.ts`)

| Tool | Tipo | Qué hace |
|---|---|---|
| `list_chapters` | read | Capítulos con acto, orden, si tienen outline y palabras |
| `read_chapter` | read | Texto de un capítulo, entero o los párrafos `from`..`to` |
| `create_chapter` | write | Crea un capítulo (y su archivo), opcionalmente con outline y texto |
| `write_chapter` | write | Reemplaza o agrega al final del texto de un capítulo |
| `edit_chapter` | write | Reemplaza un pasaje exacto (`find` → `replace`); `all: yes` reemplaza todas las ocurrencias |
| `search_novel` | read | Busca un texto en manuscritos, outlines y codex (`scope`) y devuelve fragmentos |
| `read_outline` | read | Outline de un capítulo |
| `write_outline` | write | Reemplaza o agrega al outline de un capítulo |

### Estructura (`structureDefinitions.ts`)

| Tool | Tipo | Qué hace |
|---|---|---|
| `read_act` | read | Resumen del acto y sus capítulos |
| `create_act` | write | Crea un acto al final, opcionalmente con resumen |
| `update_act` | write | Renombra un acto o reemplaza/extiende su resumen |
| `rename_chapter` | write | Renombra un capítulo; su manuscrito se renombra también |
| `move_chapter` | write | Mueve un capítulo a una posición de su acto o de otro acto |

### Codex (`codexDefinitions.ts`)

| Tool | Tipo | Qué hace |
|---|---|---|
| `list_codex` | read | Entradas con categoría y descripción corta, filtrables |
| `read_codex_entry` | read | Una entrada completa: alias, tags, descripción, primer mensaje, detalles y qué entradas la referencian |
| `create_codex_entry` | write | Crea una entrada |
| `update_codex_entry` | write | Edita descripción, alias, categoría, tags o primer mensaje (`mode` replace/append) |
| `archive_codex_entry` | write | Archiva una entrada; se restaura desde el filtro de archivadas del panel |
| `list_codex_fields` | read | Detalles personalizados de cada categoría: tipo, opciones y `ai_hint` |
| `set_codex_detail` | write | Escribe un detalle. Un dropdown recibe el nombre de la opción; una referencia, el nombre de otra entrada; vacío lo borra |
| `find_mentions` | read | Capítulos donde se menciona una entrada (nombre y alias), con fragmentos |

### Novela (`novelDefinitions.ts`)

| Tool | Tipo | Qué hace |
|---|---|---|
| `read_blueprint` | read | Novel Setup: premisa, género, estilo, tiempo verbal, idioma, largo objetivo y plan de estructura |
| `novel_status` | read | Palabras totales, capítulos sin texto u outline, actos sin resumen, capítulos fuera del largo objetivo |
| `read_memory` | read | Memoria y nota del autor de un capítulo o de la novela |
| `write_memory` | write | Escribe la memoria o la nota del autor de un capítulo o de la novela |

### Workspace (`workspaceDefinitions.ts`)

| Tool | Tipo | Qué hace |
|---|---|---|
| `update_plan` | read | Checklist del agente para tareas largas; el chat la dibuja como lista |
| `open_chapter` | read | Abre el manuscrito o el outline de un capítulo |
| `open_codex_entry` | read | Abre una entrada del codex |
| `read_selection` | read | Texto seleccionado en el último editor usado, o el párrafo del cursor |
| `read_note` | read | Lee una nota Markdown del vault por nombre o ruta, fuera de `.obsidian` |

### Detalles de comportamiento

- Capítulos y actos se pueden nombrar por nombre, nombre parcial o posición (`#3`),
  resuelto por `resolveByName`.
- `edit_chapter` falla si el texto no aparece (pide copiarlo exacto de `read_chapter`)
  o si aparece varias veces sin `all: yes` (pide más contexto). Así obliga a leer antes
  de editar, como el Edit de Claude Code.
- `read_chapter` separa párrafos por líneas en blanco y, leído entero, dice cuántos
  tiene. Leer solo la parte a editar evita que `compactToolResults` recorte el capítulo
  en las rondas siguientes.
- `move_chapter` renumera `orden` en el acto destino y, si cambió de acto, en el de
  origen, igual que el arrastre del outline.
- `find_mentions` usa `src/utils/codexMentions.ts`, la misma lógica que la pestaña
  Mentions de la entrada, así cuentan lo mismo.
- `read_note` corta en 20 000 caracteres y, si no encuentra la nota, sugiere nombres
  parecidos.

### Memoria y nota del autor

Son los textos que el autocompletado manda en cada request (ver
[editor.md](editor.md#memoria-y-nota-del-autor)). Un capítulo los guarda en el
frontmatter de su manuscrito; la novela, en `_config.md` en la raíz de su carpeta (se
crea si falta). Los dos son lugares donde la cascada de `getPromptMetaCascading` ya
buscaba.

El bloque que genera el outline entre `[Novel Writer AI - Generated Story Context]` y su
cierre se conserva siempre: las tools solo leen y escriben la parte del autor
(`src/utils/generatedMemory.ts`, que también usa `useOutlineActions`).

### Plan del agente

`update_plan` recibe un paso por línea: `[x]` hecho, `[>]` en curso, `[ ]` pendiente
(`parsePlanSteps` en `src/utils/planSteps.ts`). `ToolCallCard` lo dibuja con
`PlanChecklist` en vez de mostrar los argumentos, y oculta el resultado si salió bien.

## Reglas que no hay que romper

- **Lecturas automáticas, escrituras con aprobación.** El executor
  (`executeToolCall`) rechaza una tool de escritura si no recibe `approved = true`. Solo
  la sesión del chat lo pasa, después de la aprobación del autor, de "Approve all for
  this answer" o del toggle Auto-approve que el autor activó. No agregar una tool ni un
  llamador que se salte esto por su cuenta.
- **Llamadas truncadas no se ejecutan.** Si la respuesta se cortó por el límite de output
  con un valor multilínea abierto (nunca llegó `[[/tool]]`), la llamada se marca
  `truncated` y no se ejecuta: guardar media descripción es peor que nada. El modelo
  recibe el aviso y puede repetirla más corta o partirla con `[[mode]] append`.
- **Lo que el autor oculta a la IA.** Las reglas viven en `src/tools/codexShared.ts`:
  - `EntradaCodex.notas` nunca sale en el output de una tool ni se busca.
  - Una entrada con política de IA "Never" no existe para las tools: no se lista, no
    se lee, no se busca, no se encuentran sus menciones ni se puede referenciar
    (`visibleEntries`). `create_codex_entry` igual detecta el duplicado, sin mostrar su
    contenido.
  - Un detalle con `incluir_ia` apagado no se muestra ni se escribe
    (`isDetailVisible`).

  Antes las tools ignoraban la política y `incluir_ia`, aunque el prompt del
  autocompletado ya los respetaba.
- **Las tools dependen del contrato, no del store.** Usan `ToolContext`
  (`src/interfaces/tool-context.ts`), partido por dominio (capítulos, codex, blueprint,
  navegación, editor, notas, memoria); cada archivo de tools pide solo lo que usa. Tres
  adaptadores en `src/ui/react/features/chat/tools/`, que `useChatSession` junta:
  - `createStoreToolContext.ts`: datos de la novela. Lee con `getState()` en cada
    llamada para ver lo que cambió una escritura anterior del mismo turno.
    `setDetailValue` llama a `refreshEntry` porque el slice solo escribe el archivo.
  - `createWorkspaceToolContext.ts`: abrir vistas, selección del editor y notas del
    vault. El editor es el de la hoja más reciente del área principal, porque mientras
    el autor escribe en el chat el foco está en la barra lateral.
  - `createMemoryToolContext.ts`: memoria y nota del autor, con las funciones de
    `src/context/promptMeta.ts`.

## Cómo agregar una tool

1. Definirla en el archivo de su dominio en `src/tools/definitions/` (nombre,
   `read`/`write`, descripción corta y concreta, argumentos con `required` /
   `multiline` / `values`).
2. Implementarla en el archivo de su dominio (`chapterTools.ts`, `structureTools.ts`,
   `outlineTools.ts`, `codexTools.ts`, `codexDetailTools.ts`, `searchTools.ts`,
   `novelTools.ts`, `memoryTools.ts`, `workspaceTools.ts`, `planTools.ts`). Devuelve el
   texto para el modelo y lanza un `Error` con un mensaje útil si algo no se resuelve.
   Todo lo que toque el codex pasa por `codexShared.ts`.
3. Registrarla en `HANDLERS` de `src/tools/executor.ts`. `test/chat-tools.test.cjs`
   falla si una definición no tiene handler.
4. Si necesita datos nuevos, agregarlos a la interfaz de su dominio en `ToolContext` y
   al adaptador que corresponda.
5. Agregarla a la tabla de arriba y al [changelog](changelog.md).

Cada definición son tokens en cada request: descripciones cortas. Con 30 tools el bloque
`[TOOLS]` mide unos 10 300 caracteres (~2600 tokens). Si hace falta recortarlo, el paso
siguiente es activarlas por grupo (un grupo por archivo de `definitions/`) desde las
opciones.
