import { CustomPromptRepository } from "../../../../infrastructure/settings/custom-prompt-repository";
import type { PromptsSlice, SliceCreator } from "../types";

export const createPromptsSlice: SliceCreator<PromptsSlice> = (_set, get) => ({
	getCustomPrompts: () => {
		const s = get().settings;
		return s ? new CustomPromptRepository(s).list() : [];
	},
	getDefaultChatPrompt: () => {
		const s = get().settings;
		return s ? new CustomPromptRepository(s).getDefault('chat') : undefined;
	},
	getDefaultTextPrompt: () => {
		const s = get().settings;
		return s ? new CustomPromptRepository(s).getDefault('text') : undefined;
	},
	createCustomPrompt: async (tipo, nombre, texto) => {
		const s = get().settings;
		if (!s) throw new Error('Settings not bound');
		return new CustomPromptRepository(s).create(tipo, nombre, texto);
	},
	updateCustomPrompt: async (id, patch) => {
		const s = get().settings;
		if (!s) return;
		await new CustomPromptRepository(s).update(id, patch);
	},
	deleteCustomPrompt: async (id) => {
		const s = get().settings;
		if (!s) return false;
		return new CustomPromptRepository(s).remove(id);
	},
	setDefaultPrompt: async (tipo, id) => {
		const s = get().settings;
		if (!s) return;
		await new CustomPromptRepository(s).setDefault(tipo, id);
	},
});
