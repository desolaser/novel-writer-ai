/** Writing pace of the author, from the novel's `WritingLog`. */

export interface PaceDay {
	date: string;
	/** Net words the author wrote that day (added minus removed). */
	words: number;
	/** Net words the plugin's AI wrote that day. */
	generated: number;
	/** Net words pasted (minus cut) that day. */
	pasted: number;
}

export interface PaceProjection {
	/** Words left to reach the novel's target length. */
	remainingWords: number;
	/** Days to finish at the recent pace; null when there is no pace yet. */
	daysLeft: number | null;
	/** Local date, `YYYY-MM-DD`; null when there is no pace yet. */
	finishDate: string | null;
}

export interface WritingPace {
	/** False until the log has at least one day. */
	hasData: boolean;
	today: number;
	todayGenerated: number;
	todayPasted: number;
	last7Days: number;
	last30Days: number;
	/** Average net words on the days with writing, over the last 30 days. */
	averagePerWritingDay: number;
	/** Net words per calendar day over the last 30 days (or since the log began). */
	recentDailyPace: number;
	/** Consecutive days with writing, up to today (or yesterday, if today is empty). */
	streak: number;
	longestStreak: number;
	bestDay: PaceDay | null;
	/** The last 30 days, oldest first, with empty days included. */
	series: PaceDay[];
	projection: PaceProjection | null;
}
