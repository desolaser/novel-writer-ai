import { App, TFolder, TAbstractFile, TFile } from 'obsidian';
import { Novela, EntityId, ISODate } from '../../../domain';
import { genId } from '../../../utils/ids';
import { createActo as dbCreateActo, createCapitulo as dbCreateCapitulo } from './EstructuraRepo';
import { nowISO } from '../../../domain/types';
import {
	NOVELA_META_FILE, NOVELA_SCHEMA_VERSION, DEFAULT_CATEGORIES,
	defaultCategoryColor,
} from '../../../constants/novel';
import {
	readJson, writeJson, ensureFolder, ensureNovelFolders, deleteFile,
	joinPath, basenameNoExt,
} from '../fsHelpers';
import { Categoria } from '../../../domain';

export interface NovelScanResult {
	novela: Novela;
	folderPath: string;
}

/** Escanea el vault buscando carpetas con __metadata.json. */
export async function scanNovels(app: App): Promise<NovelScanResult[]> {
	const out: NovelScanResult[] = [];
	const allFiles = app.vault.getFiles();
	for (const file of allFiles) {
		if (file.name !== NOVELA_META_FILE) continue;
		const meta = await readJson<Novela>(app, file.path);
		if (!meta || !meta.id_novela || typeof meta.nombre !== 'string') continue;
		out.push({ novela: meta, folderPath: file.parent?.path ?? '' });
	}
	out.sort((a, b) => (a.novela.nombre || '').localeCompare(b.novela.nombre || ''));
	return out;
}

/** Devuelve la carpeta (path) donde vive la novela con el id indicado. */
export async function findNovelFolder(app: App, idNovela: EntityId): Promise<string | null> {
	const novels = await scanNovels(app);
	const found = novels.find(n => n.novela.id_novela === idNovela);
	return found ? found.folderPath : null;
}

/** Obtiene la metadata de una novela por path de carpeta. */
export async function readNovel(app: App, folderPath: string): Promise<Novela | null> {
	return await readJson<Novela>(app, joinPath(folderPath, NOVELA_META_FILE));
}

/** Actualiza la metadata de una novela. */
export async function writeNovel(app: App, folderPath: string, novela: Novela): Promise<void> {
	novela.updated_at = nowISO();
	await writeJson(app, joinPath(folderPath, NOVELA_META_FILE), novela);
}

export async function updateNovelThumbnail(app: App, folderPath: string, novela: Novela, data: ArrayBuffer): Promise<void> {
	const thumbnail = 'images/thumbnail_novela.png';
	const path = joinPath(folderPath, thumbnail);
	const file = app.vault.getAbstractFileByPath(path);
	const bytes = Uint8Array.from(new Uint8Array(data));
	if (file instanceof TFile) await app.vault.modifyBinary(file, bytes);
	else await app.vault.createBinary(path, bytes);
	novela.thumbnail = thumbnail;
}

/** Retira una novela del índice y, opcionalmente, elimina toda su carpeta. */
export async function deleteNovel(app: App, folderPath: string, deleteFolder: boolean): Promise<void> {
	if (deleteFolder) {
		const folder = app.vault.getAbstractFileByPath(folderPath);
		if (folder instanceof TFolder) await app.vault.trash(folder, true);
		return;
	}
	await deleteFile(app, joinPath(folderPath, NOVELA_META_FILE));
}

/**
 * Crea una nueva novela en el vault: carpeta + subcarpetas + metadata
 * + categorias por defecto.
 */
export async function createNovel(
	app: App,
	nombre: string,
	autor: string = '',
	baseFolder: string = '',
	thumbnailFile: ArrayBuffer | null = null,
): Promise<{ folderPath: string; novela: Novela }> {
	const safeName = sanitizeFolderName(nombre);
	const basePath = baseFolder ? joinPath(baseFolder, safeName) : safeName;

	// Evitar colision: si existe, append -2, -3, ...
	let finalPath = basePath;
	let suffix = 2;
	while (folderTaken(app, finalPath)) {
		finalPath = `${basePath}-${suffix++}`;
	}

	await ensureNovelFolders(app, finalPath);

	const now = nowISO();
	const idNovela = genId();
	let thumbnail: string | null = null;
	if (thumbnailFile) {
		thumbnail = 'images/thumbnail_novela.png';
		const tFile = app.vault.getAbstractFileByPath(joinPath(finalPath, thumbnail)) as unknown as TFile | null;
		const bytes = Uint8Array.from(new Uint8Array(thumbnailFile));
		if (tFile) await app.vault.modifyBinary(tFile, bytes);
		else await app.vault.createBinary(joinPath(finalPath, thumbnail), bytes);
	}
	const novela: Novela = {
		id_novela: idNovela,
		nombre,
		autor,
		thumbnail,
		schema_version: NOVELA_SCHEMA_VERSION,
		created_at: now,
		updated_at: now,
	};
	await writeJson(app, joinPath(finalPath, NOVELA_META_FILE), novela);

	// Categorias por defecto
	const categorias: Categoria[] = DEFAULT_CATEGORIES.map((c) => ({
		id_categoria: genId(),
		nombre: c.nombre,
		color: defaultCategoryColor(c.nombre),
		system: true,
		id_novela: idNovela,
		created_at: now,
		updated_at: now,
	}));
	await writeJson(app, joinPath(finalPath, 'codex', 'categorias.json'), categorias);

	// Estructura default: 1 acto + 1 capitulo
	const acto = await dbCreateActo(app, finalPath, idNovela, 'Acto 1');
	const cap = await dbCreateCapitulo(app, finalPath, acto.id_acto, 'Capitulo 1', 0);
	return { folderPath: finalPath, novela };
}

function folderTaken(app: App, path: string): boolean {
	const f = app.vault.getAbstractFileByPath(path);
	return f instanceof TFolder;
}

function sanitizeFolderName(name: string): string {
	return (name || 'novela').replace(/[\\/:*?"<>|]/g, '_').trim() || 'novela';
}

export { sanitizeFolderName };
