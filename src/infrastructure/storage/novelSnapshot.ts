import { App, TFile } from 'obsidian';
import type { NovelFiles, RevertResult } from '../../interfaces/novel-files';
import { planRevert, type FileChange, type FileSnapshot } from '../../utils/fileChanges';
import { ensureParent } from './fsHelpers';
import { withEstructuraLock } from './repos/estructuraStorage';

/** Data of a novel an answer may change: Markdown and JSON, chats excluded. */
const TRACKED_EXTENSIONS = new Set(['md', 'json']);
const UNTRACKED_FOLDERS = ['chats/'];

function isTracked(file: TFile, folder: string): boolean {
	if (!file.path.startsWith(`${folder}/`)) return false;
	if (!TRACKED_EXTENSIONS.has(file.extension)) return false;
	const relative = file.path.slice(folder.length + 1);
	return !UNTRACKED_FOLDERS.some((prefix) => relative.startsWith(prefix));
}

const ESTRUCTURA_FILE = 'escritura/estructura.json';

/**
 * Manuscripts linked from outside the novel folder (`linkCapituloArchivo`
 * stores those with their full vault path); the ones inside are already in.
 */
function linkedChapterPaths(estructura: string | undefined, folder: string): string[] {
	if (!estructura) return [];
	try {
		const data = JSON.parse(estructura) as { capitulos?: Array<{ archivo?: string | null }> };
		return (data.capitulos ?? [])
			.map((chapter) => chapter.archivo ?? '')
			.filter((path) => path.endsWith('.md') && !path.startsWith(`${folder}/`));
	} catch {
		return [];
	}
}

async function readCurrent(app: App, path: string): Promise<string | null> {
	const file = app.vault.getAbstractFileByPath(path);
	return file instanceof TFile ? app.vault.read(file) : null;
}

async function restore(app: App, change: FileChange): Promise<void> {
	const file = app.vault.getAbstractFileByPath(change.path);
	if (change.before === null) {
		// The answer created it: send it to the trash, where the author can still find it.
		if (file instanceof TFile) await app.vault.trash(file, true);
		return;
	}
	if (file instanceof TFile) {
		await app.vault.modify(file, change.before);
		return;
	}
	await ensureParent(app, change.path);
	await app.vault.create(change.path, change.before);
}

/**
 * Files of the novel stored in `folder`, for undoing chat answers. Both
 * operations run inside the estructura lock: `estructura.json` is one of the
 * files, and it is never read or written outside it (see docs/storage.md).
 * Nothing in here calls another function that takes the same lock.
 */
export function createNovelFiles(app: App, folder: string): NovelFiles {
	const snapshot = async (): Promise<FileSnapshot> => {
		const files: FileSnapshot = {};
		for (const file of app.vault.getFiles()) {
			if (isTracked(file, folder)) files[file.path] = await app.vault.read(file);
		}
		for (const path of linkedChapterPaths(files[`${folder}/${ESTRUCTURA_FILE}`], folder)) {
			// A path relative to the novel folder is already in; only outside ones are added.
			if (files[`${folder}/${path}`] !== undefined || files[path] !== undefined) continue;
			const content = await readCurrent(app, path);
			if (content !== null) files[path] = content;
		}
		return files;
	};

	const revert = async (changes: FileChange[]): Promise<RevertResult> => {
		const current: Record<string, string | null> = {};
		for (const change of changes) {
			current[change.path] = await readCurrent(app, change.path);
		}
		const plan = planRevert(changes, current);
		for (const change of plan.apply) await restore(app, change);
		return { reverted: plan.apply.length, conflicts: plan.conflicts };
	};

	return {
		snapshot: () => withEstructuraLock(folder, snapshot),
		revert: (changes) => withEstructuraLock(folder, () => revert(changes)),
	};
}
