import { App } from 'obsidian';
import { Acto, Capitulo, EntityId, nowISO } from '../../../domain';
import { genId } from '../../../utils/ids';
import { joinPath } from '../fsHelpers';
import { readEstructuraFile, writeEstructuraFile } from './estructuraStorage';
import { resolveChapterFile, sanitizeFileName } from './chapterFiles';

// Chapter manuscript file handling (creation, renaming, reconciliation) lives in
// `chapterFiles.ts`; re-exported here so existing `import * as EstRepo from
// './EstructuraRepo'` call sites keep working unchanged.
export {
	sanitizeFileName,
	resolveChapterFile,
	ensureCapituloArchivo,
	writeCapituloTexto,
	readCapituloTexto,
	linkCapituloArchivo,
	reconcileCapituloArchivos,
} from './chapterFiles';

// ---- Actos ----

export async function listActos(app: App, fp: string): Promise<Acto[]> {
	return (await readEstructuraFile(app, fp)).actos.sort((a, b) => a.orden - b.orden);
}

export async function createActo(app: App, folderPath: string, idNovela: EntityId, nombre: string): Promise<Acto> {
	const data = await readEstructuraFile(app, folderPath);
	const orden = data.actos.length;
	const acto: Acto = {
		id_acto: genId(), nombre, orden, id_novela: idNovela,
		created_at: nowISO(), updated_at: nowISO(),
	};
	data.actos.push(acto);
	await writeEstructuraFile(app, folderPath, data);
	return acto;
}

export async function updateActo(app: App, fp: string, id: EntityId, patch: Partial<Acto>) {
	const data = await readEstructuraFile(app, fp);
	const a = data.actos.find(x => x.id_acto === id);
	if (a) Object.assign(a, patch, { updated_at: nowISO() });
	await writeEstructuraFile(app, fp, data);
}

export async function deleteActo(app: App, fp: string, id: EntityId) {
	const data = await readEstructuraFile(app, fp);
	const caps = data.capitulos.filter(c => c.id_acto === id);
	if (caps.length > 0) throw new Error('The act still contains chapters. Move or delete them first.');
	data.actos = data.actos.filter(a => a.id_acto !== id);
	await writeEstructuraFile(app, fp, data);
}

// ---- Capitulos ----

export async function listCapitulosByActo(app: App, fp: string, idActo: EntityId): Promise<Capitulo[]> {
	const data = await readEstructuraFile(app, fp);
	return data.capitulos.filter(c => c.id_acto === idActo).sort((a, b) => a.orden - b.orden);
}

export async function listCapitulos(app: App, fp: string): Promise<Capitulo[]> {
	const data = await readEstructuraFile(app, fp);
	return data.capitulos.sort((a, b) => a.orden - b.orden);
}

export async function createCapitulo(app: App, folderPath: string, idActo: EntityId, nombre: string, orden: number): Promise<Capitulo> {
	const data = await readEstructuraFile(app, folderPath);
	const cap: Capitulo = {
		id_capitulo: genId(), nombre, outline: '', archivo: null, id_acto: idActo, orden,
		created_at: nowISO(), updated_at: nowISO(),
	};
	data.capitulos.push(cap);
	await writeEstructuraFile(app, folderPath, data);
	return cap;
}

export async function updateCapitulo(app: App, fp: string, id: EntityId, patch: Partial<Capitulo>) {
	const data = await readEstructuraFile(app, fp);
	const c = data.capitulos.find(x => x.id_capitulo === id);
	if (c && patch.nombre && patch.nombre !== c.nombre && c.archivo) {
		const file = await resolveChapterFile(app, fp, id, c.archivo);
		if (file) {
			const parent = file.parent?.path ?? '';
			const targetPath = joinPath(parent, `${sanitizeFileName(patch.nombre)}.md`);
			if (targetPath !== file.path) {
				const existing = app.vault.getAbstractFileByPath(targetPath);
				if (existing && existing !== file)
					throw new Error(`A chapter file named "${patch.nombre}.md" already exists.`);
				await app.vault.rename(file, targetPath);
			}
			c.archivo = targetPath.startsWith(fp + '/') ? targetPath.slice(fp.length + 1) : targetPath;
		}
	}
	if (c) Object.assign(c, patch, { updated_at: nowISO() });
	await writeEstructuraFile(app, fp, data);
}

export async function deleteCapitulo(app: App, fp: string, id: EntityId) {
	const data = await readEstructuraFile(app, fp);
	const cap = data.capitulos.find(c => c.id_capitulo === id);
	if (cap?.archivo) {
		const file = await resolveChapterFile(app, fp, id, cap.archivo);
		if (file) await app.vault.trash(file, true);
	}
	data.capitulos = data.capitulos.filter(c => c.id_capitulo !== id);
	await writeEstructuraFile(app, fp, data);
}

// ---- Estructura completa ----

/** Acto y sus capitulos, tal como los propone el blueprint de la novela. */
export interface ActoDraft {
	nombre: string;
	capitulos: { nombre: string; outline: string }[];
}

function matchKey(nombre: string): string {
	return (nombre || '').trim().toLowerCase();
}

/**
 * Reemplaza actos y capitulos en una sola escritura.
 *
 * Nunca borra manuscritos: un capitulo que desaparece de la estructura deja su
 * archivo .md en el vault. Los capitulos cuyo nombre se mantiene conservan su
 * id y su archivo, para no romper el frontmatter ya escrito en el manuscrito.
 */
export async function replaceEstructura(
	app: App,
	folderPath: string,
	idNovela: EntityId,
	drafts: ActoDraft[],
): Promise<void> {
	const data = await readEstructuraFile(app, folderPath);
	const previous = new Map<string, Capitulo>();
	for (const cap of data.capitulos) {
		const key = matchKey(cap.nombre);
		if (key && !previous.has(key)) previous.set(key, cap);
	}
	const now = nowISO();
	const actos: Acto[] = [];
	const capitulos: Capitulo[] = [];
	drafts.forEach((draft, index) => {
		const acto: Acto = {
			id_acto: genId(), nombre: draft.nombre, orden: index, id_novela: idNovela,
			created_at: now, updated_at: now,
		};
		actos.push(acto);
		draft.capitulos.forEach((chapter, orden) => {
			const kept = previous.get(matchKey(chapter.nombre));
			capitulos.push({
				id_capitulo: kept?.id_capitulo ?? genId(),
				nombre: chapter.nombre,
				outline: chapter.outline,
				archivo: kept?.archivo ?? null,
				id_acto: acto.id_acto,
				orden,
				created_at: kept?.created_at ?? now,
				updated_at: now,
			});
		});
	});
	await writeEstructuraFile(app, folderPath, { actos, capitulos });
}
