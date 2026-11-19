# NovelWriter AI
Es un plugin de Obsidian para escribir novelas con IA.

## Stack
- Javascript sobre Typescript
- React para front.
- Zustand para manejo de estados.

## Documentación
Este archivo solo resume la arquitectura. El detalle de cada módulo está en
[docs/](docs/README.md).

- Antes de tocar un módulo, leer su archivo en `docs/`.
- Todo cambio actualiza el archivo de su módulo y agrega una entrada en
  [docs/changelog.md](docs/changelog.md), en el mismo cambio. Un módulo nuevo lleva su
  propio archivo, sumado al índice de `docs/README.md`.
- Todo atajo nuevo (comando, tecla, clic) va en [docs/hotkeys.md](docs/hotkeys.md).

## Arquitectura

### Vistas
| Vista | Dónde | Doc |
|---|---|---|
| Companion (`CompanionView`) | Barra izquierda: selector de novela y pestañas Codex, Config, Chats y Metrics | [codex](docs/codex.md), [chat](docs/chat.md), [editor](docs/editor.md), [metrics](docs/metrics.md) |
| Outline (`OutlineView`) | Barra derecha: actos, capítulos, outlines y generación con IA | [outline](docs/outline.md) |
| Entrada del codex (`CodexEntryView`) | Área principal, una pestaña por entrada, se abren como notas | [codex](docs/codex.md) |
| Editor de Markdown | Autocompletado, acciones de IA y resaltado de entradas del codex | [editor](docs/editor.md) |
| Export (`ExportModal`, `PublishChapterModal`) | Modales: compilar la novela, copiar un capítulo para publicar | [export](docs/export.md) |

Cada vista es un `ItemView` que monta React. Todas llaman a `initializeStore`, que corre
una sola vez por instancia del plugin.

### Capas
- **Dominio** (`src/domain`, `src/types`): entidades y tipos.
- **Contratos** (`src/interfaces`): lo que una capa necesita de otra (`ApiInterface`,
  `ToolContext`, `ChatPersistence`).
- **Infraestructura** (`src/infrastructure`): settings y storage. Los datos de cada novela
  son archivos JSON y Markdown dentro de su carpeta del vault. `NovelStore` es la fachada
  sobre los repos. Ver [storage](docs/storage.md).
- **IA** (`src/apis`, `src/factories`, `src/context`): 11 proveedores detrás de
  `generateCompletion(prompt, model, options)` con un solo string de prompt; perfiles de
  modelo por propósito (`chat`, `writing`, `utilities`); armado de prompts y plantillas.
  Ver [models-and-prompts](docs/models-and-prompts.md).
- **Tools del chat** (`src/tools`): protocolo de texto `[[tool: ...]]`, dependen solo de
  `ToolContext`. Ver [chat-tools](docs/chat-tools.md).
- **UI** (`src/ui`): vistas, modales y React. Un store de Zustand con slices por dominio.
  La lógica que no es de UI (como el loop del chat) vive fuera de los componentes.

### Reglas que no se rompen
- `estructura.json` solo se toca dentro de `withEstructuraLock`; los archivos de chat
  dentro de `withFileLock`. Ver [storage](docs/storage.md).
- Las tools de escritura del chat esperan la aprobación del autor, salvo que él active
  Auto-approve. Las destructivas (`alwaysAsk`, como `delete_chapter`) preguntan
  siempre. Ver [chat-tools](docs/chat-tools.md).
- Las notas privadas de una entrada del codex (`EntradaCodex.notas`) nunca llegan a la IA.
  Tampoco las entradas con política "Never" ni los detalles con `incluir_ia` apagado
  (en las tools, vía `src/tools/codexShared.ts`).
- Campos con auto-guardado: `AutoSaveTextarea`. Ver [outline](docs/outline.md).

## Convenciones

Aplicar estos estándares.

1. Principio de responsabilidad única: 
    Una clase debe tener una sola razón para cambiar, lo que implica tener un único propósito o responsabilidad.
    Evitar hacer archivos de .tsx muy grandes y separar componentes en archivos distintos.

2. Principio de sustitución de Liskov: 
    Los objetos de una clase base deben ser reemplazables por instancias de sus subclases sin alterar
    el correcto funcionamiento del programa.

3. Principio de Segregación de Interfaces (ISP): Los clientes no deben verse forzados a depender de interfaces que no utilizan; es mejor tener muchas interfaces específicas que una general

4. Principio de Inversión de la Dependencia (DIP): Los módulos de alto nivel no deben depender de módulos de bajo nivel, sino ambos deben depender de abstracciones

5. Lenguaje Ingles: Si bien el modelo y algunas funciones pueden estar en español, por favor hacer todo en inglés de ahora en adelante. Igual el texto de las opciones y configuraciones.

6. Evitar one-liners: Escribir el código identado correctamente y evitar one-liners muy largos de más de 80 letras de largo.
Mal: 
  
	try { return await action(client); }
	finally { await client.close(); try { fs.rmSync(cwd, { recursive: true, force: true }); } catch (_error) {} }

Bien:
  
	try { 
    return await action(client); 
  }
	finally { 
    await client.close(); 
    try { 
      fs.rmSync(cwd, { recursive: true, force: true }); 
    } 
    catch (_error) {} 
  }

7. Nada de diálogos nativos: nunca `confirm()`, `alert()` ni `prompt()`. En Electron dejan
   todos los inputs sin recibir teclas hasta que la ventana pierde y recupera el foco
   (el autor lo ve como "se bloqueó la escritura"). Para preguntar usar
   `await confirmDialog(app, mensaje)` de `src/ui/modals/ConfirmModal.ts`; para avisar,
   `new Notice(...)`.

8. Tests: van en `test/` (`*.test.cjs`) y se corren con `npm test`. Ver
   [docs/testing.md](docs/testing.md).

## Carpetas
docs => Documentación por módulo, changelog y atajos. Ver la sección "Documentación".
src/apis => Aqui solo van las API's nada más. No poner utils, ni types, ni nada raro.
src/constants => Aquí constantes globales.
src/context => Helpers para contexto.
src/domain => Codigo del Dominio, entidades y tipos, etc...
src/factories => Factories para clases.
src/infrastructure => Base del plugin, tiene el storage y settings.
src/interfaces => Interfaces y contratos.
src/tools => Tools que la IA del chat puede llamar. Dependen del contrato ToolContext, nunca del store de React.
src/types => Tipos globales. Hay que mover aqui lo de src/domain/types. Una IA sin mucho criterio hizo duplicados.
src/ui => Interfaz gráfica, componentes React.
src/utils => Útiles varios.
test => Todos los tests (`*.test.cjs`), en la raíz del repo, nunca dentro de src. Se corren con `npm test`.

No crear nuevas carpetas y al crear nuevos archivos NO PONER EN LUGARES INDEBIDOS.

Seguir las convenciones, preguntar si crees que algún archivo no cabe dentro de estas definiciones
y quizás ahi se puede hacer una carpeta nueva.

Está permitido crear subcarpetas dentro de las mencionadas, pero con criterio.
