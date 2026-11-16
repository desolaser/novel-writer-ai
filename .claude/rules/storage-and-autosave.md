---
paths:
  - "src/infrastructure/storage/**"
  - "src/ui/react/store/**"
  - "src/ui/react/outline/**"
  - "src/ui/react/outlineRoot.tsx"
  - "src/ui/react/components/AutoSaveTextarea.tsx"
---

# Persistencia y auto-guardado

Antes de cambiar estos archivos, leer:

- [docs/storage.md](../../docs/storage.md): carpeta de la novela, `withEstructuraLock`,
  `withFileLock`, `reloadAll` vs `reloadEstructura`, inicialización del store.
- [docs/outline.md](../../docs/outline.md): `AutoSaveTextarea`, suscripción del outline
  al store, tipos de arrastre.

Al terminar, actualizar esos documentos y `docs/changelog.md`.
