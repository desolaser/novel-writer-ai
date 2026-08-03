import { create } from 'zustand';
import {
	EntradaCodex, Categoria, Detalle, Etiqueta, Tag,
	Acto, Capitulo, Escena, Snippet, Chat, EntityId, OpcionDetalle, TipoDetalle,
} from '../../../domain';
import { NovelStore, NovelScanResult } from '../../../infrastructure/storage/store';

interface UIState {
	sidebarWidth: number;
	sidebarCollapsed: boolean;
	activeWorkTab: 'planear' | 'escribir' | 'chat' | 'review';
	activeSidebarTab: 'codex' | 'config' | 'chats';
	snippetEditorId: EntityId | null;
}

interface NovelWriterStore extends UIState {
	store: NovelStore | null;
	novels: NovelScanResult[];
	activeNovelId: string | null;
	categorias: Categoria[];
	etiquetas: Etiqueta[];
	tags: Tag[];
	detalles: Detalle[];
	entradas: EntradaCodex[];
	actos: Acto[];
	capitulos: Capitulo[];
	escenas: Escena[];
	snippets: Snippet[];
	chats: Chat[];
	editingEntryId: EntityId | null;
	editingEscenaId: EntityId | null;
	activeChatId: EntityId | null;
	loading: boolean;

	bindStore: (s: NovelStore) => void;
	refreshNovels: () => Promise<void>;
	setActiveNovel: (id: string | null) => Promise<void>;
	reloadAll: () => Promise<void>;
	setSidebarWidth: (n: number) => void;
	toggleSidebar: () => void;
	setWorkTab: (t: NovelWriterStore['activeWorkTab']) => void;
	setSidebarTab: (t: NovelWriterStore['activeSidebarTab']) => void;

	createEntry: (idCategoria: EntityId, nombre: string) => Promise<void>;
	updateEntry: (e: EntradaCodex) => Promise<void>;
	deleteEntry: (id: EntityId) => Promise<void>;
	archiveEntry: (id: EntityId, archived: boolean) => Promise<void>;
	moveEntryToNovel: (idEntry: EntityId, targetNovelId: EntityId) => Promise<void>;
	setEntryThumbnail: (idEntry: EntityId, dataUrl: string | null) => Promise<void>;
	setEditingEntry: (id: EntityId | null) => void;
	addReferencia: (idEntry: EntityId, url: string) => Promise<any>;
	removeReferencia: (idEntry: EntityId, idRef: EntityId) => Promise<void>;
	setEntryTags: (idEntry: EntityId, tagIds: EntityId[]) => Promise<void>;
	findOrCreateTag: (name: string) => Promise<Tag>;

	createCategoria: (nombre: string, color: string) => Promise<void>;
	updateCategoria: (cat: Categoria) => Promise<void>;
	deleteCategoria: (id: EntityId) => Promise<void>;

	createActo: (nombre: string) => Promise<Acto>;
	updateActo: (id: EntityId, patch: Partial<Acto>) => Promise<void>;
	deleteActo: (id: EntityId) => Promise<void>;
	createCapitulo: (idActo: EntityId, nombre: string, orden: number) => Promise<Capitulo>;
	updateCapitulo: (id: EntityId, patch: Partial<Capitulo>) => Promise<void>;
	deleteCapitulo: (id: EntityId) => Promise<void>;
	ensureCapituloArchivo: (id: EntityId, targetFolder?: string) => Promise<string | null>;
	writeCapituloTexto: (id: EntityId, content: string) => Promise<string | null>;
	readCapituloTexto: (id: EntityId) => Promise<string>;
	linkCapituloArchivo: (id: EntityId, path: string) => Promise<void>;
	reconcileCapituloArchivos: () => Promise<void>;
	createEscena: (idCap: EntityId, orden: number) => Promise<Escena>;
	updateEscena: (id: EntityId, patch: Partial<Escena>) => Promise<void>;
	deleteEscena: (id: EntityId) => Promise<void>;
	writeEscenaTexto: (id: EntityId, content: string) => Promise<void>;

