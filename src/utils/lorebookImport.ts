import { App, TFile, TFolder, Notice } from 'obsidian';
import * as yaml from 'js-yaml';
import { EntradaCodex, EntityId, nowISO, AiContextPolicy } from '../domain';
import { genId } from './ids';
import { readText, writeJson, joinPath, ensureFolder } from '../infrastructure/storage/fsHelpers';
import { defaultCategoryColor } from '../constants/novel';
import { listCategorias } from '../infrastructure/storage/repos/CategoriaRepo';

/**
 * Importacion del lorebook legacy (carpeta con .md's con frontmatter keys).
 * Cada subcarpeta se convierte en una categoria (si matchea por nombre con
 * una existente, se reusa). Los archivos sueltos en la raiz van a "Otros".
 *
 * El caller decide que subcarpetas importar (UI del modal en Fase 2). Las
 * subcarpetas desmarcadas NO se importan (ni se crea su categoria).
 */

interface LorebookMeta {
	keys: string[];
	enabled: boolean;
	alwaysOn: boolean;
}

function parseLegacyMeta(content: string): { meta: LorebookMeta; body: string } {
	const match = content.match(/^---\s*([\s\S]*?)---/);
	if (!match) return { meta: { keys: [], enabled: true, alwaysOn: false }, body: content };
	let keys: string[] = [];
	let enabled = true;
	let alwaysOn = false;
	try {
		const fm: any = yaml.load(match[1]);
		if (fm) {
			if (Array.isArray(fm['keys'])) keys = fm['keys'].map((k: any) => String(k));
			else if (typeof fm['keys'] === 'string') keys = fm['keys'].split(/[,\n]/).map((key: string) => key.trim()).filter(Boolean);
			if (typeof fm['enabled'] === 'boolean') enabled = fm['enabled'];
			if (typeof fm['alwaysOn'] === 'boolean') alwaysOn = fm['alwaysOn'];
		}
	} catch { /* ignore parse errors */ }
	const body = content.replace(/^---[\s\S]*?---\s*/, '');
	return { meta: { keys, enabled, alwaysOn }, body };
}

function policyFromLegacy(meta: LorebookMeta): AiContextPolicy {
	if (meta.alwaysOn) return AiContextPolicy.Always;
	if (meta.enabled === false) return AiContextPolicy.Never;
	return AiContextPolicy.OnDetect;
}

export interface ImportableSubfolder {
	name: string;
	path: string;
	/** Archivos .md dentro, recolectados recursivamente. */
	files: TFile[];
	count: number;
}

export interface ImportPlan {
	/** Subcarpetas encontradas bajo la carpeta de lorebook. */
	subfolders: ImportableSubfolder[];
	/** Archivos sueltos .md en la raiz del lorebook folder. */
	rootFiles: TFile[];
	folder: string;
}

/** Escanea la carpeta de lorebook legacy preparando el plan de importacion. */
export async function prepareImport(app: App, lorebookFolder: string): Promise<ImportPlan> {
	const root = app.vault.getAbstractFileByPath(lorebookFolder);
	if (!(root instanceof TFolder)) {
		new Notice(`Lorebook folder not found: ${lorebookFolder}`);
		return { subfolders: [], rootFiles: [], folder: lorebookFolder };
	}
	const subfolders: ImportableSubfolder[] = [];
	const rootFiles: TFile[] = [];
	for (const child of root.children) {
		if (child instanceof TFolder) {
			const files = collectMdRecursive(app, child);
			subfolders.push({ name: child.name, path: child.path, files, count: files.length });
		} else if (child instanceof TFile && child.path.endsWith('.md')) {
			rootFiles.push(child);
		}
	}
	return { subfolders, rootFiles, folder: lorebookFolder };
}

function collectMdRecursive(app: App, folder: TFolder): TFile[] {
	const out: TFile[] = [];
	for (const c of folder.children) {
		if (c instanceof TFile && c.path.endsWith('.md')) out.push(c);
		else if (c instanceof TFolder) out.push(...collectMdRecursive(app, c));
	}
	return out;
}

/** Busca una categoria existente por nombre (case-insensitive). */
export function findExistingCategoria<T extends { nombre: string }>(cats: T[], nombre: string): T | undefined {
	return cats.find(c => c.nombre.toLowerCase() === nombre.trim().toLowerCase());
}

/** Lista las categorias ya existentes en la novela, para que el caller arme el plan editable. */
export async function listExistingCategorias(app: App, novelFolderPath: string) {
	return listCategorias(app, novelFolderPath);
}

export interface ImportGroupEntry {
	file: TFile;
	/** Nombre final de la entrada de codex, editable por el autor en el modal de revision. */
	nombre: string;
}

export interface ImportGroup {
	/** Nombre de la categoria a crear. Ignorado si existingCategoriaId esta seteado. */
	nombre: string;
	/** Si esta seteado, los archivos se importan en esta categoria existente en vez de crear una nueva. */
	existingCategoriaId?: EntityId;
	entries: ImportGroupEntry[];
}

/**
 * Ejecuta la importacion dentro de una novela existente, usando los grupos
 * (categoria -> archivos) que el usuario confirmo en el modal de revision.
 */
export async function runImportGrouped(
	app: App,
	novelFolderPath: string,
	idNovela: EntityId,
	groups: ImportGroup[],
): Promise<{ entradas: number; categoriasCreadas: number }> {
	let entradas = 0;
	let categoriasCreadas = 0;
	const cats = await listCategorias(app, novelFolderPath);
	const now = nowISO();

	async function resolveCategoria(group: ImportGroup): Promise<EntityId> {
		if (group.existingCategoriaId) return group.existingCategoriaId;
		const nombre = group.nombre.trim() || 'Others';
		const existing = findExistingCategoria(cats, nombre);
		if (existing) return existing.id_categoria;
		const id = genId();
		cats.push({
			id_categoria: id, nombre, color: defaultCategoryColor(nombre),
			system: false, id_novela: idNovela, created_at: now, updated_at: now,
		});
		categoriasCreadas++;
		return id;
	}

	async function importFile(file: TFile, nombre: string, idCategoria: EntityId) {
		const content = await readText(app, file.path) ?? '';
		const { meta, body } = parseLegacyMeta(content);
		const entry: EntradaCodex = {
			id_entrada_codex: genId(),
			nombre,
			alias: meta.keys.join(', '),
			descripcion: body.trim(),
			first_message: '',
			notas: '',
			id_categoria: idCategoria,
			id_novela: idNovela,
			thumbnail: null,
			color: null,
			archivado: false,
			tracking_por_nombre: meta.keys.length > 0,
			case_sensitive: false,
			ai_context_policy: policyFromLegacy(meta),
			referencias_externas: [],
			detalles: [],
			tags: [],
			created_at: now,
			updated_at: now,
		};
		await writeJson(app, joinPath(novelFolderPath, 'codex', 'entradas', `entrada_${entry.id_entrada_codex}.json`), entry);
		entradas++;
	}

	await ensureFolder(app, joinPath(novelFolderPath, 'codex', 'entradas'));

	for (const group of groups) {
		if (group.entries.length === 0) continue;
		const idCategoria = await resolveCategoria(group);
		for (const entry of group.entries) {
			await importFile(entry.file, entry.nombre.trim() || entry.file.basename, idCategoria);
		}
	}

	// Reescribir categorias.json con las nuevas creadas (preserva las existentes)
	await writeJson(app, joinPath(novelFolderPath, 'codex', 'categorias.json'), cats);

	return { entradas, categoriasCreadas };
}
