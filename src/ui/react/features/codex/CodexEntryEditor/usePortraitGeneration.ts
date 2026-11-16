import { useState } from 'react';
import { Notice } from 'obsidian';
import type NovelWriterPlugin from '../../../../../../main';
import type { EntradaCodex } from '../../../../../domain';
import { buildPortraitPrompt } from '../../../../../tools/portraitTools';
import { confirmDialog } from '../../../../modals/ConfirmModal';
import { createPortraitToolContext } from '../../chat/tools/createPortraitToolContext';
import { createStoreToolContext } from '../../chat/tools/createStoreToolContext';

export interface PortraitGeneration {
	/** An images model is set in Settings. */
	available: boolean;
	busy: boolean;
	generate: (entry: EntradaCodex) => Promise<void>;
}

/**
 * "Generate portrait" of the entry menu: the same prompt and images model as
 * the chat's generate_portrait tool, started by the author from the entry.
 * The prompt keeps the same privacy rules (no notes, no hidden details).
 */
export function usePortraitGeneration(plugin: NovelWriterPlugin): PortraitGeneration {
	const [busy, setBusy] = useState(false);
	const available = Boolean(plugin.settings.data.imageModelId);

	const generate = async (entry: EntradaCodex) => {
		if (busy) return;
		if (entry.thumbnail) {
			const question = `Replace the image of "${entry.nombre}" with a new portrait?`;
			if (!(await confirmDialog(plugin.app, question))) return;
		}
		setBusy(true);
		new Notice(`Drawing a portrait of "${entry.nombre}"...`);
		try {
			const prompt = await buildPortraitPrompt(entry, '', createStoreToolContext());
			await createPortraitToolContext(plugin).generatePortrait(entry.id_entrada_codex, prompt);
			new Notice(`Portrait of "${entry.nombre}" ready.`);
		} catch (error: any) {
			new Notice(`Could not draw the portrait: ${error?.message ?? String(error)}`);
		} finally {
			setBusy(false);
		}
	};

	return { available, busy, generate };
}
