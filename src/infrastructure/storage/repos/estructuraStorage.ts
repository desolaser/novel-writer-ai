import { App } from 'obsidian';
import { Acto, Capitulo } from '../../../domain';
import { readJson, writeJson, joinPath } from '../fsHelpers';

/** Raw JSON storage for a novel's acts/chapters. Shared by `EstructuraRepo` (data
 * CRUD) and `chapterFiles` (manuscript file materialization) so neither has to
 * depend on the other for reading or writing this file. */
export const ESTRUCTURA_FILE = 'escritura/estructura.json';

export interface EstructuraFile {
	actos: Acto[];
	capitulos: Capitulo[];
}

/** Tail of the queue of structure operations, per novel folder. */
const queues = new Map<string, Promise<unknown>>();

/**
 * Runs `task` once every earlier task for the same novel has finished.
 *
 * Every change to the structure file reads the whole JSON, patches it and
 * writes it back. Two of those overlapping (the act summary and a chapter
 * outline saving at once, or the chat tools writing while the author types)
 * made the later write drop the earlier one. Reads go through here too, so
 * they never see the file halfway through a write.
 *
 * `task` must not call another locked function for the same novel: it would
 * wait for itself forever. Keep slow work like vault scans outside of it.
 */
export function withEstructuraLock<T>(fp: string, task: () => Promise<T>): Promise<T> {
	const previous = queues.get(fp) ?? Promise.resolve();
	const run = previous.then(task);
	// The queue only orders tasks; a failed one must not block the next.
	const tail = run.catch(() => undefined);
	queues.set(fp, tail);
	void tail.then(() => {
		if (queues.get(fp) === tail) queues.delete(fp);
	});
	return run;
}

/** Raw read; call it inside `withEstructuraLock` when the result is written back. */
export async function readEstructuraFile(app: App, fp: string): Promise<EstructuraFile> {
	const d = await readJson<EstructuraFile>(app, joinPath(fp, ESTRUCTURA_FILE));
	return { actos: d?.actos ?? [], capitulos: d?.capitulos ?? [] };
}

/** Raw write; only call it inside `withEstructuraLock`. */
export async function writeEstructuraFile(app: App, fp: string, data: EstructuraFile) {
	await writeJson(app, joinPath(fp, ESTRUCTURA_FILE), data);
}
