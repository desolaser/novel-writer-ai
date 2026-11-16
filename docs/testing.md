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
| `chat-agent.test.cjs` | Loop del agente (rondas, pausa, repeticiones, stop, compactación) y `ChatSession` (aprobación, auto-approve, stop, traza guardada) |
| `chat-repo-lock.test.cjs` | Escrituras concurrentes a un chat, con caso de control |
| `estructura-lock.test.cjs` | Escrituras concurrentes a `estructura.json`, con caso de control |
| `model-purposes.test.cjs` | Perfiles por propósito, migraciones de settings, presupuestos de output |
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
