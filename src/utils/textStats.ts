/**
 * Pure text analysis for the Metrics tab: words, sentences, paragraphs and
 * dialogue of a manuscript. No Obsidian, no store, so it is tested directly.
 */

const WORD_PATTERN = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;
const SENTENCE_END = /[.!?…]+["”»’)]*(?=\s|$)/g;
const DIALOGUE_DASH = /^\s*(?:—|–|--)/;
const QUOTED = /["“«]([^"“”«»]*)["”»]/g;

/** Removes what Obsidian does not show as prose: comments, embeds and link targets. */
export function cleanMarkdown(text: string): string {
	return text
		.replace(/^---[\s\S]*?---\s*/, '')
		.replace(/%%[\s\S]*?%%/g, ' ')
		.replace(/<!--[\s\S]*?-->/g, ' ')
		.replace(/!\[\[[^\]]*\]\]/g, ' ')
		.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
		.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
		.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
}

/** Words of the text, as written. Punctuation and dashes are not words. */
export function tokenize(text: string): string[] {
	return text.match(WORD_PATTERN) ?? [];
}

export function countWords(text: string): number {
	return tokenize(text).length;
}

/** Words a reader would see: `countWords` after `cleanMarkdown`. */
export function countProseWords(text: string): number {
	return countWords(cleanMarkdown(text));
}

/** Paragraphs: non-empty lines that are not headings or separators. */
export function splitParagraphs(text: string): string[] {
	return text
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line && !line.startsWith('#'))
		.filter((line) => !/^([-*_])\1{2,}$/.test(line));
}

/** Sentences of a paragraph that contain at least one word. */
export function splitSentences(paragraph: string): string[] {
	const sentences: string[] = [];
	let start = 0;
	SENTENCE_END.lastIndex = 0;
	let match: RegExpExecArray | null;
	while ((match = SENTENCE_END.exec(paragraph)) !== null) {
		const end = match.index + match[0].length;
		sentences.push(paragraph.slice(start, end));
		start = end;
	}
	sentences.push(paragraph.slice(start));
	return sentences.filter((sentence) => countWords(sentence) > 0);
}

/**
 * Words spoken in a paragraph. Two conventions: a paragraph opening with a
 * dash alternates speech and narration at every dash ("—Hi —she said—. Come."),
 * and anything between quotes is speech. It is an estimate.
 */
export function dialogueWords(paragraph: string): number {
	if (DIALOGUE_DASH.test(paragraph)) {
		const parts = paragraph.split(/—|–|--/);
		let spoken = 0;
		for (let index = 1; index < parts.length; index += 2) {
			spoken += countWords(parts[index]);
		}
		return spoken;
	}
	let spoken = 0;
	QUOTED.lastIndex = 0;
	let match: RegExpExecArray | null;
	while ((match = QUOTED.exec(paragraph)) !== null) {
		spoken += countWords(match[1]);
	}
	return spoken;
}

/**
 * Moving-average type-token ratio: the share of different words inside a
 * sliding window. Unlike the plain ratio it does not drop as the text grows,
 * so a long novel and a short one can be compared.
 */
export function vocabularyVariety(words: string[], window = 500): number {
	if (!words.length) return 0;
	if (words.length <= window) return new Set(words).size / words.length;
	const counts = new Map<string, number>();
	let distinct = 0;
	const add = (word: string) => {
		const next = (counts.get(word) ?? 0) + 1;
		counts.set(word, next);
		if (next === 1) distinct++;
	};
	const remove = (word: string) => {
		const next = (counts.get(word) ?? 0) - 1;
		counts.set(word, next);
		if (next === 0) distinct--;
	};
	for (let index = 0; index < window; index++) add(words[index]);
	let total = distinct;
	let windows = 1;
	for (let index = window; index < words.length; index++) {
		add(words[index]);
		remove(words[index - window]);
		total += distinct;
		windows++;
	}
	return total / windows / window;
}
