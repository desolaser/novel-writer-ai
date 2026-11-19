import type { Capitulo, ChapterInfo } from '../domain';
import type {
	ChapterToolContext as ToolContext,
	CodexToolContext,
} from '../interfaces/tool-context';
import { resolveByName } from '../utils/toolCallParsing';
import { chapterInfoFacts } from '../utils/chapterInfo';
import { visibleEntries } from './codexShared';

/**
 * Chapter tools: listing, reading and writing manuscripts. Every function returns
 * the text handed back to the model, and throws when the model asked for something
 * that cannot be resolved — the executor turns that into an error result the model
 * can react to on the next turn.
 */

export const countWords = (text: string) => (text.trim() ? text.trim().split(/\s+/).length : 0);

/** "status: Drafted | Point of view: Elena" or "" when nothing is set. */
export function describeChapterInfo(
	info: ChapterInfo,
	context: CodexToolContext,
): string {
	return chapterInfoFacts(info, visibleEntries(context), {
		forAi: true,
		includeStatus: true,
	})
		.map((fact) => `${fact.label.toLowerCase()}: ${fact.value}`)
		.join(' | ');
}

/** Chapters in reading order: by act order first, then by their own order. */
export function orderedChapters(context: ToolContext): Capitulo[] {
	const actOrder = new Map(context.listActs().map((act) => [act.id_acto, act.orden]));
	return [...context.listChapters()].sort((a, b) =>
		(actOrder.get(a.id_acto) ?? 0) - (actOrder.get(b.id_acto) ?? 0) || a.orden - b.orden);
}

/** Resolves the `chapter` argument, which may be a name, a partial name or "#3". */
export function resolveChapter(reference: string, context: ToolContext): Capitulo {
	const chapters = orderedChapters(context);
	const chapter = resolveByName(reference, chapters, (item) => item.nombre, (item) => item.id_capitulo);
	if (!chapter) {
		const known = chapters.map((item, index) => `#${index + 1} ${item.nombre}`).join(', ');
		throw new Error(`No chapter matches "${reference}". Available: ${known || '(none)'}.`);
	}
	return chapter;
}

export async function listChapters(
	_args: Record<string, string>,
	context: ToolContext & CodexToolContext,
): Promise<string> {
	const chapters = orderedChapters(context);
	if (!chapters.length) return 'The novel has no chapters yet.';
	const acts = context.listActs();
	const lines = await Promise.all(chapters.map(async (chapter, index) => {
		const act = acts.find((item) => item.id_acto === chapter.id_acto)?.nombre ?? 'no act';
		const text = await context.readChapterText(chapter.id_capitulo);
		const outline = chapter.outline?.trim() ? 'outline: yes' : 'outline: no';
		const base = `#${index + 1} ${chapter.nombre} | act: ${act} | ${outline}`
			+ ` | ${countWords(text)} words`;
		const info = describeChapterInfo(chapter, context);
		return info ? `${base} | ${info}` : base;
	}));
	return lines.join('\n');
}

/** Paragraphs are separated by blank lines, the way Markdown reads them. */
export function splitParagraphs(text: string): string[] {
	return text
		.split(/\n\s*\n/)
		.map((paragraph) => paragraph.trim())
		.filter(Boolean);
}

