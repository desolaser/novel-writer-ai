import type { EntityId, NovelBlueprint, WritingLog } from '../domain';

/** What the Metrics tab reads from the active novel besides the store's lists. */
export interface MetricsSource {
	/** Manuscript of a chapter without its frontmatter; empty if it has none. */
	readChapterText(id: EntityId): Promise<string>;
	readBlueprint(): Promise<NovelBlueprint | null>;
	/** Words written per day, including counts not saved to disk yet. */
	readWritingLog(): Promise<WritingLog>;
	/** Names the author chose not to see suggested for a codex entry. */
	readIgnoredNames(): Promise<string[]>;
}
