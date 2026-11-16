import { App, TFile } from 'obsidian';
import { WritingTracker } from '../infrastructure/storage/writingTracker';
import { isPluginWrite } from '../infrastructure/storage/pluginWrites';
import { addWritingDays, readWritingLog } from '../infrastructure/storage/repos/WritingLogRepo';

/** The writing tracker wired to the vault. */
export function createWritingTracker(app: App): WritingTracker {
	return new WritingTracker({
		readText: async (path) => {
			const file = app.vault.getAbstractFileByPath(path);
			return file instanceof TFile ? app.vault.read(file) : null;
		},
		readLog: (folder) => readWritingLog(app, folder),
		addDays: (folder, days) => addWritingDays(app, folder, days),
		isPluginWrite: (path) => isPluginWrite(path),
		now: () => new Date(),
	});
}
