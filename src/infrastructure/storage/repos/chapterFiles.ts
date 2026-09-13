import { App, TFile } from 'obsidian';
import { EntityId } from '../../../domain';
import { basenameNoExt, joinPath, ensureFolder, writeText } from '../fsHelpers';
import { readEstructuraFile, writeEstructuraFile } from './estructuraStorage';

/**
 * Chapter manuscript files: creating them, keeping their stored path in sync when
 * the author renames or moves them in the vault, and resolving them back from a
 * chapter id. Separate from `EstructuraRepo`'s act/chapter data CRUD because this
 * is a different concern with a different failure mode — a stale file path or a
 * frontmatter mismatch, not a data-shape problem.
 */

/** Sanitiza un nombre para usarlo como nombre de archivo. */
export function sanitizeFileName(name: string): string {
	return name
		.replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
		.replace(/\.+$/, '')
		.slice(0, 120)
		|| 'chapter';
}

function resolveChapterPath(folderPath: string, path: string): string {
	// Legacy/default chapter paths are relative to the novel. User-linked paths
	// are vault-relative and therefore already include their complete location.
	return path.startsWith('escritura/') ? joinPath(folderPath, path) : path;
}

/** Resolves the chapter file, falling back to frontmatter lookup if the stored path is stale. */
export async function resolveChapterFile(app: App, folderPath: string, chapterId: EntityId, storedPath: string): Promise<TFile | null> {
	// Try stored path first (fast path)
	const fullPath = resolveChapterPath(folderPath, storedPath);
	const file = app.vault.getAbstractFileByPath(fullPath);
	if (file instanceof TFile) return file;
	// Fallback: scan all markdown files for the chapter ID in frontmatter
	for (const f of app.vault.getMarkdownFiles()) {
		const raw = await app.vault.read(f);
		if (raw.includes(`novel_writer_chapter_id: "${chapterId}"`) || raw.includes(`novel_writer_chapter_id: '${chapterId}'`)) {
			return f;
		}
	}
	return null;
}

/** Crea el manuscrito del capítulo si aún no existe. */
export async function ensureCapituloArchivo(app: App, folderPath: string, id: EntityId, targetFolder?: string): Promise<string | null> {
	const data = await readEstructuraFile(app, folderPath);
	const cap = data.capitulos.find(x => x.id_capitulo === id);
	if (!cap) return null;
	const acto = data.actos.find(x => x.id_acto === cap.id_acto);
	const baseFolder = targetFolder || joinPath(folderPath, 'escritura', 'capitulos');
	await ensureFolder(app, baseFolder);

	// Try to find the existing file — by stored path first, then by frontmatter
	let file: TFile | null = null;
	if (cap.archivo) {
		const existing = app.vault.getAbstractFileByPath(resolveChapterPath(folderPath, cap.archivo));
		if (existing instanceof TFile) file = existing;
	}
	if (!file) {
		// Scan all markdown files for the chapter ID in frontmatter
		for (const f of app.vault.getMarkdownFiles()) {
			const raw = await app.vault.read(f);
			if (raw.includes(`novel_writer_chapter_id: "${cap.id_capitulo}"`) || raw.includes(`novel_writer_chapter_id: '${cap.id_capitulo}'`)) {
				file = f;
				break;
			}
		}
	}

	let changed = false;
	if (file) {
		// File found — update stored path if it changed (e.g., renamed)
		const newRelative = file.path.startsWith(folderPath + '/')
			? file.path.slice(folderPath.length + 1)
			: file.path;
		if (cap.archivo !== newRelative) {
			cap.archivo = newRelative;
			changed = true;
		}
	} else {
		// No file exists — create one with the chapter name
		const safeName = sanitizeFileName(cap.nombre || id);
		cap.archivo = targetFolder ? joinPath(targetFolder, `${safeName}.md`) : joinPath('escritura', 'capitulos', `${safeName}.md`);
		changed = true;
		const fullPath = resolveChapterPath(folderPath, cap.archivo);
		await writeText(app, fullPath, `---\nnovel_writer_type: chapter\nnovel_writer_novel_id: "${acto?.id_novela ?? ''}"\nnovel_writer_chapter_id: "${cap.id_capitulo}"\nnovel_writer_status: draft\n---\n\n`);
	}

	if (changed) await writeEstructuraFile(app, folderPath, data);
	return cap.archivo;
}

