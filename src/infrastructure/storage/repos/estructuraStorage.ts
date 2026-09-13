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

export async function readEstructuraFile(app: App, fp: string): Promise<EstructuraFile> {
	const d = await readJson<EstructuraFile>(app, joinPath(fp, ESTRUCTURA_FILE));
	return { actos: d?.actos ?? [], capitulos: d?.capitulos ?? [] };
}

export async function writeEstructuraFile(app: App, fp: string, data: EstructuraFile) {
	await writeJson(app, joinPath(fp, ESTRUCTURA_FILE), data);
}
