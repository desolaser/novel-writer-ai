import { App } from 'obsidian';
import { CollectionRepo } from '../baseRepo';
import { Etiqueta, EntityId, nowISO } from '../../../domain';
import { genId } from '../../../utils/ids';

const repo = new CollectionRepo<Etiqueta>('codex/etiquetas.json', 'id_etiqueta');

export const listEtiquetas = (app: App, fp: string) => repo.readAll(app, fp);
export const getEtiquetaById = (app: App, fp: string, id: EntityId) => repo.getById(app, fp, id);

export async function createEtiqueta(
	app: App, folderPath: string, idNovela: EntityId, nombre: string, color: string,
): Promise<Etiqueta> {
	const item: Etiqueta = {
		id_etiqueta: genId(), nombre, color, id_novela: idNovela,
		created_at: nowISO(), updated_at: nowISO(),
	};
	await repo.upsert(app, folderPath, item);
	return item;
}

export const updateEtiqueta = (app: App, fp: string, item: Etiqueta) => repo.upsert(app, fp, item);
export const deleteEtiqueta = (app: App, fp: string, id: EntityId) => repo.remove(app, fp, id);