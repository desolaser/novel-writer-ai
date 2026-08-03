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
	/** Cantidad de archivos .md dentro (recursivo plano 1 nivel). */
	count: number;
}

export interface ImportPlan {
	/** Subcarpetas que el usuario marco. El caller decide el checked inicial. */
	subfolders: ImportableSubfolder[];
	/** Archivos sueltos .md en la raiz del lorebook folder. */
	rootFiles: TFile[];
	folder: string;
}

/** Escanea la carpeta de lorebook legacy preparando el plan de importacion. */
export async function prepareImport(app: App, lorebookFolder: string): Promise<ImportPlan> {
	const root = app.vault.getAbstractFileByPath(lorebookFolder);
	if (!(root instanceof TFolder)) {
		new Notice(`Carpeta de lorebook no encontrada: ${lorebookFolder}`);
		return { subfolders: [], rootFiles: [], folder: lorebookFolder };
	}
	const subfolders: ImportableSubfolder[] = [];
	const rootFiles: TFile[] = [];
	for (const child of root.children) {
		if (child instanceof TFolder) {
			const mdCount = countMdRecursive(app, child);
			subfolders.push({ name: child.name, path: child.path, count: mdCount });
		} else if (child instanceof TFile && child.path.endsWith('.md')) {
			rootFiles.push(child);
		}
	}
	return { subfolders, rootFiles, folder: lorebookFolder };
}

function countMdRecursive(app: App, folder: TFolder): number {
	let n = 0;
	for (const c of folder.children) {
		if (c instanceof TFile && c.path.endsWith('.md')) n++;
		else if (c instanceof TFolder) n += countMdRecursive(app, c);
	}
	return n;
}

/**
 * Ejecuta la importacion dentro de una novela existente (carpeta de novela ya
 * creada con sus categorias default).
 *
 * @param selectedSubfolders Nombres de subcarpetas a importar (las otras se ignoran).
 * @param importCategoriesFromMatch Si una subcarpeta matchea con categoria
 *   existente (por nombre, case-insensitive), reusa esa categoria. Si no
 *   matchea, la crea solo si la subcarpeta esta en selectedSubfolders.
 */
export async function runImport(
	app: App,
	novelFolderPath: string,
	idNovela: EntityId,
	plan: ImportPlan,
	selectedSubfolders: string[],
): Promise<{ entradas: number; categoriasCreadas: number }> {
	let entradas = 0;
	let categoriasCreadas = 0;
	const cats = await listCategorias(app, novelFolderPath);
	const now = nowISO();

	// helper para obtener o crear categoria por nombre
	async function getOrCreateCategoria(nombreOrPath: string): Promise<EntityId> {
		const nombre = nombreOrPath.includes('/') ? nombreOrPath.split('/').pop()! : nombreOrPath;
		const existing = cats.find(c => c.nombre.toLowerCase() === nombre.toLowerCase());
		if (existing) return existing.id_categoria;
		const id = genId();
		cats.push({
			id_categoria: id, nombre, color: defaultCategoryColor(nombre),
			system: false, id_novela: idNovela, created_at: now, updated_at: now,
		});
		categoriasCreadas++;
		return id;
	}

	const otrosCat = cats.find(c => c.nombre.toLowerCase() === 'otros');
	const idOtros = otrosCat?.id_categoria ?? await getOrCreateCategoria('Otros');

	async function importFile(file: TFile, idCategoria: EntityId) {
		const content = await readText(app, file.path) ?? '';
		const { meta, body } = parseLegacyMeta(content);
		const entry: EntradaCodex = {
			id_entrada_codex: genId(),
			nombre: file.basename,
			alias: meta.keys.join(', '),
			descripcion: body.trim(),
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

	// 1. Archivos sueltos en la raiz -> Otros
	for (const file of plan.rootFiles) {
		await importFile(file, idOtros);
	}

	// 2. Subcarpetas seleccionadas
	const selected = new Set(selectedSubfolders.map(s => s.toLowerCase()));
	for (const sub of plan.subfolders) {
		if (!selected.has(sub.name.toLowerCase())) continue;
		const idCat = await getOrCreateCategoria(sub.name);
		const subFolder = app.vault.getAbstractFileByPath(sub.path);
		if (!(subFolder instanceof TFolder)) continue;
		const allFiles = collectMdRecursive(app, subFolder);
		for (const file of allFiles) {
			await importFile(file, idCat);
		}
	}

	// Reescribir categorias.json con las nuevas creadas (preserva las existentes)
	const { writeJson: wj } = await import('../infrastructure/storage/fsHelpers');
	await wj(app, joinPath(novelFolderPath, 'codex', 'categorias.json'), cats);

	return { entradas, categoriasCreadas };
}

function collectMdRecursive(app: App, folder: TFolder): TFile[] {
	const out: TFile[] = [];
	for (const c of folder.children) {
		if (c instanceof TFile && c.path.endsWith('.md')) out.push(c);
		else if (c instanceof TFolder) out.push(...collectMdRecursive(app, c));
	}
	return out;
}
