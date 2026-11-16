import { TFile, TFolder } from 'obsidian';
import type NovelWriterPlugin from '../../../../../../main';
import type {
	MemoryToolContext,
	PromptMetaLayers,
} from '../../../../../interfaces/tool-context';
import type { PromptMetaKey } from '../../../../../types/PromptMeta';
import {
	PROMPT_META_CONFIG_FILE,
	readFrontmatterValue,
	readInheritedPromptMeta,
	writeFrontmatterValue,
} from '../../../../../context/promptMeta';
import { resolveChapterFile } from '../../../../../infrastructure/storage/repos/EstructuraRepo';
import { useNovelWriter } from '../../../store/novelWriterStore';

/**
 * Adapter for the memory tools. A chapter keeps its memory and author note in
 * the frontmatter of its manuscript; the novel keeps them in `_config.md` at the
 * root of its folder. Both are where the autocomplete already looks for them
 * (see `getPromptMetaCascading`).
 */
export function createMemoryToolContext(plugin: NovelWriterPlugin): MemoryToolContext {
	const app = plugin.app;

	const novelFolder = (): TFolder => {
		const path = plugin.store.activeFolderPath;
		const folder = path ? app.vault.getAbstractFileByPath(path) : null;
		if (!(folder instanceof TFolder)) throw new Error('No novel is open.');
		return folder;
	};

	const configPath = () => `${novelFolder().path}/${PROMPT_META_CONFIG_FILE}`;

	const chapterFile = async (id: string, create: boolean): Promise<TFile | null> => {
		const state = useNovelWriter.getState();
		const folder = novelFolder().path;
		const chapter = state.capitulos.find((item) => item.id_capitulo === id);
		if (!chapter) throw new Error('That chapter no longer exists.');
		const stored = chapter.archivo ?? (create ? await state.ensureCapituloArchivo(id) : null);
		if (!stored) return null;
		return resolveChapterFile(app, folder, id, stored);
	};

	const readLayers = async (file: TFile | null, parent: TFolder | null, key: PromptMetaKey) => {
		const own = file ? await readFrontmatterValue(app, file, key) : null;
		const inherited = await readInheritedPromptMeta(app, plugin.settings.data, parent, key);
		return { own, inherited } as PromptMetaLayers;
	};

	return {
		readPromptMeta: async (chapterId, key) => {
			if (chapterId) {
				const file = await chapterFile(chapterId, false);
				return readLayers(file, file?.parent ?? novelFolder(), key);
			}
			const config = app.vault.getAbstractFileByPath(configPath());
			const file = config instanceof TFile ? config : null;
			return readLayers(file, novelFolder().parent, key);
		},

		writePromptMeta: async (chapterId, key, value) => {
			if (chapterId) {
				const file = await chapterFile(chapterId, true);
				if (!file) throw new Error('Could not create the chapter manuscript.');
				await writeFrontmatterValue(app, file, key, value);
				return;
			}
			const existing = app.vault.getAbstractFileByPath(configPath());
			const file = existing instanceof TFile
				? existing
				: await app.vault.create(configPath(), '');
			await writeFrontmatterValue(app, file, key, value);
		},
	};
}
