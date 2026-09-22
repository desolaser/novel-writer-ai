import type { NovelSlice, SliceCreator } from "../types";

export const createNovelSlice: SliceCreator<NovelSlice> = (set, get) => ({
	settingsRevision: 0,
	store: null,
	settings: null,
	novels: [],
	activeNovelId: null,
	loading: false,
	activeSidebarTab: "codex",

	bindStore: (s) => set({ store: s }),
	bindSettings: (s) => set({ settings: s }),
	refreshNovels: async () => {
		const s = get().store;
		if (!s) return;
		await s.refresh();
		set({ novels: [...s.novels] });
	},
	updateNovel: async (id, patch, thumbnailFile = null) => {
		const s = get().store;
		if (!s) return;
		await s.updateNovel(id, patch, thumbnailFile);
		set({ novels: [...s.novels] });
	},
	deleteNovel: async (id, deleteFolder = false) => {
		const s = get().store;
		if (!s) return;
		await s.deleteNovel(id, deleteFolder);
		set({ novels: [...s.novels] });
		if (get().activeNovelId === id) await get().setActiveNovel(null);
	},

	setActiveNovel: async (id) => {
		const s = get().store;
		if (!s) return;
		set({
			loading: true,
			editingEntryId: null,
			activeChatId: null,
		});
		await s.setActive(id);
		set({ activeNovelId: id, loading: false });
		if (id) await get().reloadAll();
		else
			set({
				categorias: [],
				entradas: [],
				actos: [],
				capitulos: [],
				chats: [],
				tags: [],
				etiquetas: [],
				detalles: [],
			});
	},

	reloadAll: async () => {
		const s = get().store;
		if (!s || !s.activeNovelId) return;
		await s.reconcileCapituloArchivos();
		const [
			categorias,
			etiquetas,
			tags,
			detalles,
			entradas,
			actos,
			capitulos,
			chats,
		] = await Promise.all([
			s.listCategorias(),
			s.listEtiquetas(),
			s.listTags(),
			s.listDetalles(),
			s.listEntries(),
			s.listActos(),
			s.listCapitulos(),
			s.listChats(),
		]);
		set({
			categorias,
			etiquetas,
			tags,
			detalles,
			entradas,
			actos,
			capitulos,
			chats,
		});
	},

	setSidebarTab: (t) => set({ activeSidebarTab: t }),
});
