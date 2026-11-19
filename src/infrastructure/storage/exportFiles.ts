import { App, TFile } from 'obsidian';
import { EXPORT_FOLDER } from '../../constants/novel';
import { ensureParent, joinPath } from './fsHelpers';

/**
 * Files written by "Export novel": inside the novel's `export/` folder, so
 * they travel with the novel and never mix with its data. Writing again to the
 * same name replaces the previous export.
 */

/** Characters a file name cannot have on Windows, macOS or Android. */
export function safeFileName(name: string): string {
	const clean = name
		.replace(/[\\/:*?"<>|#^[\]]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/^\.+/, '');
	return clean.slice(0, 120) || 'Untitled';
}

/** Vault path of a file inside the novel's export folder. */
export function exportPath(novelFolder: string, ...parts: string[]): string {
	return joinPath(novelFolder, EXPORT_FOLDER, ...parts);
}

/** Writes text or bytes, replacing the file if it exists. Returns its path. */
export async function writeExportFile(
	app: App,
	path: string,
	data: string | Uint8Array,
): Promise<string> {
	await ensureParent(app, path);
	const existing = app.vault.getAbstractFileByPath(path);
	if (typeof data === 'string') {
		if (existing instanceof TFile) {
			await app.vault.modify(existing, data);
		} else {
			await app.vault.create(path, data);
		}
		return path;
	}
	const buffer = data.buffer.slice(
		data.byteOffset,
		data.byteOffset + data.byteLength,
	) as ArrayBuffer;
	if (existing instanceof TFile) {
		await app.vault.modifyBinary(existing, buffer);
	} else {
		await app.vault.createBinary(path, buffer);
	}
	return path;
}
