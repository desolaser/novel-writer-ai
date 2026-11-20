# Documentación de NovelWriter AI

`CLAUDE.md` solo resume la arquitectura. Los detalles de cada módulo están aquí.

## Cómo se usa esta carpeta

- **Antes de tocar un módulo**, leer su archivo.
- **Después de cambiarlo**, actualizar ese archivo en el mismo cambio y agregar una
  entrada en [changelog.md](changelog.md). Un cambio sin documentar está incompleto.
- Un archivo por módulo. Si aparece un módulo nuevo, crear su archivo y sumarlo a la
  tabla de abajo.
- Todo atajo nuevo (teclado, mouse, comando de Obsidian) va en [hotkeys.md](hotkeys.md).
- Se escribe para quien va a modificar el código: qué hace, dónde está, por qué es así
  y qué no hay que romper.

## Módulos

| Archivo | Módulo | Código principal |
|---|---|---|
| [storage.md](storage.md) | Carpeta de la novela, repos, locks, store de Zustand | `src/infrastructure/storage`, `src/ui/react/store` |
| [outline.md](outline.md) | Outline View: actos, capítulos, auto-guardado, generación | `src/ui/react/outline`, `src/ui/react/outlineRoot.tsx` |
| [codex.md](codex.md) | Codex: panel, vista de entrada, IA de entradas, resaltado en el editor | `src/ui/react/features/codex`, `src/ui/views/CodexEntryView.ts`, `src/ui/editor` |
| [chat.md](chat.md) | Chat: sesión, loop del agente, aprobaciones, persistencia | `src/ui/react/features/chat` |
| [chat-tools.md](chat-tools.md) | Tools del chat: protocolo, catálogo, cómo agregar una | `src/tools`, `src/context/toolPrompt.ts` |
| [editor.md](editor.md) | Autocompletado, memoria y nota del autor, acciones del editor | `main.ts`, `src/context` |
| [models-and-prompts.md](models-and-prompts.md) | Proveedores, perfiles de modelo, propósitos, prompts y plantillas | `src/apis`, `src/infrastructure/settings`, `src/context/promptTemplates.ts` |
| [novels.md](novels.md) | Gestión de novelas, Novel Setup (blueprint), importar lorebook | `src/ui/react/features/sidebar`, `src/ui/react/features/blueprint` |
| [metrics.md](metrics.md) | Pestaña Metrics: estadísticas, ritmo de escritura y mapa de apariciones | `src/utils/novelMetrics.ts`, `src/infrastructure/storage/writingTracker.ts`, `src/ui/react/features/metrics` |
| [export.md](export.md) | Exportar la novela (EPUB, DOCX, HTML, Markdown), por capítulo, copiar para publicar | `src/utils/manuscriptExport`, `src/ui/react/features/export` |
| [continuity.md](continuity.md) | Revisión de continuidad: registro de hechos por capítulo, reporte, `check_continuity` | `src/ui/react/features/continuity`, `src/utils/storyFacts.ts`, `src/context/continuityPrompt.ts` |
| [testing.md](testing.md) | Cómo se escriben y corren los tests | `test/` |
| [hotkeys.md](hotkeys.md) | Todos los atajos: comandos, teclado y mouse | — |
| [changelog.md](changelog.md) | Registro de cambios | — |
