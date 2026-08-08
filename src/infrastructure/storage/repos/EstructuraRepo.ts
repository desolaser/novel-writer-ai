import { App } from 'obsidian';
import { TFile } from 'obsidian';
import { Acto, Capitulo, EntityId, nowISO } from '../../../domain';
import { genId } from '../../../utils/ids';
import { readJson, writeJson, joinPath, ensureFolder, readText, writeText } from '../fsHelpers';

const FILE = 'escritura/estructura.json';

interface EstructuraFile {
	actos: Acto[];
	capitulos: Capitulo[];
}

const EMPTY: EstructuraFile = { actos: [], capitulos: [] };

async function readFile(app: App, fp: string): Promise<EstructuraFile> {
	const d = await readJson<EstructuraFile>(app, joinPath(fp, FILE));
	return { actos: d?.actos ?? [], capitulos: d?.capitulos ?? [] };
}

async function writeFile(app: App, fp: string, data: EstructuraFile) {
	await writeJson(app, joinPath(fp, FILE), data);
}

// ---- Actos ----

export async function listActos(app: App, fp: string): Promise<Acto[]> {
	return (await readFile(app, fp)).actos.sort((a, b) => a.orden - b.orden);
}

export async function createActo(app: App, folderPath: string, idNovela: EntityId, nombre: string): Promise<Acto> {
	const data = await readFile(app, folderPath);
	const orden = data.actos.length;
	const acto: Acto = {
		id_acto: genId(), nombre, orden, id_novela: idNovela,
		created_at: nowISO(), updated_at: nowISO(),
	};
	data.actos.push(acto);
	await writeFile(app, folderPath, data);
	return acto;
}

export async function updateActo(app: App, fp: string, id: EntityId, patch: Partial<Acto>) {
	const data = await readFile(app, fp);
	const a = data.actos.find(x => x.id_acto === id);
	if (a) Object.assign(a, patch, { updated_at: nowISO() });
	await writeFile(app, fp, data);
}

export async function deleteActo(app: App, fp: string, id: EntityId) {
	const data = await readFile(app, fp);
	const caps = data.capitulos.filter(c => c.id_acto === id);
	if (caps.length > 0) throw new Error('El acto aun contiene capitulos. Mueve o borralos primero.');
	data.actos = data.actos.filter(a => a.id_acto !== id);
	await writeFile(app, fp, data);
}

// ---- Capitulos ----

export async function listCapitulosByActo(app: App, fp: string, idActo: EntityId): Promise<Capitulo[]> {
	const data = await readFile(app, fp);
	return data.capitulos.filter(c => c.id_acto === idActo).sort((a, b) => a.orden - b.orden);
}

export async function listCapitulos(app: App, fp: string): Promise<Capitulo[]> {
	const data = await readFile(app, fp);
	return data.capitulos.sort((a, b) => a.orden - b.orden);
}

export async function createCapitulo(app: App, folderPath: string, idActo: EntityId, nombre: string, orden: number): Promise<Capitulo> {
	const data = await readFile(app, folderPath);
	const cap: Capitulo = {
		id_capitulo: genId(), nombre, outline: '', archivo: null, id_acto: idActo, orden,
		created_at: nowISO(), updated_at: nowISO(),
	};
	data.capitulos.push(cap);
	await writeFile(app, folderPath, data);
	return cap;
}

export async function updateCapitulo(app: App, fp: string, id: EntityId, patch: Partial<Capitulo>) {
	const data = await readFile(app, fp);
	const c = data.capitulos.find(x => x.id_capitulo === id);
	if (c) Object.assign(c, patch, { updated_at: nowISO() });
	await writeFile(app, fp, data);
}

export async function deleteCapitulo(app: App, fp: string, id: EntityId) {
	const data = await readFile(app, fp);
	data.capitulos = data.capitulos.filter(c => c.id_capitulo !== id);
	await writeFile(app, fp, data);
}

