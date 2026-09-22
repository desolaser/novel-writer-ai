import type { StateCreator } from "zustand";
import {
	EntradaCodex,
	Categoria,
	Detalle,
	Etiqueta,
	Tag,
	Acto,
	Capitulo,
	Chat,
	ChatContextItem,
	EntityId,
	OpcionDetalle,
	TipoDetalle,
	CustomPrompt,
} from "../../../domain";
import {
	NovelStore,
	NovelScanResult,
} from "../../../infrastructure/storage/store";
import type { ActoDraft } from "../../../infrastructure/storage/repos/EstructuraRepo";
import type { SettingsService } from "../../../infrastructure/settings/settings-service";

export interface UIState {
	settingsRevision: number;
	activeSidebarTab: "codex" | "config" | "chats";
}

export interface NovelSlice extends UIState {
	store: NovelStore | null;
	settings: SettingsService | null;
	novels: NovelScanResult[];
	activeNovelId: string | null;
	loading: boolean;

	bindStore: (s: NovelStore) => void;
	bindSettings: (s: SettingsService) => void;
	refreshNovels: () => Promise<void>;
	setActiveNovel: (id: string | null) => Promise<void>;
	updateNovel: (id: string, patch: { nombre: string; autor: string }, thumbnailFile?: ArrayBuffer | null) => Promise<void>;
	deleteNovel: (id: string, deleteFolder?: boolean) => Promise<void>;
	/** Reloads every collection of the active novel. Cross-domain, so it lives on
	 * this slice, but every other slice's mutations call it after a write. */
	reloadAll: () => Promise<void>;
	setSidebarTab: (t: UIState["activeSidebarTab"]) => void;
}

export interface CodexSlice {
	categorias: Categoria[];
	etiquetas: Etiqueta[];
	tags: Tag[];
	entradas: EntradaCodex[];
	editingEntryId: EntityId | null;

	/** Creates an entry and returns it, so callers can link to it right away. */
	createEntry: (idCategoria: EntityId, nombre: string) => Promise<EntradaCodex | null>;
	updateEntry: (e: EntradaCodex) => Promise<void>;
	deleteEntry: (id: EntityId) => Promise<void>;
	archiveEntry: (id: EntityId, archived: boolean) => Promise<void>;
	moveEntryToNovel: (idEntry: EntityId, targetNovelId: EntityId) => Promise<void>;
	copyEntryToNovel: (idEntry: EntityId, targetNovelId: EntityId) => Promise<void>;
	setEntryThumbnail: (idEntry: EntityId, dataUrl: string | null) => Promise<void>;
	setEditingEntry: (id: EntityId | null) => void;
	addReferencia: (idEntry: EntityId, url: string) => Promise<any>;
	removeReferencia: (idEntry: EntityId, idRef: EntityId) => Promise<void>;
	setEntryTags: (idEntry: EntityId, tagIds: EntityId[]) => Promise<void>;
	findOrCreateTag: (name: string) => Promise<Tag>;

	createCategoria: (nombre: string, color: string) => Promise<void>;
	updateCategoria: (cat: Categoria) => Promise<void>;
	deleteCategoria: (id: EntityId) => Promise<void>;

	refreshEntry: (id: EntityId) => Promise<void>;
}

export interface OutlineSlice {
	actos: Acto[];
	capitulos: Capitulo[];

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
	/** Rewrites every act and chapter from a blueprint layout. */
	replaceEstructura: (drafts: ActoDraft[]) => Promise<void>;
}

export interface DetalleSlice {
	detalles: Detalle[];

	createDetalle: (nombre: string, tipo: TipoDetalle, incluirIa: boolean) => Promise<void>;
	updateDetalle: (d: Detalle) => Promise<void>;
	deleteDetalle: (id: EntityId) => Promise<void>;
	setDetalleCategorias: (idDetalle: EntityId, idCategorias: EntityId[]) => Promise<void>;
	upsertOpcion: (op: OpcionDetalle) => Promise<void>;
	deleteOpcion: (id: EntityId) => Promise<void>;
	listOpcionesByDetalle: (idDetalle: EntityId) => Promise<OpcionDetalle[]>;
	getDetallesByCategoria: (idCategoria: EntityId) => Promise<Detalle[]>;
	setDetalleValor: (idEntry: EntityId, idDetalle: EntityId, valor: string | null) => Promise<void>;
	reorderDetalles: (orderedIds: EntityId[]) => Promise<void>;
	reorderEntryDetalles: (idEntry: EntityId, orderedDetalleIds: EntityId[]) => Promise<void>;
}

export interface ChatSlice {
	chats: Chat[];
	activeChatId: EntityId | null;

	createChat: (nombre: string) => Promise<Chat | null>;
	selectChat: (id: EntityId | null) => void;
	renameChat: (id: EntityId, nombre: string) => Promise<void>;
	deleteChat: (id: EntityId) => Promise<void>;
	appendMensaje: (role: "user" | "assistant", msg: string, imagenes?: string[]) => Promise<void>;
	updateMensaje: (idChat: EntityId, idMsg: EntityId, msg: string) => Promise<void>;
	deleteMensaje: (idChat: EntityId, idMsg: EntityId) => Promise<void>;
	saveChatContext: (idChat: EntityId, contextItems: ChatContextItem[], characterContext: ChatContextItem | null, impersonateContext: ChatContextItem | null) => Promise<void>;
}

export interface PromptsSlice {
	getCustomPrompts: () => CustomPrompt[];
	getDefaultChatPrompt: () => CustomPrompt | undefined;
	getDefaultTextPrompt: () => CustomPrompt | undefined;
	createCustomPrompt: (
		tipo: 'chat' | 'text', nombre: string, texto: string,
		plantilla?: string,
	) => Promise<CustomPrompt>;
	updateCustomPrompt: (
		id: string,
		patch: Partial<Pick<CustomPrompt, 'nombre' | 'texto' | 'plantilla'>>,
	) => Promise<void>;
	deleteCustomPrompt: (id: string) => Promise<boolean>;
	setDefaultPrompt: (tipo: 'chat' | 'text', id: string) => Promise<void>;
}

export type NovelWriterStore = NovelSlice & CodexSlice & OutlineSlice & DetalleSlice & ChatSlice & PromptsSlice;

/** A slice creator sees the whole combined store through `get`/`set` (so it can
 * read or update another slice's state), but only returns its own piece of it. */
export type SliceCreator<T> = StateCreator<NovelWriterStore, [], [], T>;