	createDetalle: (nombre: string, tipo: TipoDetalle, incluirIa: boolean) => Promise<void>;
	updateDetalle: (d: Detalle) => Promise<void>;
	deleteDetalle: (id: EntityId) => Promise<void>;
	setDetalleCategorias: (idDetalle: EntityId, idCategorias: EntityId[]) => Promise<void>;
	upsertOpcion: (op: OpcionDetalle) => Promise<void>;
	deleteOpcion: (id: EntityId) => Promise<void>;
	listOpcionesByDetalle: (idDetalle: EntityId) => Promise<OpcionDetalle[]>;
		getDetallesByCategoria: (idCategoria: EntityId) => Promise<Detalle[]>;
		setDetalleValor: (idEntry: EntityId, idDetalle: EntityId, valor: string | null) => Promise<void>;
	refreshEntry: (id: EntityId) => Promise<void>;

	createSnippet: (nombre: string) => Promise<Snippet | null>;
	updateSnippet: (s: Snippet) => Promise<void>;
	openSnippetEditor: (id: EntityId | null) => void;
	writeSnippetTexto: (id: EntityId, texto: string) => Promise<void>;

	createChat: (nombre: string) => Promise<Chat | null>;
	selectChat: (id: EntityId | null) => void;
	 renameChat: (id: EntityId, nombre: string) => Promise<void>;
	deleteChat: (id: EntityId) => Promise<void>;
	appendMensaje: (role: 'user' | 'assistant', msg: string) => Promise<void>;
}

