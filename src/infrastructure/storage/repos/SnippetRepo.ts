import { App } from 'obsidian';
import { Snippet, EntityId, nowISO } from '../../../domain';
import { genId } from '../../../utils/ids';
import { readJson, writeJson, joinPath, readText, writeText, ensureFolder, deleteFile } from '../fsHelpers';
import { basenameNoExt } from '../fsHelpers';

/**
 * Snippets viven en snippets/snip_<id>.md, con YAML frontmatter
 *   ---
 *   id_snippet: <id>
 *   nombre: <nombre>
 *   ---
 * seguido del body (texto del snippet). Editable en Obsidian como markdown.
 */
const INDEX = 'snippets/index.json';
const DIR = 'snippets';

interface IndexEntry { id_snippet: string; nombre: string; archivo: string; created_at: string; updated_at: string; archivado: boolean; }

async function readIndex(app: App, fp: string): Promise<IndexEntry[]> {
	const d = await readJson<IndexEntry[]>(app, joinPath(fp, INDEX));
	return Array.isArray(d) ? d : [];
}

async function writeIndex(app: App, fp: string, idx: IndexEntry[]) {
	await writeJson(app, joinPath(fp, INDEX), idx);
}

function stripFm(t: string): string { return t.replace(/^---\s*[\s\S]*?---\s*/, ''); }
function buildFm(s: IndexEntry): string {
	return `---\nid_snippet: "${s.id_snippet}"\nnombre: "${(s.nombre || '').replace(/"/g, '\\"')}"\n---\n\n`;
}

export async function listSnippets(app: App, fp: string): Promise<Snippet[]> {
	const idx = await readIndex(app, fp);
	const out: Snippet[] = [];
	for (const e of idx) {
		out.push({
			id_snippet: e.id_snippet, nombre: e.nombre, texto: '',
			id_novela: '', archivado: e.archivado,
			created_at: e.created_at, updated_at: e.updated_at,
		});
	}
	return out;
}

export async function createSnippet(app: App, folderPath: string, idNovela: EntityId, nombre: string): Promise<Snippet> {
	await ensureFolder(app, joinPath(folderPath, DIR));
	const id = genId();
	const rel = joinPath(DIR, `snip_${id}.md`);
	const now = nowISO();
	const e: IndexEntry = { id_snippet: id, nombre, archivo: rel, created_at: now, updated_at: now, archivado: false };
	await writeText(app, joinPath(folderPath, rel), buildFm(e));
	const idx = await readIndex(app, folderPath);
	idx.push(e);
	await writeIndex(app, folderPath, idx);
	return { id_snippet: id, nombre, texto: '', id_novela: idNovela, archivado: false, created_at: now, updated_at: now };
}

export async function renameSnippet(app: App, fp: string, id: EntityId, nombre: string) {
	const idx = await readIndex(app, fp);
	const e = idx.find(x => x.id_snippet === id); if (!e) return;
	e.nombre = nombre; e.updated_at = nowISO();
	await writeIndex(app, fp, idx);
	// actualizar frontmatter del .md
	const raw = await readText(app, joinPath(fp, e.archivo)) ?? '';
	const body = stripFm(raw);
	await writeText(app, joinPath(fp, e.archivo), buildFm(e) + body);
}

export async function updateSnippet(app: App, fp: string, item: Snippet) {
	const idx = await readIndex(app, fp);
	const e = idx.find(x => x.id_snippet === item.id_snippet); if (!e) return;
	e.nombre = item.nombre;
	e.archivado = item.archivado;
	e.updated_at = nowISO();
	await writeIndex(app, fp, idx);
	const raw = await readText(app, joinPath(fp, e.archivo)) ?? '';
	const body = stripFm(raw);
	await writeText(app, joinPath(fp, e.archivo), buildFm(e) + (item.texto ?? body));
}

export async function getSnippetTexto(app: App, fp: string, id: EntityId): Promise<string> {
	const idx = await readIndex(app, fp);
	const e = idx.find(x => x.id_snippet === id); if (!e) return '';
	const raw = await readText(app, joinPath(fp, e.archivo)) ?? '';
	return stripFm(raw);
}

export async function writeSnippetTexto(app: App, fp: string, id: EntityId, texto: string) {
	const idx = await readIndex(app, fp);
	const e = idx.find(x => x.id_snippet === id); if (!e) return;
	e.updated_at = nowISO();
	await writeIndex(app, fp, idx);
	await writeText(app, joinPath(fp, e.archivo), buildFm(e) + texto);
}

export async function getSnippetArchivo(app: App, fp: string, id: EntityId): Promise<string | null> {
	const idx = await readIndex(app, fp);
	const e = idx.find(x => x.id_snippet === id);
	return e?.archivo ?? null;
}

export async function archiveSnippet(app: App, fp: string, id: EntityId) {
	const idx = await readIndex(app, fp);
	const e = idx.find(x => x.id_snippet === id); if (!e) return;
	e.archivado = true; e.updated_at = nowISO();
	await writeIndex(app, fp, idx);
}

export async function deleteSnippet(app: App, fp: string, id: EntityId) {
	const idx = await readIndex(app, fp);
	const e = idx.find(x => x.id_snippet === id);
	if (e) await deleteFile(app, joinPath(fp, e.archivo));
	await writeIndex(app, fp, idx.filter(x => x.id_snippet !== id));
}