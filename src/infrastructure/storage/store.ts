import { App, Notice } from 'obsidian';
import {
	scanNovels, createNovel, findNovelFolder,
} from './repos/NovelRepo';
import type { NovelScanResult } from './repos/NovelRepo';
import * as CatRepo from './repos/CategoriaRepo';
import * as EtiRepo from './repos/EtiquetaRepo';
import * as TagRepo from './repos/TagRepo';
import * as DetRepo from './repos/DetalleRepo';
import * as EntryRepo from './repos/CodexEntryRepo';
import * as EstRepo from './repos/EstructuraRepo';
import * as SnipRepo from './repos/SnippetRepo';
import * as ChatRepo from './repos/ChatRepo';
import {
	Novela, Categoria, Etiqueta, Tag, Detalle, OpcionDetalle, EntradaCodex,
	Acto, Capitulo, Snippet, Chat, EntityId,
} from '../../domain';

export type { NovelScanResult };

export class NovelStore {
	private app: App;
	private scan: NovelScanResult[] = [];
	private activeId: EntityId | null = null;
	private activeFolder: string | null = null;

	constructor(app: App) { this.app = app; }

	get activeFolderPath(): string | null { return this.activeFolder; }
	get activeNovelId(): EntityId | null { return this.activeId; }
	get novels(): readonly NovelScanResult[] { return this.scan; }

	async refresh(): Promise<void> { this.scan = await scanNovels(this.app); }

	async setActive(id: EntityId | null): Promise<void> {
		if (id === null) { this.activeId = null; this.activeFolder = null; return; }
		const folder = await findNovelFolder(this.app, id);
		if (!folder) { new Notice('Novela no encontrada.'); return; }
		this.activeId = id; this.activeFolder = folder;
	}

	async create(name: string, author: string, baseFolder?: string, thumbnailFile: ArrayBuffer | null = null): Promise<Novela> {
		const { folderPath, novela } = await createNovel(this.app, name, author, baseFolder, thumbnailFile);
		await this.refresh();
		this.activeId = novela.id_novela; this.activeFolder = folderPath;
		return novela;
	}

	// Categoria
	async listCategorias(): Promise<Categoria[]> { return CatRepo.listCategorias(this.app, this.activeFolder!); }
	async createCategoriaCustom(name: string, color: string): Promise<Categoria> { return CatRepo.createCategoria(this.app, this.activeFolder!, this.activeId!, name, color); }
	async updateCategoria(item: Categoria) { await CatRepo.updateCategoria(this.app, this.activeFolder!, item); }
	async deleteCategoria(id: EntityId) { await CatRepo.deleteCategoria(this.app, this.activeFolder!, id); }

	// Etiqueta
	async listEtiquetas(): Promise<Etiqueta[]> { return EtiRepo.listEtiquetas(this.app, this.activeFolder!); }
	async createEtiqueta(name: string, color: string): Promise<Etiqueta> { return EtiRepo.createEtiqueta(this.app, this.activeFolder!, this.activeId!, name, color); }
	async updateEtiqueta(item: Etiqueta) { await EtiRepo.updateEtiqueta(this.app, this.activeFolder!, item); }
	async deleteEtiqueta(id: EntityId) { await EtiRepo.deleteEtiqueta(this.app, this.activeFolder!, id); }

	// Tag
	async listTags(): Promise<Tag[]> { return TagRepo.listTags(this.app, this.activeFolder!); }
	async findOrCreateTag(name: string): Promise<Tag> { return TagRepo.findOrCreateTag(this.app, this.activeFolder!, this.activeId!, name); }
	async updateTag(item: Tag) { await TagRepo.updateTag(this.app, this.activeFolder!, item); }
	async deleteTag(id: EntityId) { await TagRepo.deleteTag(this.app, this.activeFolder!, id); }

