import type { Acto, Capitulo, EntityId } from '../domain';
import type { HistoryOptions } from '../infrastructure/settings/plugin-settings';
import { estimateTokens } from './promptBuilder';

/**
 * The single source of "what happened before this chapter" for every AI request.
 *
 * Only summaries travel: the chapter outline, which is already generated from the
 * manuscript, and the act summary that stands in for chapters too old to send one
 * by one. Excerpts of the real prose are deliberately not an option — they return
 * the opening of each chapter instead of what happened in it, and cost an order of
 * magnitude more.
 */

/** Heading the generated block carries, so the author recognises it in a note. */
export const HISTORY_HEADING = 'Story so far:';

/**
 * Only the fields the history needs, so both the stored entities and the drafts
 * the blueprint has not persisted yet can be passed without adapting anything.
 */
export type HistoryAct = Pick<Acto, 'id_acto' | 'nombre' | 'resumen'>;
export type HistoryChapter = Pick<Capitulo, 'id_capitulo' | 'id_acto' | 'nombre' | 'outline'>;

export interface ChapterHistoryInput {
	/** Acts in narrative order, carrying their summary. */
	acts: HistoryAct[];
	/** Chapters in narrative order (the output of `orderedChapters`). */
	chapters: HistoryChapter[];
	/**
	 * Chapter the history is built for; it and everything after it are excluded.
	 * `null` covers the whole novel, which is what the outline generator needs.
	 */
	upTo?: EntityId | null;
}

/** One act standing in for a run of older chapters. */
interface ActBlock {
	line: string;
	covered: number;
}

/** Chapters that come before `upTo` and actually have a summary to send. */
function chaptersBefore(chapters: HistoryChapter[], upTo: EntityId | null): HistoryChapter[] {
	const end = upTo ? chapters.findIndex(c => c.id_capitulo === upTo) : -1;
	const previous = end >= 0 ? chapters.slice(0, end) : chapters;
	return previous.filter(c => c.outline?.trim());
}

/**
 * Collapses the chapters preceding the recent window into one line per act. An act
 * without a summary contributes nothing and its chapters are reported as omitted,
 * whatever the mode: inventing a summary here would be worse than admitting the gap.
 */
function buildActBlocks(acts: HistoryAct[], older: HistoryChapter[], numbers: Map<EntityId, number>, mode: HistoryOptions['olderChapters']): ActBlock[] {
	if (mode === 'omit' || !older.length) return [];
	const blocks: ActBlock[] = [];
	for (const act of acts) {
		const own = older.filter(c => c.id_acto === act.id_acto);
		if (!own.length) continue;
		const summary = act.resumen?.trim();
		if (!summary) continue;
		const first = numbers.get(own[0].id_capitulo);
		const last = numbers.get(own[own.length - 1].id_capitulo);
		const range = first === last ? `chapter ${first}` : `chapters ${first}-${last}`;
		blocks.push({ line: `ACT ${act.nombre} (${range}): ${summary}`, covered: own.length });
	}
	return blocks;
}

function renderHistory(actBlocks: ActBlock[], recent: string[], omitted: number): string {
	const lines = [
		omitted > 0 ? `(${omitted} earlier ${omitted === 1 ? 'chapter' : 'chapters'} omitted)` : '',
		...actBlocks.map(block => block.line),
		...recent,
	].filter(Boolean);
	if (!lines.length) return '';
	// Blank line between entries: these are full paragraphs, and run together they
	// are unreadable both for the author checking the note and for the model.
	return [HISTORY_HEADING, ...lines].join('\n\n');
}

/**
 * Builds the history block. Recent chapters keep their full outline, older ones are
 * represented by their act, and `maxTokens` (when set) is a hard ceiling applied by
 * dropping the oldest material first.
 */
export function buildChapterHistory(
	{ acts, chapters, upTo = null }: ChapterHistoryInput,
	options: HistoryOptions,
): string {
	const previous = chaptersBefore(chapters, upTo);
	if (!previous.length) return '';

	// Numbering follows the full novel, not the filtered list, so it matches what
	// the author sees in the outline view.
	const numbers = new Map<EntityId, number>(chapters.map((c, index) => [c.id_capitulo, index + 1]));

	const keep = Math.max(0, Math.min(Math.floor(options.recentChapters), previous.length));
	const recentChapters = previous.slice(previous.length - keep);
	const older = previous.slice(0, previous.length - keep);

	let actBlocks = buildActBlocks(acts, older, numbers, options.olderChapters);
	// The chapter name is the author's and often carries their own numbering, so
	// adding one here would print it twice. Order is already given by the sequence.
	let recent = recentChapters.map(c => `${c.nombre}: ${c.outline.trim()}`);

	const omittedNow = () =>
		previous.length - recent.length - actBlocks.reduce((total, block) => total + block.covered, 0);

	let output = renderHistory(actBlocks, recent, omittedNow());
	const ceiling = Math.floor(options.maxTokens);
	if (ceiling <= 0) return output;

	// Over budget: drop the oldest outlines first, then the oldest act summaries.
	// The chapter right before this one always survives — without it the model has
	// no idea where the story stands, which defeats the point of sending anything.
	while (estimateTokens(output) > ceiling && recent.length > 1) {
		recent = recent.slice(1);
		output = renderHistory(actBlocks, recent, omittedNow());
	}
	while (estimateTokens(output) > ceiling && actBlocks.length) {
		actBlocks = actBlocks.slice(1);
		output = renderHistory(actBlocks, recent, omittedNow());
	}
	return output;
}
