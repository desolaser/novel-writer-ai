---
paths:
  - "src/infrastructure/storage/**"
  - "src/ui/react/store/**"
  - "src/ui/react/outline/**"
  - "src/ui/react/outlineRoot.tsx"
---

# Persistencia de la estructura y auto-guardado

Detalle de la sección "Guardado y persistencia" de `CLAUDE.md`.

## `estructura.json` siempre pasa por el lock

Actos y capítulos viven en un solo archivo, `escritura/estructura.json`, y cada
cambio lee el JSON completo, lo modifica y lo vuelve a escribir. Sin coordinación,
dos guardados que se cruzan (el resumen del acto y el outline de un capítulo, o
las tools del chat escribiendo mientras el autor teclea) hacen que el segundo pise
al primero y se pierda un cambio.

`withEstructuraLock(carpeta, tarea)` en
`src/infrastructure/storage/repos/estructuraStorage.ts` es una cola por novela:
cada tarea espera a que termine la anterior.

- `readEstructuraFile` / `writeEstructuraFile` son de bajo nivel: solo se llaman
  **dentro** de una tarea del lock. Toda operación nueva sobre la estructura va en
  `EstructuraRepo.ts` o `chapterFiles.ts` envuelta en `withEstructuraLock`.
- Las lecturas también pasan por el lock (`listActos`, `listCapitulos`,
  `readEstructuraLocked`) para no leer el archivo a medio escribir.
- **Nunca** llamar desde dentro de una tarea a otra función que también tome el
  lock de la misma novela: se queda esperándose a sí misma para siempre. Por eso
  `updateCapitulo` usa el helper privado `renameChapterFile` y no otra función
  pública del repo.
- Lo lento va **fuera** del lock. Leer todas las notas del vault puede tardar, y
  mientras tanto los guardados del outline esperarían. El patrón es: escanear
  primero, entrar al lock, releer la estructura y aplicar. Ver
  `reconcileCapituloArchivos` (`scanLinkedChapterNotes` fuera) y
  `ensureCapituloArchivo` (dentro vuelve a comprobar si otra llamada ya creó el
  archivo, para no duplicarlo).
- Una tarea que falla rechaza solo su propia promesa; la cola sigue.
- Disparar eventos del vault dentro del lock está bien (por ejemplo
  `vault.rename`, cuyo listener en `main.ts` llama a `reloadAll`): esa recarga se
  encola después, no se espera dentro.

Test: `test/estructura-lock.test.cjs`, que incluye un caso de control que
demuestra que sin el lock sí se pierden escrituras.

## `reloadAll` vs `reloadEstructura`

`reloadAll` (novel slice) recarga todo el store y además corre
`reconcileCapituloArchivos`, que lee **todas** las notas del vault. Es caro.

- Ediciones de texto de actos o capítulos (outline, resumen, orden, mover de acto)
  usan `reloadEstructura` (outline slice), que solo relee actos y capítulos.
- Solo un cambio que toca archivos de manuscrito justifica `reloadAll`; hoy
  `updateCapitulo` lo usa únicamente cuando el patch trae `nombre`.
- Los archivos movidos o renombrados a mano ya los cubre el listener de `rename`
  en `main.ts`.

## Auto-guardado con debounce en `outlineRoot.tsx`

Los textareas del outline (outline del capítulo y resumen del acto) son
controlados por un borrador local y guardan 600 ms después de la última tecla.
Cada guardado recarga el store, y esa recarga vuelve como un `capitulos`/`actos`
nuevo que reescribe los borradores.

- Un id está en `dirtyOutlines` / `dirtyActSummaries` mientras tenga una edición
  sin guardar; el efecto que sincroniza con el store conserva su texto local.
- La protección se quita solo cuando no hay timer pendiente **y**
  `savesInFlight[id] === 0`. Antes se quitaba al terminar cualquier guardado, y
  uno viejo que terminaba tarde revertía el textarea a texto anterior con el
  cursor saltando al final.
- `scheduleSave(id, dirty, persist)` concentra ese patrón; un campo nuevo con
  auto-guardado debería reutilizarlo en vez de copiar la lógica.
- Un guardado que falla muestra un `Notice`; no se traga el error.
