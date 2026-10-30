import { App, TFile } from 'obsidian';
import { EntityId } from '../../../domain';
import { basenameNoExt, joinPath, ensureFolder, writeText } from '../fsHelpers';
import { readEstructuraFile, withEstructuraLock, writeEstructuraFile } from './estructuraStorage';

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
	return scanForChapterFile(app, chapterId);
}

/** Slow path: reads every note looking for the chapter id in its frontmatter. */
async function scanForChapterFile(app: App, chapterId: EntityId): Promise<TFile | null> {
	for (const f of app.vault.getMarkdownFiles()) {
		const raw = await app.vault.read(f);
		if (raw.includes(`novel_writer_chapter_id: "${chapterId}"`) || raw.includes(`novel_writer_chapter_id: '${chapterId}'`)) {
			return f;
		}
	}
	return null;
}

/** The chapter's file at its stored path, if it is still there. */
function fileAtStoredPath(app: App, folderPath: string, archivo: string | null): TFile | null {
	if (!archivo) return null;
	const existing = app.vault.getAbstractFileByPath(resolveChapterPath(folderPath, archivo));
	return existing instanceof TFile ? existing : null;
}

/** Reads the structure file without racing a write in progress. */
function readEstructuraLocked(app: App, folderPath: string) {
	return withEstructuraLock(folderPath, () => readEstructuraFile(app, folderPath));
}

/** Crea el manuscrito del capítulo si aún no existe. */
export async function ensureCapituloArchivo(app: App, folderPath: string, id: EntityId, targetFolder?: string): Promise<string | null> {
	const before = await readEstructuraLocked(app, folderPath);
	const known = before.capitulos.find(x => x.id_capitulo === id);
	if (!known) return null;
	const baseFolder = targetFolder || joinPath(folderPath, 'escritura', 'capitulos');
	await ensureFolder(app, baseFolder);
	// The vault scan can take a while, so it runs before taking the lock, and the
	// structure is read again inside it in case it changed meanwhile.
	const scanned = fileAtStoredPath(app, folderPath, known.archivo)
		?? await scanForChapterFile(app, id);

	return withEstructuraLock(folderPath, async () => {
		const data = await readEstructuraFile(app, folderPath);
		const cap = data.capitulos.find(x => x.id_capitulo === id);
		if (!cap) return null;
		const acto = data.actos.find(x => x.id_acto === cap.id_acto);
		// Another call may have created the file while this one was scanning.
		const file = fileAtStoredPath(app, folderPath, cap.archivo) ?? scanned;

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
	});
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
	const data = await readEstructuraLocked(app, folderPath);
	const cap = data.capitulos.find(x => x.id_capitulo === id);
	if (!cap?.archivo) return '';
	const file = await resolveChapterFile(app, folderPath, id, cap.archivo);
	if (!file) return '';
	const raw = await app.vault.read(file);
	return raw.replace(/^---[\s\S]*?---\s*/, '').trim();
}

export async function linkCapituloArchivo(app: App, folderPath: string, id: EntityId, vaultPath: string): Promise<void> {
	const linked = await withEstructuraLock(folderPath, async () => {
		const data = await readEstructuraFile(app, folderPath);
		const cap = data.capitulos.find(x => x.id_capitulo === id);
		if (!cap) return null;
		cap.archivo = vaultPath;
		await writeEstructuraFile(app, folderPath, data);
		const acto = data.actos.find(x => x.id_acto === cap.id_acto);
		return { idCapitulo: cap.id_capitulo, idNovela: acto?.id_novela ?? '' };
	});
	if (!linked) return;
	const file = app.vault.getAbstractFileByPath(vaultPath);
	if (!(file instanceof TFile)) return;
	const raw = await app.vault.read(file);
	const metadata = `novel_writer_type: chapter\nnovel_writer_novel_id: "${linked.idNovela}"\nnovel_writer_chapter_id: "${linked.idCapitulo}"\nnovel_writer_status: linked`;
	const next = raw.match(/^---[\s\S]*?---/) ? raw.replace(/^---[\s\S]*?---/, `---\n${metadata}\n---`) : `---\n${metadata}\n---\n\n${raw}`;
	await app.vault.modify(file, next);
}

/** A note whose frontmatter says it is a chapter manuscript. */
interface LinkedChapterNote {
	idCapitulo: string;
	idNovela: string;
	path: string;
}

/** Reads every note in the vault and returns the ones linked to a chapter. */
async function scanLinkedChapterNotes(app: App): Promise<LinkedChapterNote[]> {
	const notes: LinkedChapterNote[] = [];
	for (const file of app.vault.getMarkdownFiles()) {
		const raw = await app.vault.read(file);
		const match = raw.match(/novel_writer_chapter_id:\s*["']?([^\s"']+)/);
		const novel = raw.match(/novel_writer_novel_id:\s*["']?([^\s"']+)/);
		if (match && novel) notes.push({ idCapitulo: match[1], idNovela: novel[1], path: file.path });
	}
	return notes;
}

/** Reconciles paths after users move linked Markdown files in the vault. */
export async function reconcileCapituloArchivos(app: App, folderPath: string): Promise<void> {
	// Reading every note is the slow part, so it happens outside the lock and
	// only applying the result waits for the other structure writes.
	const notes = await scanLinkedChapterNotes(app);
	await withEstructuraLock(folderPath, async () => {
		const data = await readEstructuraFile(app, folderPath);
		const byId = new Map<string, string>();
		for (const note of notes) {
			if (data.actos.some(a => a.id_novela === note.idNovela)) byId.set(note.idCapitulo, note.path);
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
	});
}
