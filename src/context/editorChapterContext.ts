import type { Capitulo, EntradaCodex } from '../domain';
import { chapterInfoPromptLine } from '../utils/chapterInfo';

/** What this module reads from the novel; `NovelStore` provides it. */
export interface ChapterContextSource {
	activeFolderPath: string | null;
	listCapitulos(): Promise<Capitulo[]>;
	listEntries(): Promise<EntradaCodex[]>;
}

/** Outline and chapter info of the chapter a note belongs to. */
export interface EditorChapterContext {
	outline: string;
	/** "Chapter info: Point of view: ..." or "" when nothing is set. */
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
 * Empty when the note is not a chapter of the active novel.
 */
export async function readEditorChapterContext(
	source: ChapterContextSource,
	notePath: string,
): Promise<EditorChapterContext> {
	const folderPath = source.activeFolderPath;
	if (!folderPath) return EMPTY;
	const chapters = await source.listCapitulos();
	const chapter = chapterOfNote(chapters, folderPath, notePath);
	if (!chapter) return EMPTY;
	const entries = await source.listEntries();
	return {
		outline: chapter.outline?.trim() ?? '',
		chapterInfo: chapterInfoPromptLine(chapter, entries),
	};
}