	// Detalle
	async listDetalles(): Promise<Detalle[]> { return DetRepo.listDetalles(this.app, this.activeFolder!); }
	async listDetallesExtended() { return DetRepo.listAllDetallesExtended(this.app, this.activeFolder!); }
	async getDetallesByCategoria(idCat: EntityId) { return DetRepo.getDetallesByCategoria(this.app, this.activeFolder!, idCat); }
	async listOpcionesByDetalle(idDetalle: EntityId) { return DetRepo.listOpcionesByDetalle(this.app, this.activeFolder!, idDetalle); }
	async createDetalle(nombre: string, tipo: Detalle['tipo_detalle'], incluirIa = true) { return DetRepo.createDetalle(this.app, this.activeFolder!, this.activeId!, nombre, tipo, incluirIa); }
	async updateDetalle(item: Detalle) { await DetRepo.updateDetalle(this.app, this.activeFolder!, item); }
	async deleteDetalle(id: EntityId) { await DetRepo.deleteDetalle(this.app, this.activeFolder!, id); }
	async setDetalleCategorias(idDetalle: EntityId, idCategorias: EntityId[]) { await DetRepo.setDetalleCategorias(this.app, this.activeFolder!, idDetalle, idCategorias); }
	async upsertOpcion(item: OpcionDetalle) { await DetRepo.upsertOpcion(this.app, this.activeFolder!, item); }
	async deleteOpcion(id: EntityId) { await DetRepo.deleteOpcion(this.app, this.activeFolder!, id); }

	// Entrada Codex
	async listEntries(): Promise<EntradaCodex[]> { return EntryRepo.listEntries(this.app, this.activeFolder!); }
	async readEntry(id: EntityId) { return EntryRepo.readEntry(this.app, this.activeFolder!, id); }
	async createEntry(idCategoria: EntityId, nombre: string) { return EntryRepo.createEntry(this.app, this.activeFolder!, this.activeId!, idCategoria, nombre); }
	async writeEntry(entry: EntradaCodex) { await EntryRepo.writeEntry(this.app, this.activeFolder!, entry); }
	async deleteEntry(id: EntityId) { await EntryRepo.deleteEntry(this.app, this.activeFolder!, id); }
	async archiveEntry(id: EntityId, archived: boolean) { const e = await EntryRepo.readEntry(this.app, this.activeFolder!, id); if (!e) return; e.archivado = archived; await EntryRepo.writeEntry(this.app, this.activeFolder!, e); }
	async moveEntryToNovel(idEntry: EntityId, targetNovelId: EntityId) { const src = this.activeFolder!; const e = await EntryRepo.readEntry(this.app, src, idEntry); if (!e) return; const target = await findNovelFolder(this.app, targetNovelId); if (!target) throw new Error('Novela destino no encontrada'); e.id_novela = targetNovelId; await EntryRepo.writeEntry(this.app, target, e); await EntryRepo.deleteEntry(this.app, src, idEntry); }
	async setEntryThumbnail(idEntry: EntityId, dataUrl: string | null) { const e = await EntryRepo.readEntry(this.app, this.activeFolder!, idEntry); if (!e) return; e.thumbnail = dataUrl; await EntryRepo.writeEntry(this.app, this.activeFolder!, e); }
	async setEntryTags(idEntry: EntityId, tagIds: EntityId[]) { await EntryRepo.setEntryTags(this.app, this.activeFolder!, idEntry, tagIds); }
	async addReferencia(idEntry: EntityId, url: string) { return EntryRepo.addReferencia(this.app, this.activeFolder!, idEntry, url); }
	async removeReferencia(idEntry: EntityId, idRef: EntityId) { await EntryRepo.removeReferencia(this.app, this.activeFolder!, idEntry, idRef); }
	async setDetalleValor(idEntry: EntityId, idDetalle: EntityId, valor: string | null) { await EntryRepo.setDetalleValor(this.app, this.activeFolder!, idEntry, idDetalle, valor); }
	async removeDetalleValor(idEntry: EntityId, idDetalle: EntityId) { await EntryRepo.removeDetalleValor(this.app, this.activeFolder!, idEntry, idDetalle); }

