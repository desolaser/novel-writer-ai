# Novelas, Novel Setup e importación

## Gestión de novelas

El Companion (`CompanionView`, barra izquierda) tiene arriba el selector de novela
(`NovelSwitcher`) y el menú de gestión (`NovelManagementMenu` en `Sidebar.tsx`):

- **View Novels**: lista de novelas (`NovelListModal`).
- **Edit Novel**: nombre, autor y miniatura (`NovelEditModal`).
- **Novel Setup**: el blueprint de la novela (ver abajo).
- **Delete Novel**: con opción de borrar también la carpeta (`NovelDeleteModal`).

### Crear una novela

Comando "Create new novel" (también "+ Create new novel" en el selector). El diálogo
(`promptNovel` en `main.ts`) pide nombre, autor y miniatura, y si hay otras novelas
muestra **Codex structure**:

- "Default categories only" (por defecto): solo las 6 categorías por defecto.
- "Copy from <novela>": copia además sus categorías custom y sus detalles
  personalizados, con opciones y categorías. No copia entradas.

La elección se recuerda en `settings.newNovelCodexSourceId` y se propone la próxima
vez; si esa novela ya no existe, vuelve a "Default categories only". La copia la hace
`NovelStore.create` con `copyCodexSchema` (ver
[codex.md](codex.md#categorías-y-detalles-entre-novelas)).

La novela activa se guarda en `settings.lastActiveNovelId` cada vez que cambia
(`setActiveNovel`) y se restaura al cargar. Si esa novela ya no existe, se abre la de
`updated_at` más reciente (`resolveStartupNovelId` en `src/utils/startupNovel.ts`). Ver
[storage.md](storage.md) para la carpeta de cada novela y la inicialización del store.

Al cargar el plugin se abren el Companion a la izquierda y el Outline a la derecha
(`openWorkingViews`), quitando duplicados que haya restaurado Obsidian.

## Novel Setup (blueprint)

`src/ui/react/features/blueprint/`. Guarda en `escritura/blueprint.json` la premisa,
estilo, tiempo verbal, idioma, estructura narrativa y número de capítulos.

- La estructura parte de una plantilla (`src/constants/structures.ts`) y se reparte en
  actos y capítulos; se edita como Markdown (`src/utils/structureMarkdown.ts`).
- Cambiar plantilla o número de capítulos rehace la estructura solo si no se editó a
  mano; "Rebuild" la rehace pidiendo confirmación.
- La IA puede completar campos y generar el outline por acto
  (`src/context/blueprintPrompt.ts`).
- Aplicar el blueprint reescribe actos y capítulos (`replaceEstructura`).
- El "story bible" que usan el autocompletado y el chat sale de este blueprint
  (`buildStoryBibleBlock`).

## Importar un lorebook

Comando "Import legacy lorebook": elige una carpeta con notas Markdown, propone una
categoría por subcarpeta (las notas sueltas van a "Others") y muestra una revisión
(`LorebookImportReviewModal`) donde se pueden mover entradas entre grupos antes de
importar (`src/utils/lorebookImport.ts`).