export async function writeCapituloTexto(app: App, folderPath: string, id: EntityId, content: string): Promise<string | null> {
	const path = await ensureCapituloArchivo(app, folderPath, id);
	if (!path) return null;
	const file = await resolveChapterFile(app, folderPath, id, path);
	if (!file) return null;
	// Use vault.process() for atomic read-modify-write to avoid corrupting
	// the editor state when the chapter file is open in an Obsidian pane.
	await app.vault.process(file, (raw) => {
		const front = raw.match(/^---[\s\S]*?---/i)?.[0] ?? '';
		return `${front}\n\n${content}`;
	});
	return path;
}

export async function readCapituloTexto(app: App, folderPath: string, id: EntityId): Promise<string> {
	const data = await readEstructuraFile(app, folderPath);
	const cap = data.capitulos.find(x => x.id_capitulo === id);
	if (!cap?.archivo) return '';
	const file = await resolveChapterFile(app, folderPath, id, cap.archivo);
	if (!file) return '';
	const raw = await app.vault.read(file);
	return raw.replace(/^---[\s\S]*?---\s*/, '').trim();
}

export async function linkCapituloArchivo(app: App, folderPath: string, id: EntityId, vaultPath: string): Promise<void> {
	const data = await readEstructuraFile(app, folderPath);
	const cap = data.capitulos.find(x => x.id_capitulo === id);
	if (!cap) return;
	cap.archivo = vaultPath;
	await writeEstructuraFile(app, folderPath, data);
	const file = app.vault.getAbstractFileByPath(vaultPath);
	if (!(file instanceof TFile)) return;
	const raw = await app.vault.read(file);
	const acto = data.actos.find(x => x.id_acto === cap.id_acto);
	const metadata = `novel_writer_type: chapter\nnovel_writer_novel_id: "${acto?.id_novela ?? ''}"\nnovel_writer_chapter_id: "${cap.id_capitulo}"\nnovel_writer_status: linked`;
	const next = raw.match(/^---[\s\S]*?---/) ? raw.replace(/^---[\s\S]*?---/, `---\n${metadata}\n---`) : `---\n${metadata}\n---\n\n${raw}`;
	await app.vault.modify(file, next);
}

/** Reconciles paths after users move linked Markdown files in the vault. */
export async function reconcileCapituloArchivos(app: App, folderPath: string): Promise<void> {
	const data = await readEstructuraFile(app, folderPath);
	const byId = new Map<string, string>();
	for (const file of app.vault.getMarkdownFiles()) {
		const raw = await app.vault.read(file);
		const match = raw.match(/novel_writer_chapter_id:\s*["']?([^\s"']+)/);
		const novel = raw.match(/novel_writer_novel_id:\s*["']?([^\s"']+)/);
		if (match && novel && data.actos.some(a => a.id_novela === novel[1])) byId.set(match[1], file.path);
	}
	let changed = false;
	for (const cap of data.capitulos) {
		const path = byId.get(cap.id_capitulo);
		if (!path) continue;
		if (cap.archivo !== path) { cap.archivo = path; changed = true; }
		// El nombre del capitulo sigue al del archivo cuando el autor lo renombra
		// en el vault, pero se compara contra el nombre ya saneado: si difieren
		// solo por caracteres que no son validos en un archivo (":", "?", ...),
		// el nombre elegido en el outline es el correcto y no se pisa.
		const fileName = basenameNoExt(path);
		if (fileName && fileName !== sanitizeFileName(cap.nombre)) { cap.nombre = fileName; changed = true; }
	}
	if (changed) await writeEstructuraFile(app, folderPath, data);
}
