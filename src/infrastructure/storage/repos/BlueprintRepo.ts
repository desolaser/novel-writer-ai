import { App } from 'obsidian';
import { EntityId, NovelBlueprint, createEmptyBlueprint, nowISO } from '../../../domain';
import { joinPath, readJson, writeJson } from '../fsHelpers';

const FILE = 'escritura/blueprint.json';

/** Blueprint of the novel, or null when it was never configured. */
export async function readBlueprint(app: App, folderPath: string): Promise<NovelBlueprint | null> {
	const data = await readJson<NovelBlueprint>(app, joinPath(folderPath, FILE));
	if (!data || typeof data !== 'object') return null;
	// Merge over an empty blueprint so a file written by an older version keeps working.
	return { ...createEmptyBlueprint(data.id_novela ?? ''), ...data };
}

export async function writeBlueprint(app: App, folderPath: string, blueprint: NovelBlueprint): Promise<void> {
	await writeJson(app, joinPath(folderPath, FILE), { ...blueprint, updated_at: nowISO() });
}

/** Existing blueprint, or a fresh one that is not written to disk yet. */
export async function readOrCreateBlueprint(
	app: App,
	folderPath: string,
	idNovela: EntityId,
	title: string,
): Promise<NovelBlueprint> {
	return (await readBlueprint(app, folderPath)) ?? createEmptyBlueprint(idNovela, title);
}
