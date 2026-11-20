/**
 * Where a quote is in a text, ignoring differences in spacing, line breaks,
 * curly quotes and case: models rarely copy a passage byte for byte. Pure.
 */

export interface QuoteRange {
	start: number;
	end: number;
}

/** Lowercase, straight quotes and dashes: one character for each input one. */
function foldChar(char: string): string {
	if ('“”«»'.includes(char)) return '"';
	if ('‘’'.includes(char)) return "'";
	if ('–—'.includes(char)) return '-';
	return char.toLowerCase();
}

interface Folded {
	text: string;
	/** Index in the original text of each folded character. */
	origin: number[];
}

/** Folds the text and collapses each run of whitespace into one space. */
function fold(text: string): Folded {
	let folded = '';
	const origin: number[] = [];
	let inSpace = false;
	for (let i = 0; i < text.length; i++) {
		const char = text[i];
		if (/\s/.test(char)) {
			if (!inSpace && folded) {
				folded += ' ';
				origin.push(i);
			}
			inSpace = true;
			continue;
		}
		inSpace = false;
		folded += foldChar(char);
		origin.push(i);
	}
	return { text: folded, origin };
}

/** The range of `quote` in `text`, or null when it isn't there. */
export function findQuote(text: string, quote: string): QuoteRange | null {
	const needle = fold(quote.trim().replace(/^["'“‘]|["'”’]$/g, ''));
	if (needle.text.length < 3) return null;
	const haystack = fold(text);
	const at = haystack.text.indexOf(needle.text.trim());
	if (at < 0) return null;
	const last = at + needle.text.trim().length - 1;
	return { start: haystack.origin[at], end: haystack.origin[last] + 1 };
}