export const useNovelWriter = create<NovelWriterStore>((set, get) => ({
	store: null, novels: [], activeNovelId: null,
	categorias: [], etiquetas: [], tags: [], detalles: [], entradas: [],
	actos: [], capitulos: [], escenas: [], snippets: [], chats: [],
	editingEntryId: null, editingEscenaId: null, activeChatId: null, snippetEditorId: null,
	loading: false,
	sidebarWidth: 360, sidebarCollapsed: false, activeWorkTab: 'escribir', activeSidebarTab: 'codex',

	bindStore: (s) => set({ store: s }),
	refreshNovels: async () => { const s = get().store; if (!s) return; await s.refresh(); set({ novels: [...s.novels] }); },

	setActiveNovel: async (id) => {
		const s = get().store; if (!s) return;
		set({ loading: true, editingEntryId: null, editingEscenaId: null, activeChatId: null, snippetEditorId: null });
		await s.setActive(id);
		set({ activeNovelId: id, loading: false });
		if (id) await get().reloadAll();
		else set({ categorias: [], entradas: [], actos: [], capitulos: [], escenas: [], snippets: [], chats: [], tags: [], etiquetas: [], detalles: [] });
	},

	reloadAll: async () => {
		const s = get().store; if (!s || !s.activeNovelId) return;
		await s.reconcileCapituloArchivos();
		const [categorias, etiquetas, tags, detalles, entradas, actos, capitulos, snippets, chats] = await Promise.all([
			s.listCategorias(), s.listEtiquetas(), s.listTags(), s.listDetalles(),
			s.listEntries(), s.listActos(), s.listCapitulos(), s.listSnippets(), s.listChats(),
		]);
		const escenasAll: Escena[] = [];
		for (const cap of capitulos) {
			const es = await s.listEscenasByCapitulo(cap.id_capitulo);
			escenasAll.push(...es);
		}
		set({ categorias, etiquetas, tags, detalles, entradas, actos, capitulos, escenas: escenasAll, snippets, chats });
	},

	setSidebarWidth: (n) => set({ sidebarWidth: n }),
	toggleSidebar: () => set({ sidebarCollapsed: !get().sidebarCollapsed }),
	setWorkTab: (t) => set({ activeWorkTab: t }),
	setSidebarTab: (t) => set({ activeSidebarTab: t }),

	createEntry: async (idCategoria, nombre) => { const s = get().store; if (!s) return; await s.createEntry(idCategoria, nombre); await get().reloadAll(); },
	updateEntry: async (e) => { const s = get().store; if (!s) return; await s.writeEntry(e); set({ entradas: get().entradas.map(x => x.id_entrada_codex === e.id_entrada_codex ? e : x) }); },
	deleteEntry: async (id) => { const s = get().store; if (!s) return; await s.deleteEntry(id); set({ editingEntryId: null }); await get().reloadAll(); },
	archiveEntry: async (id, archived) => { const s = get().store; if (!s) return; await s.archiveEntry(id, archived); if (archived) set({ editingEntryId: null }); await get().reloadAll(); },
	moveEntryToNovel: async (idEntry, targetNovelId) => { const s = get().store; if (!s) return; await s.moveEntryToNovel(idEntry, targetNovelId); set({ editingEntryId: null }); await get().reloadAll(); },
	setEntryThumbnail: async (idEntry, dataUrl) => { const s = get().store; if (!s) return; await s.setEntryThumbnail(idEntry, dataUrl); await get().reloadAll(); },
	setEditingEntry: (id) => set({ editingEntryId: id }),
	addReferencia: async (idEntry, url) => { const s = get().store; if (!s) return null; const ref = await s.addReferencia(idEntry, url); return ref; },
	removeReferencia: async (idEntry, idRef) => { const s = get().store; if (!s) return; await s.removeReferencia(idEntry, idRef); },
	setEntryTags: async (idEntry, tagIds) => {
		const s = get().store; if (!s) return;
		await s.setEntryTags(idEntry, tagIds);
		set({ entradas: get().entradas.map(x => x.id_entrada_codex === idEntry ? { ...x, tags: Array.from(new Set(tagIds)) } : x) });
	},
	findOrCreateTag: async (name) => {
		const s = get().store; if (!s) throw new Error("store no bindeado");
		const t = await s.findOrCreateTag(name);
		const existing = get().tags.find(x => x.id_tag === t.id_tag);
		if (!existing) set({ tags: [...get().tags, t] });
		return t;
	},

	createCategoria: async (nombre, color) => { const s = get().store; if (!s) return; await s.createCategoriaCustom(nombre, color); await get().reloadAll(); },
	updateCategoria: async (cat) => { const s = get().store; if (!s) return; await s.updateCategoria(cat); await get().reloadAll(); },
	deleteCategoria: async (id) => { const s = get().store; if (!s) return; await s.deleteCategoria(id); await get().reloadAll(); },

	createActo: async (nombre) => { const s = get().store; if (!s) return; const ac = await s.createActo(nombre); await get().reloadAll(); return ac; },
	updateActo: async (id, patch) => { const s = get().store; if (!s) return; await s.updateActo(id, patch); await get().reloadAll(); },
	deleteActo: async (id) => { const s = get().store; if (!s) return; try { await s.deleteActo(id); } catch (e: any) { alert(e.message); } await get().reloadAll(); },
	createCapitulo: async (idActo, nombre, orden) => { const s = get().store; if (!s) return; const cap = await s.createCapitulo(idActo, nombre, orden); await get().reloadAll(); return cap; },
	updateCapitulo: async (id, patch) => { const s = get().store; if (!s) return; await s.updateCapitulo(id, patch); await get().reloadAll(); },
	deleteCapitulo: async (id) => { const s = get().store; if (!s) return; try { await s.deleteCapitulo(id); } catch (e: any) { alert(e.message); } await get().reloadAll(); },
	ensureCapituloArchivo: async (id) => { const s = get().store; if (!s) return null; const path = await s.ensureCapituloArchivo(id); await get().reloadAll(); return path; },
	writeCapituloTexto: async (id, content) => { const s = get().store; if (!s) return null; return s.writeCapituloTexto(id, content); },
	readCapituloTexto: async (id) => { const s = get().store; if (!s) return ''; return s.readCapituloTexto(id); },
	linkCapituloArchivo: async (id, path) => { const s = get().store; if (!s) return; await s.linkCapituloArchivo(id, path); await get().reloadAll(); },
	reconcileCapituloArchivos: async () => { const s = get().store; if (!s) return; await s.reconcileCapituloArchivos(); await get().reloadAll(); },
	createEscena: async (idCap, orden) => { const s = get().store; if (!s) return; const es = await s.createEscena(idCap, orden); await get().reloadAll(); return es; },
	updateEscena: async (id, patch) => { const s = get().store; if (!s) return; await s.updateEscena(id, patch); await get().reloadAll(); },
	deleteEscena: async (id) => { const s = get().store; if (!s) return; await s.deleteEscena(id); await get().reloadAll(); },
	writeEscenaTexto: async (id, content) => { const s = get().store; if (!s) return; await s.writeEscenaTexto(id, content); },

	createDetalle: async (nombre, tipo, incluirIa) => { const s = get().store; if (!s) return; await s.createDetalle(nombre, tipo, incluirIa); await get().reloadAll(); },
	updateDetalle: async (d) => { const s = get().store; if (!s) return; await s.updateDetalle(d); await get().reloadAll(); },
	deleteDetalle: async (id) => { const s = get().store; if (!s) return; await s.deleteDetalle(id); await get().reloadAll(); },
	setDetalleCategorias: async (idDetalle, idCategorias) => { const s = get().store; if (!s) return; await s.setDetalleCategorias(idDetalle, idCategorias); await get().reloadAll(); },
	upsertOpcion: async (op) => { const s = get().store; if (!s) return; await s.upsertOpcion(op); await get().reloadAll(); },
	deleteOpcion: async (id) => { const s = get().store; if (!s) return; await s.deleteOpcion(id); await get().reloadAll(); },
	listOpcionesByDetalle: async (idDetalle) => { const s = get().store; if (!s) return []; return await s.listOpcionesByDetalle(idDetalle); },
	getDetallesByCategoria: async (idCategoria) => { const s = get().store; if (!s) return []; return await s.getDetallesByCategoria(idCategoria); },
	setDetalleValor: async (idEntry, idDetalle, valor) => { const s = get().store; if (!s) return; await s.setDetalleValor!(idEntry, idDetalle, valor); },

	refreshEntry: async (id) => { const s = get().store; if (!s) return; const e = await s.readEntry(id); if (e) set({ entradas: get().entradas.map(x => x.id_entrada_codex === id ? e : x) }); },

	createSnippet: async (nombre) => { const s = get().store; if (!s) return null; const sn = await s.createSnippet(nombre); await get().reloadAll(); return sn; },
	updateSnippet: async (sn) => { const s = get().store; if (!s) return; await s.updateSnippet(sn); await get().reloadAll(); },
	openSnippetEditor: (id) => set({ snippetEditorId: id, activeWorkTab: 'escribir' }),
	writeSnippetTexto: async (id, texto) => { const s = get().store; if (!s) return; await s.writeSnippetTexto(id, texto); },

	createChat: async (nombre) => { const s = get().store; if (!s) return null; const c = await s.createChat(nombre); await get().reloadAll(); return c; },
	selectChat: (id) => set({ activeChatId: id }),
	 renameChat: async (id, nombre) => { const s = get().store; if (!s) return; await s.renameChat(id, nombre); await get().reloadAll(); },
	deleteChat: async (id) => { const s = get().store; if (!s) return; await s.deleteChat(id); if (get().activeChatId === id) set({ activeChatId: null }); await get().reloadAll(); },
	appendMensaje: async (role, msg) => { const s = get().store; if (!s || !get().activeChatId) return; await s.appendMensaje(get().activeChatId, role, msg); },
}));
