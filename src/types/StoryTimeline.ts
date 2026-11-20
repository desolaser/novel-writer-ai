import type { EntityId } from '../domain/types';

/** What the rows of the timeline group chapters by. */
export type TimelineLaneMode = 'pov' | 'setting' | 'characters' | 'none';

/** One story day that has something on it. */
export interface TimelineColumn {
	day: number;
	/** Days skipped since the previous column; 0 when they are consecutive. */
	gapBefore: number;
}

/** A dated scene on its chapter's bar. */
export interface TimelineSceneMark {
	column: number;
	/** Its number in the chapter ("2"). */
	label: string;
	/** "Scene 2: The deal (day 4)". */
	title: string;
}

/** A chapter as a bar from its first to its last day. */
export interface TimelineCard {
	chapterId: EntityId;
	/** Place in reading order (1 = first). */
	number: number;
	name: string;
	startColumn: number;
	endColumn: number;
	/** Row inside its lane, so overlapping chapters stack. */
	row: number;
	start: number;
	end: number;
	/** The chapter's free "when" label. */
	when: string;
	/** Happens before a chapter that comes earlier in reading order. */
	flashback: boolean;
	scenes: TimelineSceneMark[];
}

export interface TimelineLane {
	key: string;
	name: string;
	color: string;
	/** The codex entry of the lane; null for "no point of view" and the like. */
	entryId: EntityId | null;
	rows: number;
	cards: TimelineCard[];
}

/** A chapter with no day yet. */
export interface TimelineUndated {
	chapterId: EntityId;
	number: number;
	name: string;
}

export interface StoryTimeline {
	columns: TimelineColumn[];
	lanes: TimelineLane[];
	undated: TimelineUndated[];
}
