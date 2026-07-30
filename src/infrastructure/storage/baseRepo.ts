import { App } from 'obsidian';
import { readJson, writeJson, joinPath } from './fsHelpers';
import { nowISO } from '../../domain/types';

/**
 * Repositorio generico para una coleccion de entidades guardadas en un unico
 * archivo JSON dentro de la carpeta de la novela (ej: categorias.json).
 * Sirve para: categorias, etiquetas, tags, detalles, estructura narrativa.
 */
export class CollectionRepo<T> {
	constructor(
		private relPath: string, // relativo a la carpeta de la novela, ej 'codex/categorias.json'
		private idField: string, // nombre del campo id, ej 'id_categoria'
	) {}

	async readAll(app: App, folderPath: string): Promise<T[]> {
		const data = await readJson<T[]>(app, joinPath(folderPath, this.relPath));
		return Array.isArray(data) ? data : [];
	}

	async writeAll(app: App, folderPath: string, items: T[]): Promise<void> {
		await writeJson(app, joinPath(folderPath, this.relPath), items);
	}

	async upsert(app: App, folderPath: string, item: T): Promise<T> {
		const items = await this.readAll(app, folderPath);
		const idx = items.findIndex((i) => (i as any)[this.idField] === (item as any)[this.idField]);
		(item as any).updated_at = nowISO();
		if (idx >= 0) items[idx] = item;
		else {
			if (!(item as any).created_at) (item as any).created_at = nowISO();
			items.push(item);
		}
		await this.writeAll(app, folderPath, items);
		return item;
	}

	async remove(app: App, folderPath: string, id: string): Promise<void> {
		const items = await this.readAll(app, folderPath);
		const next = items.filter((i) => (i as any)[this.idField] !== id);
		await this.writeAll(app, folderPath, next);
	}

	async getById(app: App, folderPath: string, id: string): Promise<T | null> {
		const items = await this.readAll(app, folderPath);
		return items.find((i) => (i as any)[this.idField] === id) ?? null;
	}
}