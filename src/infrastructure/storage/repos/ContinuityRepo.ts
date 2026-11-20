import { App, TFile } from 'obsidian';
import type { EntityId } from '../../../domain';
import type { ChapterContinuity, ContinuityFile } from '../../../types/Continuity';
import {
	emptyChapterContinuity,
	emptyContinuityFile,
} from '../../../utils/storyFacts';
import { ensureParent, joinPath } from '../fsHelpers';
import { withFileLock } from '../fileLock';

/**
 * `escritura/continuity.json`: the facts of each chapter and its last
 * continuity report. Every change is read, applied and written inside
 * `withFileLock`, like the chat files.
 */

export const CONTINUITY_FILE = 'escritura/continuity.json';

type Listener = (novelFolder: string) => void;
const listeners = new Set<Listener>();

/** Called after every write, so open views can reload. Returns an unsubscribe. */
export function onContinuityChange(listener: Listener): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

function continuityPath(folder: string): string {
	return joinPath(folder, CONTINUITY_FILE);
}

/**
 * Reads the file. A missing file is an empty ledger; a damaged one throws,
 * so nothing writes an empty ledger over facts that can still be recovered.
 */
async function readFile(app: App, folder: string): Promise<ContinuityFile> {
	const path = continuityPath(folder);
	const file = app.vault.getAbstractFileByPath(path);
	if (!(file instanceof TFile)) return emptyContinuityFile();
	const raw = await app.vault.read(file);
	try {
		const parsed = JSON.parse(raw) as ContinuityFile;
		return { version: 1, chapters: parsed?.chapters ?? {} };
	} catch {
		throw new Error(`${path} is damaged; fix or delete it to check continuity.`);
	}
}

async function writeFile(app: App, folder: string, data: ContinuityFile) {
	const path = continuityPath(folder);
	await ensureParent(app, path);
	const content = JSON.stringify(data, null, 2);
	const file = app.vault.getAbstractFileByPath(path);
	if (file instanceof TFile) {
		await app.vault.modify(file, content);
	} else {
		await app.vault.create(path, content);
	}
}

export async function readContinuity(app: App, folder: string): Promise<ContinuityFile> {
	return withFileLock(continuityPath(folder), () => readFile(app, folder));
}

/**
 * Changes one chapter's entry against the file as it is now; returns the
 * entry written.
 */
export async function updateChapterContinuity(
	app: App,
	folder: string,
	chapterId: EntityId,
	change: (entry: ChapterContinuity) => ChapterContinuity,
): Promise<ChapterContinuity> {
	const updated = await withFileLock(continuityPath(folder), async () => {
		const data = await readFile(app, folder);
		const entry = change(data.chapters[chapterId] ?? emptyChapterContinuity());
		data.chapters[chapterId] = entry;
		await writeFile(app, folder, data);
		return entry;
	});
	for (const listener of listeners) listener(folder);
	return updated;
}

/** Drops the entries of chapters that no longer exist. */
export async function pruneContinuity(
	app: App,
	folder: string,
	chapterIds: EntityId[],
): Promise<void> {
	const keep = new Set(chapterIds);
	await withFileLock(continuityPath(folder), async () => {
		const data = await readFile(app, folder);
		const gone = Object.keys(data.chapters).filter((id) => !keep.has(id));
		if (!gone.length) return;
		for (const id of gone) delete data.chapters[id];
		await writeFile(app, folder, data);
	});
}
