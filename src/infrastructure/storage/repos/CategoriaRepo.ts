import { App } from 'obsidian';
import { CollectionRepo } from '../baseRepo';
import { Categoria, EntityId, nowISO } from '../../../domain';
import { genId } from '../../../utils/ids';
import { defaultCategoryColor } from '../../../constants/novel';

const repo = new CollectionRepo<Categoria>('codex/categorias.json', 'id_categoria');

export async function listCategorias(app: App, folderPath: string): Promise<Categoria[]> {
	return repo.readAll(app, folderPath);
}

export function getCategoriaById(app: App, folderPath: string, id: EntityId) {
	return repo.getById(app, folderPath, id);
}

/** Crea una categoria custom. NO usar para las default (las crea createNovel). */
export async function createCategoria(
	app: App, folderPath: string, idNovela: EntityId, nombre: string, color: string,
): Promise<Categoria> {
	const item: Categoria = {
		id_categoria: genId(),
		nombre,
		color,
		system: false,
		id_novela: idNovela,
		created_at: nowISO(),
		updated_at: nowISO(),
	};
	await repo.upsert(app, folderPath, item);
	return item;
}

/** Edita una categoria existente. Las system no son borrables pero si editables (color/nombre). */
export async function updateCategoria(app: App, folderPath: string, item: Categoria) {
	return repo.upsert(app, folderPath, item);
}

export async function deleteCategoria(app: App, folderPath: string, id: EntityId) {
	const cats = await repo.readAll(app, folderPath);
	const cat = cats.find(c => c.id_categoria === id);
	// no se puede borrar una categoria system
	if (cat?.system) throw new Error('Las categorias por defecto no se pueden eliminar.');
	await repo.remove(app, folderPath, id);
}

/** Garantiza la existencia de las 6 categorias por defecto para una novela.
 *  Idempotente: las crea solo si no existen (por nombre, case-insensitive). */
export async function ensureDefaultCategorias(app: App, folderPath: string, idNovela: EntityId): Promise<void> {
	const cats = await repo.readAll(app, folderPath);
	const now = nowISO();
	for (const def of getDefaultCategoriaDefs()) {
		const exists = cats.find(c => c.nombre.toLowerCase() === def.nombre.toLowerCase());
		if (!exists) {
			cats.push({
				id_categoria: genId(),
				nombre: def.nombre,
				color: defaultCategoryColor(def.nombre),
				system: true,
				id_novela: idNovela,
				created_at: now,
				updated_at: now,
			});
		}
	}
	await repo.writeAll(app, folderPath, cats);
}

function getDefaultCategoriaDefs() {
	return [
		{ nombre: 'Personajes' }, { nombre: 'Ubicaciones' }, { nombre: 'Objetos' },
		{ nombre: 'Lore' }, { nombre: 'Subplot' }, { nombre: 'Otros' },
	];
}