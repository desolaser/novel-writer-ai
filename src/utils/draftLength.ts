import { DEFAULT_WORD_RANGE, type WordRange } from '../domain';

/**
 * How long a chapter draft should be. Pure.
 *
 * The length comes from the Story Bible (`wordsPerChapter`, per novel): any
 * length inside the range is fine, the model aims at its midpoint, and the
 * maximum is a ceiling it must not pass.
 */
export interface DraftLength {
	/** The draft is long enough from here on. */
	min: number;
	/** Ceiling the model must not pass. */
	max: number;
	/** What the model aims at: the midpoint of the range. */
	target: number;
}

/** Room around an explicit word count given instead of the range. */
const OVERRIDE_SPREAD = 0.1;

function isUsable(range: WordRange | null | undefined): range is WordRange {
	return Boolean(range)
		&& Number.isFinite(range!.min) && Number.isFinite(range!.max)
		&& range!.min > 0 && range!.max >= range!.min;
}

/** From the novel's range; the default range when it has no usable one. */
export function draftLengthFromRange(range: WordRange | null | undefined): DraftLength {
	const { min, max } = isUsable(range) ? range : DEFAULT_WORD_RANGE;
	return { min, max, target: Math.round((min + max) / 2) };
}

/** From an explicit word count, with a band of 10% on each side. */
export function draftLengthFromWords(words: number): DraftLength {
	return {
		min: Math.round(words * (1 - OVERRIDE_SPREAD)),
		max: Math.round(words * (1 + OVERRIDE_SPREAD)),
		target: words,
	};
}
