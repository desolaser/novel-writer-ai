/**
 * What a chat answer changed in the novel's files, and how to take it back.
 * Pure: the vault side lives in `infrastructure/storage/novelSnapshot.ts`.
 *
 * A snapshot maps each file path to its content. Comparing the snapshot taken
 * before the first write of an answer with the one taken when it ends gives the
 * answer's changes, whatever tools made them.
 */

export type FileSnapshot = Record<string, string>;

export interface FileChange {
	path: string;
	/** Content before the answer; null when the answer created the file. */
	before: string | null;
	/** Content when the answer ended; null when the answer deleted it. */
	after: string | null;
}

export function diffSnapshots(before: FileSnapshot, after: FileSnapshot): FileChange[] {
	const paths = new Set([...Object.keys(before), ...Object.keys(after)]);
	const changes: FileChange[] = [];
	for (const path of [...paths].sort()) {
		const old = before[path] ?? null;
		const now = after[path] ?? null;
		if (old !== now) changes.push({ path, before: old, after: now });
	}
	return changes;
}

export interface RevertPlan {
	/** Changes whose file is still as the answer left it: safe to undo. */
	apply: FileChange[];
	/** Files changed again since (by the author or another answer): left alone. */
	conflicts: string[];
}

/** `current` holds each changed file as it is now, null when it does not exist. */
export function planRevert(
	changes: FileChange[],
	current: Record<string, string | null>,
): RevertPlan {
	const apply: FileChange[] = [];
	const conflicts: string[] = [];
	for (const change of changes) {
		const now = current[change.path] ?? null;
		if (now === change.after) apply.push(change);
		else conflicts.push(change.path);
	}
	return { apply, conflicts };
}
