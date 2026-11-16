import type { WritingDay } from '../domain';

/**
 * Who wrote the words a save changed: the author, the AI or the clipboard.
 * Pure, used by `WritingTracker`.
 */

/** Who made an edit in the editor that was not typed by the author. */
export type EditSource = 'generated' | 'pasted';

/** Net words of the edits noted since the last save of a file. */
export interface NotedWords {
	generated: number;
	pasted: number;
}

/**
 * Words still in a manuscript that the author did not type, most recent last.
 * When the author deletes, these go first: deleting a pasted paragraph takes
 * words out of "pasted", not out of the author's own count.
 */
export interface ForeignChunk {
	source: EditSource;
	words: number;
}

export function noNotedWords(): NotedWords {
	return { generated: 0, pasted: 0 };
}

function emptyDay(date: string): WritingDay {
	return { date, added: 0, removed: 0, generated: 0, pasted: 0 };
}

function pushForeign(stack: ForeignChunk[], source: EditSource, words: number) {
	if (words <= 0) return;
	const top = stack[stack.length - 1];
	if (top?.source === source) top.words += words;
	else stack.push({ source, words });
}

/**
 * Takes up to `words` from the most recent foreign chunks. Returns what was
 * taken from each source, plus what was left over.
 */
function takeForeign(stack: ForeignChunk[], words: number): NotedWords & { rest: number } {
	const taken = { ...noNotedWords(), rest: words };
	while (taken.rest > 0 && stack.length) {
		const top = stack[stack.length - 1];
		const amount = Math.min(top.words, taken.rest);
		taken[top.source] += amount;
		taken.rest -= amount;
		top.words -= amount;
		if (!top.words) stack.pop();
	}
	return taken;
}

/**
 * Splits the words a save changed (`delta`) and updates `stack`, the foreign
 * words of that file.
 *
 * - A save written by the plugin (`pluginWrite`) is all generated.
 * - Otherwise the noted edits (AI text in the editor, paste, cut) are taken
 *   out first; what is left is the author's typing.
 * - Words the author deleted come out of the foreign words first, most recent
 *   first; only the rest counts as removed by the author.
 */
export function attributeSave(
	date: string,
	delta: number,
	pluginWrite: boolean,
	noted: NotedWords,
	stack: ForeignChunk[],
): WritingDay {
	const day = emptyDay(date);
	if (pluginWrite) {
		day.generated = delta;
		if (delta > 0) pushForeign(stack, 'generated', delta);
		else takeForeign(stack, -delta);
		return day;
	}

	day.generated = noted.generated;
	day.pasted = noted.pasted;
	pushForeign(stack, 'generated', noted.generated);
	pushForeign(stack, 'pasted', noted.pasted);
	// A cut takes words out: it leaves the foreign words, most recent first.
	if (noted.pasted < 0) takeForeign(stack, -noted.pasted);
	if (noted.generated < 0) takeForeign(stack, -noted.generated);

	const typed = delta - noted.generated - noted.pasted;
	if (typed >= 0) {
		day.added = typed;
		return day;
	}
	const taken = takeForeign(stack, -typed);
	day.generated -= taken.generated;
	day.pasted -= taken.pasted;
	day.removed = taken.rest;
	return day;
}
