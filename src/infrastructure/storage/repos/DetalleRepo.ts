import { App } from 'obsidian';
import { readJson, writeJson, joinPath } from '../fsHelpers';
import { Detalle, OpcionDetalle, DetalleCategoria, EntityId, nowISO, TipoDetalle } from '../../../domain';
import { genId } from '../../../utils/ids';

interface DetallesFile {
	detalles: Detalle[];
	opciones: OpcionDetalle[];
	detalle_categorias: DetalleCategoria[];
}

const FILE = 'codex/detalles.json';

async function readFile(app: App, fp: string): Promise<DetallesFile> {
	const d = await readJson<Partial<DetallesFile>>(app, joinPath(fp, FILE));
	return {
		detalles: d?.detalles ?? [],
		opciones: d?.opciones ?? [],
		detalle_categorias: d?.detalle_categorias ?? [],
	};
}

async function writeFile(app: App, fp: string, data: DetallesFile) {
	await writeJson(app, joinPath(fp, FILE), data);
}

export async function listDetalles(app: App, fp: string): Promise<Detalle[]> {
	return (await readFile(app, fp)).detalles;
}

export async function listAllDetallesExtended(app: App, fp: string): Promise<DetallesFile> {
	return readFile(app, fp);
}

export async function getDetalleById(app: App, fp: string, id: EntityId): Promise<Detalle | null> {
	return (await readFile(app, fp)).detalles.find(d => d.id_detalle === id) ?? null;
}

export async function createDetalle(
	app: App, folderPath: string, idNovela: EntityId,
	nombre: string, tipo: TipoDetalle, incluirIa = true,
): Promise<Detalle> {
	const item: Detalle = {
		id_detalle: genId(), nombre, tipo_detalle: tipo, incluir_ia: incluirIa,
		id_novela: idNovela, created_at: nowISO(), updated_at: nowISO(),
	};
	const data = await readFile(app, folderPath);
	data.detalles.push(item);
	await writeFile(app, folderPath, data);
	return item;
}

export async function updateDetalle(app: App, fp: string, item: Detalle) {
	const data = await readFile(app, fp);
	const idx = data.detalles.findIndex(d => d.id_detalle === item.id_detalle);
	item.updated_at = nowISO();
	if (idx >= 0) data.detalles[idx] = item; else data.detalles.push(item);
	await writeFile(app, fp, data);
}

export async function deleteDetalle(app: App, fp: string, id: EntityId) {
	const data = await readFile(app, fp);
	data.detalles = data.detalles.filter(d => d.id_detalle !== id);
	data.opciones = data.opciones.filter(o => o.id_detalle !== id);
	data.detalle_categorias = data.detalle_categorias.filter(dc => dc.id_detalle !== id);
	await writeFile(app, fp, data);
}

// ---- Opciones ----

export async function listOpcionesByDetalle(app: App, fp: string, idDetalle: EntityId): Promise<OpcionDetalle[]> {
	const data = await readFile(app, fp);
	return data.opciones
		.filter(o => o.id_detalle === idDetalle)
		.sort((a, b) => a.orden - b.orden);
}

export async function upsertOpcion(app: App, fp: string, item: OpcionDetalle) {
	const data = await readFile(app, fp);
	const idx = data.opciones.findIndex(o => o.id_opcion_detalle === item.id_opcion_detalle);
	item.updated_at = nowISO();
	if (idx >= 0) data.opciones[idx] = item; else {
		if (!item.created_at) item.created_at = nowISO();
		data.opciones.push(item);
	}
	await writeFile(app, fp, data);
}

export async function deleteOpcion(app: App, fp: string, id: EntityId) {
	const data = await readFile(app, fp);
	data.opciones = data.opciones.filter(o => o.id_opcion_detalle !== id);
	await writeFile(app, fp, data);
}

export function createOpcion(idDetalle: EntityId, nombre: string, color: string, orden: number): OpcionDetalle {
	return {
		id_opcion_detalle: genId(), nombre, color, orden, id_detalle: idDetalle,
		created_at: nowISO(), updated_at: nowISO(),
	};
}

// ---- DetalleCategoria (N-M) ----

export async function listDetalleCategorias(app: App, fp: string): Promise<DetalleCategoria[]> {
	return (await readFile(app, fp)).detalle_categorias;
}

export async function setDetalleCategorias(app: App, fp: string, idDetalle: EntityId, idCategorias: EntityId[]) {
	const data = await readFile(app, fp);
	data.detalle_categorias = data.detalle_categorias.filter(dc => dc.id_detalle !== idDetalle);
	const now = nowISO();
	for (const idCat of idCategorias) {
		data.detalle_categorias.push({
			id_detalle_categoria: genId(), id_detalle: idDetalle, id_categoria: idCat,
			created_at: now, updated_at: now,
		});
	}
	await writeFile(app, fp, data);
}

export async function getCategoriasByDetalle(app: App, fp: string, idDetalle: EntityId): Promise<EntityId[]> {
	const data = await readFile(app, fp);
	return data.detalle_categorias.filter(dc => dc.id_detalle === idDetalle).map(dc => dc.id_categoria);
}

export async function getDetallesByCategoria(app: App, fp: string, idCategoria: EntityId): Promise<Detalle[]> {
	const data = await readFile(app, fp);
	const ids = data.detalle_categorias.filter(dc => dc.id_categoria === idCategoria).map(dc => dc.id_detalle);
	return data.detalles.filter(d => ids.includes(d.id_detalle));
}