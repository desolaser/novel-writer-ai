---
paths:
  - "test/**"
  - "package.json"
---

# Tests

Detalle de la sección "Tests" de `CLAUDE.md`.

## Dónde y cómo se corren

- Todos los tests viven en `test/` en la raíz, con nombre `*.test.cjs`. Nunca
  dentro de `src/`.
- `npm test` corre todos, cada archivo en su propio proceso. Tiene que ser así:
  cada test parchea el cargador de módulos de Node con sus propios mocks, y en un
  mismo proceso se pisarían.
- Hay scripts por archivo para iterar rápido (`test:models`, `test:storage`);
  usan `--test-isolation=none`, que sirve para un solo archivo.
- Sin dependencias nuevas: solo `node:test`, `node:assert/strict` y el
  `typescript` que ya está en el proyecto.

## Cómo cargan el código TypeScript

No hay bundler en los tests. Cada archivo transpila el `.ts` real al vuelo con
`ts.transpileModule` (CommonJS, ES2020). Hay dos formas en uso:

- Registrar `require.extensions['.ts']` y hacer `require('../src/....ts')`
  (`editor-actions`, `model-purposes`, `estructura-lock`). Es la forma preferida
  cuando el módulo importa otros módulos del plugin.
- Compilar un solo archivo a mano con `new Module(...)._compile(...)`
  (`promptTemplates`). Sirve para un módulo sin dependencias internas.

Las rutas a `src` son relativas al archivo de test: `../src/...`.

## Mocks

`obsidian` no existe fuera de la app, así que cualquier módulo que lo importe
(aunque sea indirectamente) necesita un mock. Se hace interceptando
`Module._load` y devolviendo un objeto según el nombre pedido:

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

- Comparar con `endsWith('/ruta/Modulo')` sobre el especificador tal como está
  escrito en el `import`, no sobre la ruta absoluta.
- Si un cambio en `src` agrega un import de algo que toca Obsidian (por ejemplo
  `Notice` o `confirmDialog`) en un módulo que ya tiene test, ese test se rompe
  con `MODULE_NOT_FOUND`. Se arregla agregando el mock en ese test, no quitando
  el import.
- Para probar concurrencia o persistencia, usar un vault falso en memoria (ver
  `fakeApp()` en `test/estructura-lock.test.cjs`) con demoras aleatorias en
  `read`/`modify`, para que los cruces ocurran de verdad.
- Un test de un arreglo de concurrencia debería incluir un caso de control que
  muestre que el problema ocurre sin el arreglo; si no, pasar no prueba nada.
