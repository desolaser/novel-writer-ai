/** Includes the separating space; this is a heuristic, not a tokenizer. */
const AVERAGE_WORD_CHARACTERS = 6;
const AVERAGE_TOKEN_CHARACTERS = 4;
const OUTPUT_MARGIN = 1.5;

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
