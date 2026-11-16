import { App } from 'obsidian';
import type { WritingDay, WritingLog } from '../../../domain';
import { WRITING_LOG_FILE } from '../../../constants/novel';
import { mergeWritingDays, normalizeWritingLog } from '../../../utils/writingLog';
import { withFileLock } from '../fileLock';
import { joinPath, readJson, writeJson } from '../fsHelpers';

/**
 * `__writing_log.json` of a novel. Every change goes through `withFileLock`
 * and adds counts to what is on disk, so two devices syncing the vault add up
 * their days instead of overwriting each other's.
 */

function logPath(folderPath: string): string {
	return joinPath(folderPath, WRITING_LOG_FILE);
}

export function readWritingLog(app: App, folderPath: string): Promise<WritingLog> {
	const path = logPath(folderPath);
	return withFileLock(path, async () => normalizeWritingLog(await readJson(app, path)));
}

export function addWritingDays(app: App, folderPath: string, deltas: WritingDay[]): Promise<void> {
	if (!deltas.length) return Promise.resolve();
	const path = logPath(folderPath);
	return withFileLock(path, async () => {
		const current = normalizeWritingLog(await readJson(app, path));
		await writeJson(app, path, mergeWritingDays(current, deltas));
	});
}
