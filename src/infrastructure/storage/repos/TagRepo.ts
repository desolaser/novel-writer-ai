import { App } from 'obsidian';
import { CollectionRepo } from '../baseRepo';
import { Tag, EntityId, nowISO } from '../../../domain';
import { genId } from '../../../utils/ids';

const repo = new CollectionRepo<Tag>('codex/tags.json', 'id_tag');

export const listTags = (app: App, fp: string) => repo.readAll(app, fp);
export const getTagById = (app: App, fp: string, id: EntityId) => repo.getById(app, fp, id);

export async function createTag(
	app: App, folderPath: string, idNovela: EntityId, nombre: string, color: string | null = null,
): Promise<Tag> {
	const item: Tag = {
		id_tag: genId(), nombre, color, id_novela: idNovela,
		created_at: nowISO(), updated_at: nowISO(),
	};
	await repo.upsert(app, folderPath, item);
	return item;
}

/** Crea (si no existe) o devuelve el Tag con el nombre dado (case-insensitive). */
export async function findOrCreateTag(app: App, folderPath: string, idNovela: EntityId, nombre: string): Promise<Tag> {
	const tags = await repo.readAll(app, folderPath);
	const existing = tags.find(t => t.nombre.toLowerCase() === nombre.trim().toLowerCase());
		const norm = nombre.trim();
	if (existing) return existing;
	return await createTag(app, folderPath, idNovela, norm, null);
}

export const updateTag = (app: App, fp: string, item: Tag) => repo.upsert(app, fp, item);
export const deleteTag = (app: App, fp: string, id: EntityId) => repo.remove(app, fp, id);