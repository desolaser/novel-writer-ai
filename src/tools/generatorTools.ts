import type { OutlineSource, ToolContext } from '../interfaces/tool-context';
import { countWords, resolveChapter } from './chapterTools';
import { resolveAct } from './structureTools';

/**
 * The outline's generators as chat tools. They spend the utilities or writing
 * model, not the chat's, and the text they produce never goes through the
 * chat's context: the model gets a short report and reads more if it needs.
 */

const PREVIEW_LENGTH = 400;

function preview(text: string): string {
	const clean = text.trim();
	if (clean.length <= PREVIEW_LENGTH) return clean;
	return `${clean.slice(0, PREVIEW_LENGTH).trimEnd()}...`;
}

export async function generateOutlineTool(
	args: Record<string, string>,
	context: ToolContext,
): Promise<string> {
	const chapter = resolveChapter(args.chapter ?? '', context);
	const source = ((args.source ?? '').trim().toLowerCase() || 'manuscript') as OutlineSource;
	if (source !== 'manuscript' && source !== 'story_so_far') {
		throw new Error('Argument "source" must be manuscript or story_so_far.');
	}
	const outline = await context.generateOutline(chapter.id_capitulo, source);
	if (outline === null) {
		throw new Error(`"${chapter.nombre}" has no text to outline. `
			+ 'Use source story_so_far to outline it from the previous chapters.');
	}
	return `Wrote the outline of "${chapter.nombre}":\n${outline}`;
}

export async function summarizeActTool(
	args: Record<string, string>,
	context: ToolContext,
): Promise<string> {
	const act = resolveAct(args.act ?? '', context);
	const summary = await context.summarizeAct(act.id_acto);
	return `Wrote the summary of "${act.nombre}":\n${summary}`;
}

/** The model's explicit length, or null to use the Story Bible's range. */
function requestedWords(value: string | undefined): number | null {
	if (!value?.trim()) return null;
	const words = Number(value.replace(/[^\d]/g, ''));
	if (!Number.isInteger(words) || words < 100) {
		throw new Error('Argument "words" must be a number of words, 100 or more.');
	}
	return words;
}

export async function draftChapterTool(
	args: Record<string, string>,
	context: ToolContext,
): Promise<string> {
	const chapter = resolveChapter(args.chapter ?? '', context);
	if (!chapter.outline?.trim() && !chapter.scenes?.length) {
		throw new Error(`"${chapter.nombre}" has no outline to draft from. `
			+ 'Write one first with write_outline or generate_outline.');
	}
	const existing = countWords(await context.readChapterText(chapter.id_capitulo));
	const overwrite = (args.overwrite ?? '').trim().toLowerCase() === 'yes';
	if (existing && !overwrite) {
		throw new Error(`"${chapter.nombre}" already has ${existing} words. `
			+ 'Ask the author, and call again with overwrite yes to replace them.');
	}
	const { text, length } = await context.draftChapter(
		chapter.id_capitulo,
		requestedWords(args.words),
	);
	return `Drafted "${chapter.nombre}": ${countWords(text)} words `
		+ `(accepted range ${length.min}-${length.max}). `
		+ `It starts:\n${preview(text)}\nRead it with read_chapter before judging it.`;
}

export async function refreshStoryContextTool(
	args: Record<string, string>,
	context: ToolContext,
): Promise<string> {
	if (!args.chapter?.trim()) {
		const count = await context.refreshStoryContext(null);
		return `Rebuilt the story so far in the memory of ${count} chapters.`;
	}
	const chapter = resolveChapter(args.chapter, context);
	await context.refreshStoryContext(chapter.id_capitulo);
	return `Rebuilt the story so far in the memory of "${chapter.nombre}".`;
}
