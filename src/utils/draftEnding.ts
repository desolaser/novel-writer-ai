/**
 * Whether a generated draft stopped mid-sentence, and how to cut it back to
 * the last complete one. Pure.
 *
 * A model that hits its output limit stops wherever it is, often in the middle
 * of a sentence. Keeping that half sentence leaves the chapter "cut off"; the
 * draft loop trims it and asks for a short closing instead.
 */

/** Sentence end, optionally followed by closing quotes, brackets or dashes. */
const SENTENCE_END = /[.!?…。！？][\s"'»”’)\]—–-]*$/u;
const LAST_SENTENCE_END = /[.!?…。！？][\s"'»”’)\]—–-]*(?=\s|$)/gu;

export function endsWithCompleteSentence(text: string): boolean {
	return SENTENCE_END.test((text ?? '').trimEnd());
}

/**
 * The text up to its last complete sentence. A text with no sentence end at
 * all is returned as it is: there is nothing safe to cut back to.
 */
export function trimToCompleteSentence(text: string): string {
	const clean = (text ?? '').trimEnd();
	if (endsWithCompleteSentence(clean)) return clean;
	let end = -1;
	for (const match of clean.matchAll(LAST_SENTENCE_END)) {
		end = (match.index ?? 0) + match[0].length;
	}
	return end > 0 ? clean.slice(0, end).trimEnd() : clean;
}

/** True when the draft was cut and has something complete to cut back to. */
export function wasCutMidSentence(text: string): boolean {
	const clean = (text ?? '').trimEnd();
	return !endsWithCompleteSentence(clean) && trimToCompleteSentence(clean) !== clean;
}
