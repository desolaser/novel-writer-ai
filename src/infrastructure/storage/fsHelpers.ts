import { App, TFile, TFolder, TAbstractFile } from 'obsidian';
import { NOVELA_SUBFOLDERS } from '../../constants/novel';

/** Une paths con '/'. */
export function joinPath(...parts: string[]): string {
	return parts.filter(Boolean).join('/').replace(/\/+/g, '/');
}

/** Devuelve el nombre de archivo sin extension. */
export function basenameNoExt(path: string): string {
	const slash = path.lastIndexOf('/');
	const name = slash >= 0 ? path.slice(slash + 1) : path;
	const dot = name.lastIndexOf('.');
	return dot > 0 ? name.slice(0, dot) : name;
}

/** Verifica si un path es un archivo existente. */
export async function fileExists(app: App, path: string): Promise<boolean> {
	const f = app.vault.getAbstractFileByPath(path);
	return f instanceof TFile;
}

/** Verifica si un path es una carpeta existente. */
export function folderExists(app: App, path: string): boolean {
	const f = app.vault.getAbstractFileByPath(path);
	return f instanceof TFolder;
}

/** Lee un archivo JSON. Devuelve null si no existe. */
export async function readJson<T = any>(app: App, path: string): Promise<T | null> {
	const f = app.vault.getAbstractFileByPath(path);
	if (!(f instanceof TFile)) return null;
	const raw = await app.vault.read(f);
	try {
		return JSON.parse(raw) as T;
	} catch {
		return null;
	}
}

/** Escribe un archivo JSON (lo crea si no existe). */
export async function writeJson(app: App, path: string, data: unknown): Promise<void> {
	ensureParent(app, path);
	const f = app.vault.getAbstractFileByPath(path);
	const content = JSON.stringify(data, null, 2);
	if (f instanceof TFile) {
		await app.vault.modify(f, content);
	} else {
		await app.vault.create(path, content);
	}
}

/** Lee un archivo de texto. Devuelve null si no existe. */
export async function readText(app: App, path: string): Promise<string | null> {
	const f = app.vault.getAbstractFileByPath(path);
	if (!(f instanceof TFile)) return null;
	return await app.vault.read(f);
}

/** Escribe un archivo de texto (lo crea si no existe). */
export async function writeText(app: App, path: string, content: string): Promise<void> {
	ensureParent(app, path);
	const f = app.vault.getAbstractFileByPath(path);
	if (f instanceof TFile) {
		await app.vault.modify(f, content);
	} else {
		await app.vault.create(path, content);
	}
}

/** Crea una carpeta si no existe (recursivo limitado a Obsidian adapter). */
export async function ensureFolder(app: App, path: string): Promise<void> {
	if (folderExists(app, path)) return;
	try {
		await app.vault.createFolder(path);
	} catch {
		// Si contiene '/', intenta crear el padre primero (1 nivel).
		const parent = path.lastIndexOf('/') >= 0 ? path.slice(0, path.lastIndexOf('/')) : '';
		if (parent) {
			await ensureFolder(app, parent);
			try { await app.vault.createFolder(path); } catch {}
		}
	}
}

/** Crea el padre de un path si no existe. */
export async function ensureParent(app: App, path: string): Promise<void> {
	const slash = path.lastIndexOf('/');
	if (slash > 0) {
		const parent = path.slice(0, slash);
		await ensureFolder(app, parent);
	}
}

/** Borra un archivo si existe. */
export async function deleteFile(app: App, path: string): Promise<void> {
	const f = app.vault.getAbstractFileByPath(path);
	if (f instanceof TFile) await app.vault.trash(f, true);
}

/** Lista los archivos de una carpeta por extension. */
export function listFiles(app: App, folderPath: string, ext?: string): TFile[] {
	const folder = app.vault.getAbstractFileByPath(folderPath);
	if (!(folder instanceof TFolder)) return [];
	return folder.children.filter((c): c is TFile => {
		if (!(c instanceof TFile)) return false;
		if (!ext) return true;
		return c.path.endsWith(ext);
	});
}

/** Crea la estructura de subcarpetas de una novela. */
export async function ensureNovelFolders(app: App, basePath: string): Promise<void> {
	await ensureFolder(app, basePath);
	for (const sub of NOVELA_SUBFOLDERS) {
		await ensureFolder(app, joinPath(basePath, sub));
	}
	await ensureFolder(app, joinPath(basePath, 'codex', 'entradas'));
}