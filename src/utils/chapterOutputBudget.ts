/** Includes the separating space; this is a heuristic, not a tokenizer. */
const AVERAGE_WORD_CHARACTERS = 6;
const AVERAGE_TOKEN_CHARACTERS = 4;
/**
 * Room above the target. It used to be 1.5, which let a model write half as
 * much again as asked (a 2000-word chapter came back with 3000) before the
 * limit stopped it, usually mid-sentence. A cut draft is now closed by a short
 * extra request, so the margin only has to absorb how tokens per word vary.
 */
const OUTPUT_MARGIN = 1.25;

/** Chapter requests override the short inline-completion budget. */
export function chapterOutputBudget(remainingWords: number): number {
	if (!Number.isFinite(remainingWords) || remainingWords <= 0) {
		throw new Error('Chapter word count must be a positive number.');
	}
	return Math.ceil(
		remainingWords * AVERAGE_WORD_CHARACTERS
		/ AVERAGE_TOKEN_CHARACTERS * OUTPUT_MARGIN
	);
}
