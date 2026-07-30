import { App } from 'obsidian';
import {
	EntradaCodex, DetalleValorEmbed, ReferenciaExternaEmbed, EntityId, nowISO, AiContextPolicy,
} from '../../../domain';
import { genId } from '../../../utils/ids';
import { readJson, writeJson, joinPath, listFiles, deleteFile, ensureFolder } from '../fsHelpers';

const ENTRIES_DIR = 'codex/entradas';

function entryPath(fp: string, id: EntityId) {
	return joinPath(fp, ENTRIES_DIR, `entrada_${id}.json`);
}

export function listEntryIds(app: App, folderPath: string): string[] {
	const files = listFiles(app, joinPath(folderPath, ENTRIES_DIR), '.json');
	return files
		.map(f => f.name)
		.filter(n => n.startsWith('entrada_'))
		.map(n => n.replace(/^entrada_/, '').replace(/\.json$/, ''));
}

export async function readEntry(app: App, folderPath: string, id: EntityId): Promise<EntradaCodex | null> {
	return await readJson<EntradaCodex>(app, entryPath(folderPath, id));
}

export async function listEntries(app: App, folderPath: string): Promise<EntradaCodex[]> {
	const ids = listEntryIds(app, folderPath);
	const out: EntradaCodex[] = [];
	for (const id of ids) {
		const e = await readEntry(app, folderPath, id);
		if (e) out.push(e);
	}
	return out;
}

export async function createEntry(
	app: App, folderPath: string, idNovela: EntityId, idCategoria: EntityId, nombre: string,
): Promise<EntradaCodex> {
	await ensureFolder(app, joinPath(folderPath, ENTRIES_DIR));
	const id = genId();
	const now = nowISO();
	const entry: EntradaCodex = {
		id_entrada_codex: id,
		nombre,
		alias: '',
		descripcion: '',
		notas: '',
		id_categoria: idCategoria,
		id_novela: idNovela,
		thumbnail: null,
		color: null,
		archivado: false,
		tracking_por_nombre: false,
		case_sensitive: false,
		ai_context_policy: AiContextPolicy.OnDetect,
		referencias_externas: [],
		detalles: [],
		tags: [],
		created_at: now,
		updated_at: now,
	};
	await writeJson(app, entryPath(folderPath, id), entry);
	return entry;
}

export async function writeEntry(app: App, folderPath: string, entry: EntradaCodex): Promise<void> {
	entry.updated_at = nowISO();
	await writeJson(app, entryPath(folderPath, entry.id_entrada_codex), entry);
}

export async function deleteEntry(app: App, folderPath: string, id: EntityId): Promise<void> {
	await deleteFile(app, entryPath(folderPath, id));
}

// ---- Detalles embebidos ----

export async function setDetalleValor(app: App, folderPath: string, idEntry: EntityId, idDetalle: EntityId, valor: string | null) {
	const entry = await readEntry(app, folderPath, idEntry);
	if (!entry) return;
	const now = nowISO();
	const existing = entry.detalles.find(d => d.id_detalle === idDetalle);
	if (existing) {
		existing.valor = valor;
		existing.updated_at = now;
	} else {
		const embed: DetalleValorEmbed = {
			id_entrada_codex_detalle: genId(),
			id_detalle: idDetalle, valor,
			created_at: now, updated_at: now,
		};
		entry.detalles.push(embed);
	}
	await writeEntry(app, folderPath, entry);
}

export async function removeDetalleValor(app: App, folderPath: string, idEntry: EntityId, idDetalle: EntityId) {
	const entry = await readEntry(app, folderPath, idEntry);
	if (!entry) return;
	entry.detalles = entry.detalles.filter(d => d.id_detalle !== idDetalle);
	await writeEntry(app, folderPath, entry);
}

// ---- Referencias externas embebidas ----

export async function addReferencia(app: App, folderPath: string, idEntry: EntityId, url: string) {
	const entry = await readEntry(app, folderPath, idEntry);
	if (!entry) return;
	const now = nowISO();
	const ref: ReferenciaExternaEmbed = {
		id_referencia_externa: genId(), url, created_at: now, updated_at: now,
	};
	entry.referencias_externas.push(ref);
	await writeEntry(app, folderPath, entry);
	return ref;
}

export async function removeReferencia(app: App, folderPath: string, idEntry: EntityId, idReferencia: EntityId) {
	const entry = await readEntry(app, folderPath, idEntry);
	if (!entry) return;
	entry.referencias_externas = entry.referencias_externas.filter(r => r.id_referencia_externa !== idReferencia);
	await writeEntry(app, folderPath, entry);
}

// ---- Tags N-M (embebido en entry.tags[]) ----

export async function setEntryTags(app: App, folderPath: string, idEntry: EntityId, tagIds: EntityId[]) {
	const entry = await readEntry(app, folderPath, idEntry);
	if (!entry) return;
	entry.tags = Array.from(new Set(tagIds));
	await writeEntry(app, folderPath, entry);
}