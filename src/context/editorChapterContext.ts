import type { Capitulo, EntradaCodex } from '../domain';
import { chapterInfoPromptLine } from '../utils/chapterInfo';
import { sceneIndexAt } from '../utils/sceneSections';
import { sceneEditorBlock } from './scenePrompt';

/** What this module reads from the novel; `NovelStore` provides it. */
export interface ChapterContextSource {
	activeFolderPath: string | null;
	listCapitulos(): Promise<Capitulo[]>;
	listEntries(): Promise<EntradaCodex[]>;
}

/** Outline and chapter info of the chapter a note belongs to. */
export interface EditorChapterContext {
	outline: string;
	/**
	 * "Chapter info: Point of view: ..." and, when the chapter has scenes, the
	 * scene plan and the scene the cursor is in. "" when nothing is set.
	 */
	chapterInfo: string;
}

const EMPTY: EditorChapterContext = { outline: '', chapterInfo: '' };

function chapterOfNote(
	chapters: Capitulo[],
	folderPath: string,
	notePath: string,
): Capitulo | undefined {
	return chapters.find((chapter) => {
		if (!chapter.archivo) return false;
		const path = chapter.archivo.startsWith('escritura/')
			? `${folderPath}/${chapter.archivo}`
			: chapter.archivo;
		return path === notePath;
	});
}

/**
 * Chapter context for "Generate text" and its "View context": the outline and
 * the point of view, setting and story time of the chapter the note is.
 * With `textBeforeCursor`, a chapter with scenes adds the scene the cursor is
 * in (counted by the scene breaks before it). Empty when the note is not a
 * chapter of the active novel.
 */
export async function readEditorChapterContext(
	source: ChapterContextSource,
	notePath: string,
	textBeforeCursor?: string,
): Promise<EditorChapterContext> {
	const folderPath = source.activeFolderPath;
	if (!folderPath) return EMPTY;
	const chapters = await source.listCapitulos();
	const chapter = chapterOfNote(chapters, folderPath, notePath);
	if (!chapter) return EMPTY;
	const entries = await source.listEntries();
	const scene = textBeforeCursor === undefined
		? ''
		: sceneEditorBlock(chapter, sceneIndexAt(textBeforeCursor), entries);
	return {
		outline: chapter.outline?.trim() ?? '',
		chapterInfo: [chapterInfoPromptLine(chapter, entries), scene]
			.filter(Boolean)
			.join('\n'),
	};
}