function parseParagraphNumber(value: string | undefined, name: string): number | null {
	if (!value?.trim()) return null;
	const number = Number(value.trim().replace(/^#/, ''));
	if (!Number.isInteger(number) || number < 1) {
		throw new Error(`Argument "${name}" must be a paragraph number starting at 1.`);
	}
	return number;
}

/**
 * Reads a whole chapter, or only paragraphs `from`..`to`. A long chapter read
 * whole is cut down in later rounds of the same turn, so reading the part to
 * edit keeps it intact in the conversation.
 */
export async function readChapter(args: Record<string, string>, context: ToolContext): Promise<string> {
	const chapter = resolveChapter(args.chapter ?? '', context);
	const text = await context.readChapterText(chapter.id_capitulo);
	if (!text.trim()) return `Chapter "${chapter.nombre}" has no text yet.`;

	const paragraphs = splitParagraphs(text);
	const from = parseParagraphNumber(args.from, 'from');
	const to = parseParagraphNumber(args.to, 'to');
	if (from === null && to === null) {
		return `Chapter "${chapter.nombre}" (${paragraphs.length} paragraphs):\n\n${text}`;
	}

	const start = Math.min(from ?? 1, paragraphs.length);
	const end = Math.min(Math.max(to ?? paragraphs.length, start), paragraphs.length);
	const slice = paragraphs.slice(start - 1, end).join('\n\n');
	const range = `paragraphs ${start}-${end} of ${paragraphs.length}`;
	return `Chapter "${chapter.nombre}", ${range}:\n\n${slice}`;
}

export async function createChapter(args: Record<string, string>, context: ToolContext): Promise<string> {
	const name = (args.name ?? '').trim();
	if (!name) throw new Error('Argument "name" is required.');

	const acts = context.listActs();
	let act = args.act?.trim() ? resolveByName(args.act, acts, (item) => item.nombre, (item) => item.id_acto) : null;
	if (!act) {
		// An unknown act name is taken as a request to open it; with no acts at all
		// the novel needs one before a chapter can exist.
		if (args.act?.trim()) act = (await context.createAct(args.act.trim())) ?? null;
		else act = acts[acts.length - 1] ?? (await context.createAct('Act 1')) ?? null;
	}
	if (!act) throw new Error('Could not resolve or create an act for the chapter.');

	const orden = context.listChapters().filter((chapter) => chapter.id_acto === act!.id_acto).length;
	const chapter = await context.createChapter(act.id_acto, name, orden);
	if (!chapter) throw new Error('The chapter could not be created.');

	if (args.outline?.trim()) await context.updateChapter(chapter.id_capitulo, { outline: args.outline.trim() });
	// Always materialise the manuscript file, even when it starts empty.
	const path = await context.writeChapterText(chapter.id_capitulo, args.content?.trim() ?? '');

	const parts = [`Created chapter "${name}" in act "${act.nombre}".`];
	if (path) parts.push(`File: ${path}.`);
	if (args.outline?.trim()) parts.push('Outline saved.');
	if (args.content?.trim()) parts.push(`${countWords(args.content)} words written.`);
	return parts.join(' ');
}

export async function writeChapter(args: Record<string, string>, context: ToolContext): Promise<string> {
	const chapter = resolveChapter(args.chapter ?? '', context);
	const content = args.content ?? '';
	if (!content.trim()) throw new Error('Argument "content" is required.');
	const append = (args.mode ?? 'replace').trim().toLowerCase() === 'append';
	const current = append ? await context.readChapterText(chapter.id_capitulo) : '';
	const next = append && current.trim() ? `${current.trim()}\n\n${content.trim()}` : content.trim();
	const path = await context.writeChapterText(chapter.id_capitulo, next);
	if (!path) throw new Error(`Could not write the manuscript of "${chapter.nombre}".`);
	return `${append ? 'Appended to' : 'Replaced'} chapter "${chapter.nombre}" (${countWords(next)} words total).`;
}

function countOccurrences(text: string, needle: string): number {
	if (!needle) return 0;
	let count = 0;
	let from = text.indexOf(needle);
	while (from !== -1) {
		count += 1;
		from = text.indexOf(needle, from + needle.length);
	}
	return count;
}

/**
 * Replaces an exact passage of a chapter, like a find-and-replace. Far cheaper
 * than rewriting the whole chapter for a small change, and safer: the text has
 * to match what is really there, so the model has to read before it edits.
 */
export async function editChapter(args: Record<string, string>, context: ToolContext): Promise<string> {
	const chapter = resolveChapter(args.chapter ?? '', context);
	const find = (args.find ?? '').trim();
	if (!find) throw new Error('Argument "find" is required.');
	const replace = (args.replace ?? '').trim();
	const all = (args.all ?? '').trim().toLowerCase() === 'yes';

	const text = await context.readChapterText(chapter.id_capitulo);
	const count = countOccurrences(text, find);
	if (count === 0) {
		throw new Error(`The text to find is not in chapter "${chapter.nombre}". `
			+ 'Copy it exactly from read_chapter, including punctuation and line breaks.');
	}
	if (count > 1 && !all) {
		throw new Error(`The text to find appears ${count} times in "${chapter.nombre}". `
			+ 'Include more of the surrounding text so it is unique, or set [[all]] yes.');
	}
	const next = all ? text.split(find).join(replace) : text.replace(find, () => replace);
	const path = await context.writeChapterText(chapter.id_capitulo, next);
	if (!path) throw new Error(`Could not write the manuscript of "${chapter.nombre}".`);
	const times = all && count > 1 ? `${count} passages` : 'one passage';
	return `Edited chapter "${chapter.nombre}": replaced ${times} (${countWords(next)} words total).`;
}
