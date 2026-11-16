import type { WritingDay, WritingLog } from '../domain';
import type { PaceDay, PaceProjection, WritingPace } from '../types/WritingPace';

/**
 * Pure logic of the writing log: merging the words counted by the tracker
 * into the stored log, and the pace shown in the Metrics tab.
 */

const RECENT_DAYS = 30;
const WEEK_DAYS = 7;

function twoDigits(value: number): string {
	return value < 10 ? `0${value}` : String(value);
}

/** Local date of `date` as `YYYY-MM-DD`. */
export function dayKey(date: Date): string {
	const month = twoDigits(date.getMonth() + 1);
	return `${date.getFullYear()}-${month}-${twoDigits(date.getDate())}`;
}

function parseDay(key: string): Date {
	const [year, month, day] = key.split('-').map(Number);
	return new Date(year, month - 1, day);
}

/** The day `amount` days after `key` (before, if negative). */
export function shiftDay(key: string, amount: number): string {
	const date = parseDay(key);
	date.setDate(date.getDate() + amount);
	return dayKey(date);
}

/** Whole days from `from` to `to`; ignores daylight saving changes. */
function daysBetween(from: string, to: string): number {
	const milliseconds = parseDay(to).getTime() - parseDay(from).getTime();
	return Math.round(milliseconds / 86400000);
}

export function emptyWritingLog(): WritingLog {
	return { version: 1, days: [] };
}

function toNumber(value: unknown): number {
	return typeof value === 'number' && isFinite(value) ? Math.round(value) : 0;
}

/** A log read from disk, with anything malformed dropped. */
export function normalizeWritingLog(raw: unknown): WritingLog {
	const days = (raw as { days?: unknown })?.days;
	if (!Array.isArray(days)) return emptyWritingLog();
	const valid = days
		.filter((day) => typeof day?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day.date))
		.map((day): WritingDay => ({
			date: day.date,
			added: toNumber(day.added),
			removed: toNumber(day.removed),
			generated: toNumber(day.generated),
			pasted: toNumber(day.pasted),
		}));
	return mergeWritingDays(emptyWritingLog(), valid);
}

/** Adds the counts of `deltas` to the days of `log`. Returns a new log. */
export function mergeWritingDays(log: WritingLog, deltas: WritingDay[]): WritingLog {
	const byDate = new Map<string, WritingDay>();
	for (const day of [...log.days, ...deltas]) {
		const current = byDate.get(day.date) ?? {
			date: day.date,
			added: 0,
			removed: 0,
			generated: 0,
			pasted: 0,
		};
		byDate.set(day.date, {
			date: day.date,
			added: current.added + day.added,
			removed: current.removed + day.removed,
			generated: current.generated + day.generated,
			pasted: current.pasted + (day.pasted ?? 0),
		});
	}
	const days = [...byDate.values()].sort((first, second) =>
		first.date.localeCompare(second.date));
	return { version: 1, days };
}

function netWords(day: WritingDay | undefined): number {
	return day ? day.added - day.removed : 0;
}

function longestStreak(days: WritingDay[]): number {
	let longest = 0;
	let current = 0;
	let previous: string | null = null;
	for (const day of days) {
		if (netWords(day) <= 0) {
			current = 0;
			previous = null;
			continue;
		}
		current = previous && shiftDay(previous, 1) === day.date ? current + 1 : 1;
		previous = day.date;
		longest = Math.max(longest, current);
	}
	return longest;
}

function currentStreak(byDate: Map<string, WritingDay>, today: string): number {
	let cursor = netWords(byDate.get(today)) > 0 ? today : shiftDay(today, -1);
	let streak = 0;
	while (netWords(byDate.get(cursor)) > 0) {
		streak++;
		cursor = shiftDay(cursor, -1);
	}
	return streak;
}

function projection(remainingWords: number | null, pace: number, today: string): PaceProjection | null {
	if (remainingWords === null) return null;
	const remaining = Math.max(0, remainingWords);
	if (remaining === 0) return { remainingWords: 0, daysLeft: 0, finishDate: today };
	if (pace <= 0) return { remainingWords: remaining, daysLeft: null, finishDate: null };
	const daysLeft = Math.ceil(remaining / pace);
	return { remainingWords: remaining, daysLeft, finishDate: shiftDay(today, daysLeft) };
}

/**
 * Pace of the author up to `now`. `remainingWords` is what is left to the
 * novel's target length, or null when the novel has no target.
 */
export function writingPace(log: WritingLog, now: Date, remainingWords: number | null): WritingPace {
	const today = dayKey(now);
	const byDate = new Map(log.days.map((day) => [day.date, day]));
	const series: PaceDay[] = [];
	for (let offset = RECENT_DAYS - 1; offset >= 0; offset--) {
		const date = shiftDay(today, -offset);
		const day = byDate.get(date);
		series.push({
			date,
			words: netWords(day),
			generated: day?.generated ?? 0,
			pasted: day?.pasted ?? 0,
		});
	}

	const sum = (days: PaceDay[]) => days.reduce((total, day) => total + day.words, 0);
	const last30Days = sum(series);
	const writingDays = series.filter((day) => day.words > 0);
	const firstDay = log.days[0]?.date ?? today;
	const window = Math.min(RECENT_DAYS, Math.max(1, daysBetween(firstDay, today) + 1));
	const recentDailyPace = sum(series.slice(-window)) / window;

	let bestDay: PaceDay | null = null;
	for (const day of log.days) {
		const words = netWords(day);
		if (words > 0 && (!bestDay || words > bestDay.words)) {
			bestDay = { date: day.date, words, generated: day.generated, pasted: day.pasted };
		}
	}

	return {
		hasData: log.days.length > 0,
		today: netWords(byDate.get(today)),
		todayGenerated: byDate.get(today)?.generated ?? 0,
		todayPasted: byDate.get(today)?.pasted ?? 0,
		last7Days: sum(series.slice(-WEEK_DAYS)),
		last30Days,
		averagePerWritingDay: writingDays.length
			? Math.round(sum(writingDays) / writingDays.length)
			: 0,
		recentDailyPace,
		streak: currentStreak(byDate, today),
		longestStreak: longestStreak(log.days),
		bestDay,
		series,
		projection: projection(remainingWords, recentDailyPace, today),
	};
}
