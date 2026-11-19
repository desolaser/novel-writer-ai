import type { ChapterStatus } from '../domain';

/** One writing stage, as the Outline and Metrics show it. */
export interface ChapterStatusInfo {
	id: ChapterStatus;
	label: string;
	/** What the stage means, for tooltips and for the chat tool. */
	hint: string;
	/** CSS color of the status dot and of the Metrics bars. */
	color: string;
}

/** Writing stages in the order a chapter goes through them. */
export const CHAPTER_STATUSES: ChapterStatusInfo[] = [
	{
		id: 'idea',
		label: 'Idea',
		hint: 'Only a title or a rough idea',
		color: 'var(--text-faint)',
	},
	{
		id: 'outlined',
		label: 'Outlined',
		hint: 'The outline is ready',
		color: 'var(--color-blue)',
	},
	{
		id: 'drafted',
		label: 'Drafted',
		hint: 'A first draft is written',
		color: 'var(--color-yellow)',
	},
	{
		id: 'revised',
		label: 'Revised',
		hint: 'The draft went through a revision',
		color: 'var(--color-orange)',
	},
	{
		id: 'final',
		label: 'Final',
		hint: 'Finished text',
		color: 'var(--color-green)',
	},
];

export function chapterStatusInfo(
	status: ChapterStatus | undefined,
): ChapterStatusInfo | undefined {
	return CHAPTER_STATUSES.find((item) => item.id === status);
}

/** Parses a status written by the author or the AI, by id or label. */
export function parseChapterStatus(value: string): ChapterStatus | undefined {
	const needle = value.trim().toLowerCase();
	const match = CHAPTER_STATUSES.find((item) =>
		item.id === needle || item.label.toLowerCase() === needle);
	return match?.id;
}
