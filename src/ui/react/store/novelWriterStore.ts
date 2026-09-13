import { create } from "zustand";
import type { NovelWriterStore } from "./types";
import { createNovelSlice } from "./slices/novelSlice";
import { createCodexSlice } from "./slices/codexSlice";
import { createOutlineSlice } from "./slices/outlineSlice";
import { createDetalleSlice } from "./slices/detalleSlice";
import { createChatSlice } from "./slices/chatSlice";
import { createPromptsSlice } from "./slices/promptsSlice";

export type { NovelWriterStore } from "./types";

/**
 * The plugin's single Zustand store, composed from per-domain slices (novel,
 * codex, outline, detalle, chat, prompts). Every slice sees the whole store
 * through `get`/`set` — e.g. a codex mutation calls `get().reloadAll()`, which
 * lives on the novel slice — so cross-domain calls work exactly as they did
 * before this was split; only the file each piece lives in changed.
 */
export const useNovelWriter = create<NovelWriterStore>()((...a) => ({
	...createNovelSlice(...a),
	...createCodexSlice(...a),
	...createOutlineSlice(...a),
	...createDetalleSlice(...a),
	...createChatSlice(...a),
	...createPromptsSlice(...a),
}));
