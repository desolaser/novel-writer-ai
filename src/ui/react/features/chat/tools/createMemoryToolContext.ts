import { TFile, TFolder } from 'obsidian';
import type NovelWriterPlugin from '../../../../../../main';
import type {
	MemoryToolContext,
	PromptMetaLayers,
} from '../../../../../interfaces/tool-context';
import type { PromptMetaKey } from '../../../../../types/PromptMeta';
import {
	readFrontmatterValue,
	readInheritedPromptMeta,
	writeFrontmatterValue,
} from '../../../../../context/promptMeta';
import { resolveChapterFile } from '../../../../../infrastructure/storage/repos/EstructuraRepo';
import {
	readNovelPromptMeta,
	writeNovelPromptMeta,
} from '../../../../../infrastructure/storage/repos/NovelConfigRepo';
import { useNovelWriter } from '../../../store/novelWriterStore';

/**
 * Adapter for the memory tools. A chapter keeps its memory and author note in
 * the frontmatter of its manuscript; the novel keeps them in its `__config.json`.
 * Both are where the autocomplete looks for them (see `getPromptMetaCascading`).
 */
export function createMemoryToolContext(plugin: NovelWriterPlugin): MemoryToolContext {
	const app = plugin.app;

	const novelFolder = (): TFolder => {
		const path = plugin.store.activeFolderPath;
		const folder = path ? app.vault.getAbstractFileByPath(path) : null;
		if (!(folder instanceof TFolder)) throw new Error('No novel is open.');
		return folder;
	};

	const chapterFile = async (id: string, create: boolean): Promise<TFile | null> => {
		const state = useNovelWriter.getState();
		const folder = novelFolder().path;
		const chapter = state.capitulos.find((item) => item.id_capitulo === id);
		if (!chapter) throw new Error('That chapter no longer exists.');
		const stored = chapter.archivo ?? (create ? await state.ensureCapituloArchivo(id) : null);
		if (!stored) return null;
		return resolveChapterFile(app, folder, id, stored);
	};

	const inheritedFrom = (folder: TFolder | null, key: PromptMetaKey) =>
		readInheritedPromptMeta(app, plugin.settings.data, folder, key);

	return {
		readPromptMeta: async (chapterId, key): Promise<PromptMetaLayers> => {
			if (chapterId) {
				const file = await chapterFile(chapterId, false);
				const own = file ? await readFrontmatterValue(app, file, key) : null;
				return { own, inherited: await inheritedFrom(file?.parent ?? novelFolder(), key) };
			}
			const folder = novelFolder();
			return {
				own: await readNovelPromptMeta(app, folder.path, key),
				inherited: await inheritedFrom(folder.parent, key),
			};
		},

		writePromptMeta: async (chapterId, key, value) => {
			if (!chapterId) {
				await writeNovelPromptMeta(app, novelFolder().path, key, value);
				return;
			}
			const file = await chapterFile(chapterId, true);
			if (!file) throw new Error('Could not create the chapter manuscript.');
			await writeFrontmatterValue(app, file, key, value);
		},
	};
}