/** Crea el manuscrito del capítulo si aún no existe. */
export async function ensureCapituloArchivo(app: App, folderPath: string, id: EntityId, targetFolder?: string): Promise<string | null> {
	const data = await readFile(app, folderPath);
	const cap = data.capitulos.find(x => x.id_capitulo === id);
	if (!cap) return null;
	const acto = data.actos.find(x => x.id_acto === cap.id_acto);
	let changed = false;
	if (!cap.archivo) {
		cap.archivo = targetFolder ? joinPath(targetFolder, `capitulo_${id}.md`) : joinPath('escritura', 'capitulos', `capitulo_${id}.md`);
		changed = true;
	}
	const fullPath = resolveChapterPath(folderPath, cap.archivo);
	await ensureFolder(app, targetFolder ? targetFolder : joinPath(folderPath, 'escritura', 'capitulos'));
	if (!(await readText(app, fullPath))) {
		await writeText(app, fullPath, `---\nnovel_writer_type: chapter\nnovel_writer_novel_id: "${acto?.id_novela ?? ''}"\nnovel_writer_chapter_id: "${cap.id_capitulo}"\nnovel_writer_status: draft\n---\n\n`);
	}
	if (changed) await writeFile(app, folderPath, data);
	return cap.archivo;
}

export async function writeCapituloTexto(app: App, folderPath: string, id: EntityId, content: string): Promise<string | null> {
	const path = await ensureCapituloArchivo(app, folderPath, id);
	if (!path) return null;
	const fullPath = resolveChapterPath(folderPath, path);
	const file = app.vault.getAbstractFileByPath(fullPath);
	if (!(file instanceof TFile)) return null;
	// Use vault.process() for atomic read-modify-write to avoid corrupting
	// the editor state when the chapter file is open in an Obsidian pane.
	await app.vault.process(file, (raw) => {
		const front = raw.match(/^---[\s\S]*?---/i)?.[0] ?? '';
		return `${front}\n\n${content}`;
	});
	return path;
}

export async function readCapituloTexto(app: App, folderPath: string, id: EntityId): Promise<string> {
	const data = await readFile(app, folderPath); const cap = data.capitulos.find(x => x.id_capitulo === id);
	if (!cap?.archivo) return '';
	const raw = await readText(app, resolveChapterPath(folderPath, cap.archivo)) ?? '';
	return raw.replace(/^---[\s\S]*?---\s*/, '').trim();
}

export async function linkCapituloArchivo(app: App, folderPath: string, id: EntityId, vaultPath: string): Promise<void> {
	const data = await readFile(app, folderPath); const cap = data.capitulos.find(x => x.id_capitulo === id); if (!cap) return;
	cap.archivo = vaultPath; await writeFile(app, folderPath, data);
	const file = app.vault.getAbstractFileByPath(vaultPath); if (!(file instanceof TFile)) return;
	const raw = await app.vault.read(file); const acto = data.actos.find(x => x.id_acto === cap.id_acto);
	const metadata = `novel_writer_type: chapter\nnovel_writer_novel_id: "${acto?.id_novela ?? ''}"\nnovel_writer_chapter_id: "${cap.id_capitulo}"\nnovel_writer_status: linked`;
	const next = raw.match(/^---[\s\S]*?---/) ? raw.replace(/^---[\s\S]*?---/, `---\n${metadata}\n---`) : `---\n${metadata}\n---\n\n${raw}`;
	await app.vault.modify(file, next);
}

/** Reconciles paths after users move linked Markdown files in the vault. */
export async function reconcileCapituloArchivos(app: App, folderPath: string): Promise<void> {
	const data = await readFile(app, folderPath); const byId = new Map<string, string>();
	for (const file of app.vault.getMarkdownFiles()) {
		const raw = await app.vault.read(file); const match = raw.match(/novel_writer_chapter_id:\s*["']?([^\s"']+)/);
		const novel = raw.match(/novel_writer_novel_id:\s*["']?([^\s"']+)/);
		if (match && novel && data.actos.some(a => a.id_novela === novel[1])) byId.set(match[1], file.path);
	}
	let changed = false; for (const cap of data.capitulos) { const path = byId.get(cap.id_capitulo); if (path && cap.archivo !== path) { cap.archivo = path; changed = true; } }
	if (changed) await writeFile(app, folderPath, data);
}

function resolveChapterPath(folderPath: string, path: string): string {
	// Legacy/default chapter paths are relative to the novel. User-linked paths
	// are vault-relative and therefore already include their complete location.
	return path.startsWith('escritura/') ? joinPath(folderPath, path) : path;
}
