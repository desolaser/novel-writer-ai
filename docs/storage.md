# Storage y estado

Cómo se guardan los datos de una novela en el vault y cómo llegan a la interfaz.

## Carpeta de una novela

Cada novela es una carpeta del vault. Todo se guarda como archivos normales, así que
Obsidian Sync, Git o Remotely Save los sincronizan sin hacer nada especial.

| Ruta (relativa a la carpeta) | Contenido | Repo |
|---|---|---|
| `__metadata.json` | Metadata de la novela (`Novela`) | `NovelRepo.ts` |
| `__config.json` | Overrides de configuración de la novela | `NovelRepo.ts` |
| `escritura/estructura.json` | Actos y capítulos (outline, resumen, orden, archivo) | `EstructuraRepo.ts`, `chapterFiles.ts` |
| `escritura/capitulos/*.md` | Manuscritos de los capítulos | `chapterFiles.ts` |
| `escritura/blueprint.json` | Novel Setup (premisa, estilo, estructura) | `BlueprintRepo.ts` |
| `codex/entradas/entrada_<id>.json` | Una entrada del codex por archivo | `CodexEntryRepo.ts` |
| `codex/categorias.json` | Categorías (las 6 por defecto y las custom) | `CategoriaRepo.ts` |
| `codex/detalles.json` | Campos personalizados (detalles), sus opciones y sus categorías | `DetalleRepo.ts` |
| `chats/chat_<id>.json` | Un chat con todos sus mensajes y su contexto | `ChatRepo.ts` |
| `images/` | Imágenes de la novela | — |

`NovelStore` (`src/infrastructure/storage/store.ts`) es la fachada: guarda la novela
activa (`activeNovelId`, `activeFolderPath`) y delega en los repos. Los repos reciben
siempre `app` y la carpeta; no guardan estado.

`CodexSchemaRepo.ts` es el único repo que trabaja con dos novelas a la vez: copia
`categorias.json` y `detalles.json` de una carpeta a otra (ver
[codex.md](codex.md#categorías-y-detalles-entre-novelas)). Lee los dos archivos del
destino, fusiona en memoria y los reescribe enteros. Estos archivos no usan lock.

## Escrituras concurrentes: los locks

Los archivos que se leen enteros, se modifican y se reescriben pierden datos si dos
escrituras se cruzan: la segunda pisa a la primera. Hay dos colas:

### `withEstructuraLock` (estructura.json)

`src/infrastructure/storage/repos/estructuraStorage.ts`. Una cola por novela.

- `readEstructuraFile` / `writeEstructuraFile` son de bajo nivel: solo se llaman
  **dentro** de una tarea del lock. Toda operación nueva sobre la estructura va en
  `EstructuraRepo.ts` o `chapterFiles.ts` envuelta en `withEstructuraLock`.
- Las lecturas también pasan por el lock (`listActos`, `listCapitulos`,
  `readEstructuraLocked`) para no leer el archivo a medio escribir.
- **Nunca** llamar desde dentro de una tarea a otra función que también tome el lock de
  la misma novela: se queda esperándose a sí misma. Por eso `updateCapitulo` usa el
  helper privado `renameChapterFile` y no otra función pública del repo.
- Lo lento va **fuera** del lock. El patrón es: escanear el vault primero, entrar al
  lock, releer la estructura y aplicar. Ver `reconcileCapituloArchivos`
  (`scanLinkedChapterNotes` fuera) y `ensureCapituloArchivo` (dentro vuelve a comprobar
  si otra llamada ya creó el archivo).
- Una tarea que falla rechaza solo su propia promesa; la cola sigue.
- Disparar eventos del vault dentro del lock está bien (por ejemplo `vault.rename`,
  cuyo listener en `main.ts` llama a `reloadAll`): esa recarga se encola después.

Test: `test/estructura-lock.test.cjs`.

### `withFileLock` (archivos de chat)

`src/infrastructure/storage/fileLock.ts`. Una cola por ruta de archivo. `ChatRepo.ts`
hace todo cambio dentro de `updateChatFile`, que lee, aplica el cambio y escribe dentro
del lock. Sin eso, renombrar un chat mientras se guardaba la respuesta perdía la
respuesta.

- `readChat` también pasa por el lock.
- Dentro de `updateChatFile` no se llama a otra función pública del repo (se trabaría).
- `patchMensaje` cambia solo los campos que recibe (`mensaje`, `imagenes`,
  `toolCalls`); el resto del mensaje queda igual.

Test: `test/chat-repo-lock.test.cjs`, con caso de control.

Las entradas del codex (un archivo cada una) todavía no usan lock. Si aparece un caso
de dos escrituras simultáneas a la misma entrada, usar `withFileLock` igual que el chat.

## Store de Zustand

`src/ui/react/store/novelWriterStore.ts` compone un solo store con slices por dominio
(`novelSlice`, `codexSlice`, `outlineSlice`, `detalleSlice`, `chatSlice`,
`promptsSlice`). Cada slice ve el store completo con `get`/`set`.

- **Suscribirse con selector.** Un componente que hace `useNovelWriter()` sin selector se
  re-renderiza con cualquier cambio de cualquier slice. Para vistas grandes usar
  `useNovelWriter(useShallow(state => ({ ... })))` con solo lo que dibujan (ver
  `outlineRoot.tsx`).
- `reloadAll` (novel slice) recarga todo y además corre `reconcileCapituloArchivos`,
  que lee **todas** las notas del vault. Es caro.
- `reloadEstructura` (outline slice) solo relee actos y capítulos. Es lo que usan las
  ediciones de texto de actos y capítulos (outline, resumen, orden, mover de acto).
  `updateCapitulo` usa `reloadAll` solo cuando el patch trae `nombre`, porque renombra el
  manuscrito.
- Los archivos movidos o renombrados a mano los cubre el listener de `rename` en
  `main.ts`.

## Inicialización y novela activa

`initializeStore(plugin)` (`src/ui/views/CompanionView.ts`) la llaman todas las vistas
al abrirse (Companion, Outline, entradas del Codex). Corre **una sola vez por instancia
del plugin** y las demás llamadas reciben la misma promesa. Antes cada vista la volvía a
correr, y eso reseteaba el chat activo y recargaba todo mientras el autor trabajaba.

- `setActiveNovel(id)` solo resetea el chat activo si la novela realmente cambia. Al
  cambiar, restaura el chat que estaba abierto en esa novela.
- El chat abierto se recuerda por novela en `settings.uiPrefs.activeChatIds`
  (`selectChat` lo guarda).
- `reloadAll` limpia `activeChatId` si ese chat ya no existe.
- La novela inicial sale de `resolveStartupNovelId`: la guardada en
  `settings.lastActiveNovelId` si sigue existiendo, si no la de `updated_at` más
  reciente. `main.ts` (`onload`) y `initializeStore` usan la misma función.
- `setActiveNovel` guarda `lastActiveNovelId` en cada cambio de novela.
- `NovelStore.setActive` devuelve `false` si la novela no existe y deja la anterior
  activa; `setActiveNovel` hace lo mismo con el estado de React.
