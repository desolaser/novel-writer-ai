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
reglas de autonomía: planificar en tareas de varios pasos, seguir hasta terminar sin
preguntar si continuar, resumir al final, leer antes de editar, preferir `edit_chapter`,
no repetir una llamada idéntica.

## Catálogo

| Tool | Tipo | Qué hace |
|---|---|---|
| `list_chapters` | read | Capítulos con acto, orden, si tienen outline y palabras |
| `read_chapter` | read | Texto del manuscrito de un capítulo |
| `create_chapter` | write | Crea un capítulo (y su archivo), opcionalmente con outline y texto |
| `write_chapter` | write | Reemplaza o agrega al final del texto de un capítulo |
| `edit_chapter` | write | Reemplaza un pasaje exacto (`find` → `replace`); `all: yes` reemplaza todas las ocurrencias |
| `search_novel` | read | Busca un texto en manuscritos, outlines y codex (`scope`) y devuelve fragmentos |
| `read_outline` | read | Outline de un capítulo |
| `write_outline` | write | Reemplaza o agrega al outline de un capítulo |
| `list_codex` | read | Entradas con categoría y descripción corta, filtrables |
| `read_codex_entry` | read | Una entrada completa (sin notas privadas) |
| `create_codex_entry` | write | Crea una entrada |
| `update_codex_entry` | write | Edita descripción o alias de una entrada |

Los capítulos se pueden nombrar por nombre, nombre parcial o posición (`#3`), resuelto
por `resolveByName`.

`edit_chapter` falla si el texto no aparece (pide copiarlo exacto de `read_chapter`) o
si aparece varias veces sin `all: yes` (pide más contexto). Así obliga a leer antes de
editar, como el Edit de Claude Code.

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
- **Notas privadas.** `EntradaCodex.notas` nunca sale en el output de una tool ni se
  busca con `search_novel`.
- **Las tools dependen del contrato, no del store.** Usan `ToolContext`
  (`src/interfaces/tool-context.ts`); el adaptador al store es
  `createStoreToolContext.ts`, que lee con `getState()` en cada llamada para ver lo que
  cambió una escritura anterior del mismo turno.

## Cómo agregar una tool

1. Definirla en `src/tools/registry.ts` (nombre, `read`/`write`, descripción corta y
   concreta, argumentos con `required` / `multiline` / `values`).
2. Implementarla en el archivo de su dominio (`chapterTools.ts`, `outlineTools.ts`,
   `codexTools.ts`, `searchTools.ts`). Devuelve el texto para el modelo y lanza un
   `Error` con un mensaje útil si algo no se resuelve.
3. Registrarla en `HANDLERS` de `src/tools/executor.ts`.
4. Si necesita datos nuevos, agregarlos a `ToolContext` y a `createStoreToolContext.ts`.
5. Agregarla a la tabla de arriba y al [changelog](changelog.md).

Cada definición son tokens en cada request: descripciones cortas.
