/**
 * Splits an assistant answer into what the AI said and the tool calls it made,
 * in the order they happened. Pure: the live turn and the stored message both
 * draw from it.
 *
 * The text of a turn is stored whole, its rounds joined by a blank line. Each
 * call remembers `textOffset`: how many characters of that text existed when
 * it ran. Calls without it (answers saved before this existed) go at the end.
 */

export interface PositionedCall {
	textOffset?: number;
}

export type TurnSegment<C> =
	| { kind: 'text'; text: string }
	| { kind: 'calls'; calls: C[] };

const ROUND_SEPARATOR = '\n\n';

/**
 * Where the text can be split for a call. An offset always lands at the end of
 * a round, right before the separator; if the author edited the answer since,
 * it may land mid-paragraph, so it moves forward to the next paragraph break.
 */
function splitPoint(text: string, offset: number | undefined, from: number): number {
	if (offset === undefined) return text.length;
	const clamped = Math.min(Math.max(offset, from), text.length);
	if (clamped === text.length || clamped === 0) return clamped;
	if (text.startsWith(ROUND_SEPARATOR, clamped)) return clamped;
	const next = text.indexOf(ROUND_SEPARATOR, clamped);
	return next < 0 ? text.length : next;
}

export function splitTurn<C extends PositionedCall>(text: string, calls: C[]): TurnSegment<C>[] {
	const segments: TurnSegment<C>[] = [];
	const source = text ?? '';
	let cursor = 0;
	let group: C[] = [];
	let groupAt = -1;

	const pushText = (until: number) => {
		const piece = source.slice(cursor, until).trim();
		if (piece) segments.push({ kind: 'text', text: piece });
		cursor = Math.max(cursor, until);
	};
	const pushGroup = () => {
		if (group.length) segments.push({ kind: 'calls', calls: group });
		group = [];
	};

	for (const call of calls) {
		const at = splitPoint(source, call.textOffset, cursor);
		if (at !== groupAt) {
			pushGroup();
			pushText(at);
			groupAt = at;
		}
		group.push(call);
	}
	pushGroup();
	pushText(source.length);
	return segments;
}