	// Estructura
	async listActos(): Promise<Acto[]> { return EstRepo.listActos(this.app, this.activeFolder!); }
	async createActo(nombre: string) { return EstRepo.createActo(this.app, this.activeFolder!, this.activeId!, nombre); }
	async updateActo(id: EntityId, patch: Partial<Acto>) { await EstRepo.updateActo(this.app, this.activeFolder!, id, patch); }
	async deleteActo(id: EntityId) { await EstRepo.deleteActo(this.app, this.activeFolder!, id); }
	async listCapitulosByActo(idActo: EntityId) { return EstRepo.listCapitulosByActo(this.app, this.activeFolder!, idActo); }
	async listCapitulos() { return EstRepo.listCapitulos(this.app, this.activeFolder!); }
	async createCapitulo(idActo: EntityId, nombre: string, orden: number) { return EstRepo.createCapitulo(this.app, this.activeFolder!, idActo, nombre, orden); }
	async updateCapitulo(id: EntityId, patch: Partial<Capitulo>) { await EstRepo.updateCapitulo(this.app, this.activeFolder!, id, patch); }
	async deleteCapitulo(id: EntityId) { await EstRepo.deleteCapitulo(this.app, this.activeFolder!, id); }
	async ensureCapituloArchivo(id: EntityId, targetFolder?: string) { return EstRepo.ensureCapituloArchivo(this.app, this.activeFolder!, id, targetFolder); }
	async writeCapituloTexto(id: EntityId, content: string) { return EstRepo.writeCapituloTexto(this.app, this.activeFolder!, id, content); }
	async readCapituloTexto(id: EntityId) { return EstRepo.readCapituloTexto(this.app, this.activeFolder!, id); }
	async linkCapituloArchivo(id: EntityId, path: string) { await EstRepo.linkCapituloArchivo(this.app, this.activeFolder!, id, path); }
	async reconcileCapituloArchivos() { await EstRepo.reconcileCapituloArchivos(this.app, this.activeFolder!); }

	// Snippets
	async listSnippets(): Promise<Snippet[]> { return SnipRepo.listSnippets(this.app, this.activeFolder!); }
	async createSnippet(nombre: string) { return SnipRepo.createSnippet(this.app, this.activeFolder!, this.activeId!, nombre); }
	async updateSnippet(item: Snippet) { await SnipRepo.updateSnippet(this.app, this.activeFolder!, item); }
	async getSnippetTexto(id: EntityId) { return SnipRepo.getSnippetTexto(this.app, this.activeFolder!, id); }
	async writeSnippetTexto(id: EntityId, t: string) { await SnipRepo.writeSnippetTexto(this.app, this.activeFolder!, id, t); }
	async getSnippetArchivo(id: EntityId) { return SnipRepo.getSnippetArchivo(this.app, this.activeFolder!, id); }
	async renameSnippet(id: EntityId, n: string) { await SnipRepo.renameSnippet(this.app, this.activeFolder!, id, n); }
	async archiveSnippet(id: EntityId) { await SnipRepo.archiveSnippet(this.app, this.activeFolder!, id); }
	async deleteSnippet(id: EntityId) { await SnipRepo.deleteSnippet(this.app, this.activeFolder!, id); }

	// Chats
	async listChats(): Promise<Chat[]> { return ChatRepo.listChats(this.app, this.activeFolder!); }
	async readChat(id: EntityId) { return ChatRepo.readChat(this.app, this.activeFolder!, id); }
	async createChat(nombre: string) { return ChatRepo.createChat(this.app, this.activeFolder!, this.activeId!, nombre); }
	async renameChat(id: EntityId, nombre: string) { await ChatRepo.renameChat(this.app, this.activeFolder!, id, nombre); }
	async archiveChat(id: EntityId, val: boolean) { await ChatRepo.archiveChat(this.app, this.activeFolder!, id, val); }
	async deleteChat(id: EntityId) { await ChatRepo.deleteChat(this.app, this.activeFolder!, id); }
	async appendMensaje(idChat: EntityId, role: 'user' | 'assistant', msg: string) { return ChatRepo.appendMensaje(this.app, this.activeFolder!, idChat, role, msg); }
	async deleteMensaje(idChat: EntityId, idMsg: EntityId) { await ChatRepo.deleteMensaje(this.app, this.activeFolder!, idChat, idMsg); }
}
