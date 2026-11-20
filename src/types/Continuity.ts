import type { EntityId, ISODate } from '../domain/types';

/**
 * Continuity check: facts each chapter establishes, and the last report of
 * contradictions found in a chapter. Stored in `escritura/continuity.json`.
 */

/** "ai" facts are replaced when the chapter is extracted again. */
export type FactSource = 'ai' | 'author';

export interface StoryFact {
	id: EntityId;
	text: string;
	source: FactSource;
}

/** A passage of a chapter that contradicts an earlier fact. */
export interface ContinuityIssue {
	id: EntityId;
	title: string;
	/** Words from the checked chapter, to find the passage. */
	quote: string;
	explanation: string;
	/** The earlier fact it contradicts, as the model quoted it. */
	fact: string;
	/** Chapter that established the fact; null when it is the codex. */
	fact_chapter_id: EntityId | null;
}

export interface ContinuityReport {
	checked_at: ISODate;
	/** Hash of the chapter text that was checked. */
	text_hash: string;
	/** How many earlier facts it was checked against. */
	facts_checked: number;
	issues: ContinuityIssue[];
}

export interface ChapterContinuity {
	/** Hash of the text the AI facts were extracted from. */
	text_hash: string | null;
	extracted_at: ISODate | null;
	facts: StoryFact[];
	report: ContinuityReport | null;
}

export interface ContinuityFile {
	version: 1;
	chapters: Record<EntityId, ChapterContinuity>;
}
