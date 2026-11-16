import type { FileChange, FileSnapshot } from '../utils/fileChanges';

/** Result of taking an answer's changes back. */
export interface RevertResult {
	reverted: number;
	/** Files changed again after the answer, left as they are. */
	conflicts: string[];
}

/**
 * The novel's files as a whole, which is what undoing a chat answer needs:
 * a copy of them before and after, and a way to put changed files back.
 */
export interface NovelFiles {
	snapshot(): Promise<FileSnapshot>;
	revert(changes: FileChange[]): Promise<RevertResult>;
}
