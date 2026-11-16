/**
 * Words written per day in one novel, stored in `__writing_log.json`. The
 * author's typing, the plugin's own writes (AI drafts, undo) and text moved
 * through the clipboard are kept apart, so the writing pace only counts what
 * the author typed.
 */
export interface WritingDay {
	/** Local date, `YYYY-MM-DD`. */
	date: string;
	/** Words the author added and removed in the manuscripts. */
	added: number;
	removed: number;
	/** Net words written by the plugin itself: AI drafts and generated text. */
	generated: number;
	/**
	 * Net words that came through the clipboard: pasted minus cut. Moving text
	 * inside the novel (cut and paste) adds up to zero.
	 */
	pasted: number;
}

export interface WritingLog {
	version: 1;
	/** One per day with activity, oldest first. */
	days: WritingDay[];
}
