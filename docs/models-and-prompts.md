# Modelos, proveedores y prompts

## Proveedores

Cada proveedor es una clase en `src/apis/` que implementa `ApiInterface`
(`src/interfaces/api-interface.ts`) y se crea con `ApiFactory`
(`src/factories/api-factory.ts`). En `src/apis` solo van las APIs.

| Proveedor | Clave en `ApiFactory` | Nota |
|---|---|---|
| OpenRouter | `openrouter` | Soporta generación de imágenes en el chat |
| DeepSeek | `deepseek` | |
| Ollama | `ollama` | |
| OpenCode Zen | `opencodezen` | |
| OpenCode Go | `opencodego` | |
| Anthropic | `anthropic` | API pay as you go |
| Anthropic - Claude Code | `claudecode` | Suscripción Claude Pro. No funciona en mobile |
| NovelAI | `novelai` | Sin API de tools |
| oobabooga text-generation-webui | `ooba` | Sin API de tools |
| llama.cpp | `llamacpp` | |
| OpenAI - Codex CLI | `codex` | Suscripción OpenAI Plus. No funciona en mobile |

Todas las llamadas pasan por `generateCompletion(prompt, model, options)` con un solo
string de prompt. Por eso las tools del chat usan un protocolo de texto (ver
[chat-tools.md](chat-tools.md)).

## Perfiles de modelo y propósitos

Un perfil (`Modelo`) guarda proveedor, nombre del modelo, contexto, límites de output
(`max_output` para escritura, `max_output_chat` para chat), sampling y capacidades
(`supports_vision`, `supports_image_generation`). Se gestionan en Settings
(`ModelRepository`, `ModelModal`).

Cada función elige un perfil por **propósito** (`ModelPurpose`), en
`settings.modelAssignments`:

| Propósito | Lo usan |
|---|---|
| `chat` | El chat (`createChatCompletion`) |
| `writing` | Autocompletado, acciones del editor, borradores de capítulo |
| `utilities` | Nombres de chat, resúmenes, memorias, tareas cortas (`createUtilityCompletion`) |

`getActiveModelConfig(settings, purpose)` resuelve el perfil a proveedor + opciones. Si
el perfil asignado se borró, lanza un error claro.

### Modelo de imágenes

Aparte de los propósitos de texto hay un **Images model** (`settings.imageModelId`),
elegido en Settings junto a los otros. Dibuja los retratos del codex que pide el chat
(`generate_portrait`), así el modelo del chat coordina y otro dibuja.

- Solo ofrece perfiles de OpenRouter marcados 🖌 (`supports_image_generation`): hoy es
  el único proveedor que devuelve imágenes con `modalities: ['image', 'text']`.
- Vacío ("None") no hereda el modelo por defecto, que casi nunca genera imágenes: la
  tool simplemente no se ofrece.
- `getImageModelConfig(settings)` lo resuelve; lanza un error si el perfil se borró o
  ya no puede generar imágenes.

## Prompts y plantillas

Los prompts custom (`CustomPrompt`) son de tipo `chat` o `text` y tienen texto
(instrucciones) y plantilla opcional. Se gestionan en `CustomPromptsModal` y hay uno por
defecto de cada tipo.

La plantilla decide el orden de los bloques (`src/context/promptTemplates.ts`):

- Texto: `{{codex}}`, `{{story_bible}}`, `{{memory}}`, `{{author_note}}`,
  `{{chapter_outline}}`, `{{instructions}}`, `{{manuscript}}` (obligatorio).
- Chat: `{{instructions}}`, `{{story_bible}}`, `{{tools}}`, `{{role_mode}}`,
  `{{impersonate_mode}}`, `{{selected_codex}}`, `{{selected_chapters}}`,
  `{{selected_outlines}}`, `{{selected_notes}}`, `{{selected_folders}}`,
  `{{active_note}}`, `{{conversation}}`, `{{assistant_prefix}}`. Son obligatorios
  `tools`, `role_mode`, `impersonate_mode`, `conversation` y `assistant_prefix`.

`validateTemplate` rechaza una plantilla a la que le falta un bloque obligatorio.

## Settings relacionados

En `src/infrastructure/settings/plugin-settings.ts`. Los que tocan la IA del chat:

| Setting | Por defecto | Para qué |
|---|---|---|
| `toolRoundsBeforePause` | 25 | Rondas de tools antes de pausar el turno |
| `chatAutoApproveWrites` | `false` | Ejecutar escrituras del chat sin preguntar |
| `chatNameGeneration` | `active_model` | Cómo se nombran los chats nuevos |

`SettingsService.load` mezcla lo guardado con los defaults (un nivel de profundidad) y
migra settings viejos. `maxToolRounds` (límite duro de 4) se reemplazó por
`toolRoundsBeforePause` y se borra al cargar.
