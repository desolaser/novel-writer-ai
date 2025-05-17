# Novel Writer AI

Novel Writer AI is an Obsidian plugin that brings advanced AI-assisted writing and worldbuilding tools directly into your notes. Generate story continuations, create lorebook entries, and integrate context-aware AI completions using your favorite LLM providers (OpenRouter, DeepSeek, Claude, and more).

---

## ✨ Features

- **AI Text Generation:** Continue your stories or notes using AI, with context-aware completions.
- **Lorebook System:** Automatically include relevant lorebook entries in your prompts based on keywords in your current context.
- **Lorebook Entry Generator:** Generate new lorebook entries from your notes, including YAML frontmatter with extracted keys.
- **Multi-Provider Support:** Easily switch between different AI providers and models.
- **Streaming Support:** Optionally stream AI completions into your notes as they are generated.
- **Customizable Prompts:** Adjust prompt prefix and lorebook generation instructions in plugin settings.
- **Context Filtering:** Only relevant lorebook entries (by keyword) are included in the prompt, keeping context concise.

---

## 🚀 Getting Started

### 1. Installation

- Download or clone this repository into your `.obsidian/plugins` folder.
- Enable the plugin in Obsidian's settings.

### 2. Configuration

- Open the plugin settings tab.
- Select your preferred API provider and enter your API token.
- Choose your default model and adjust options like streaming, prompt prefix, and lorebook folder.

---

## 📝 Usage

### Generate Text

- Right-click in the editor or use the command palette to select **"Generate text"**.
- The plugin will use the current note, relevant lorebook entries, and your prompt settings to generate a continuation.

### Generate Lorebook Entry

- Write a description or concept in a note.
- Use the command palette or editor menu to select **"Generate Lorebook Entry from Note"**.
- Or use Right-click in the editor or use the command palette to select **"Generate lorebook entry"**.
- The plugin will send your note (and related lore) to the AI, and replace the note with a properly formatted lorebook entry (including YAML frontmatter with keys).

### Lorebook System

- Store your lorebook entries as markdown files in the folder specified in settings (default: `Lorebook/`).
- Each entry should start with YAML frontmatter, e.g.:
  ```yaml
  ---
  keys: # if dragon or prophecy is in the last 1000 characters of your context, this goes into the prompt
    - dragon
    - prophecy
  enabled: false # false if you don't want this to be shown in your prompt
  alwaysOn: true # if you want an entry to always be in the prompt, you can use this option
  ---
  # Dragon Prophecy
  The ancient prophecy speaks of...