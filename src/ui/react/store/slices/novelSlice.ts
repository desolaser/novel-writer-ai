import type { NovelSlice, SliceCreator } from "../types";
import type { SettingsService } from "../../../../infrastructure/settings/settings-service";

/** Saves the open novel so the next load reopens it. */
function rememberActiveNovel(
	settings: SettingsService | null,
	id: string | null,
): void {
	if (!settings || settings.data.lastActiveNovelId === id) return;
	settings.data.lastActiveNovelId = id;
	void settings.save();
}

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
		// Opening a second view calls this again with the same novel. Clearing
		// the chat then made the next message start a brand new chat.
		const changed = id !== get().activeNovelId;
		const previousChatId = get().activeChatId;
		set({
			loading: true,
			...(changed ? { activeChatId: null } : {}),
		});
		const found = await s.setActive(id);
		if (!found) {
			// The store kept the previous novel; keep the UI on it too.
			set({ loading: false, activeChatId: previousChatId });
			return;
		}
		set({ activeNovelId: id, loading: false });
		rememberActiveNovel(get().settings, id);
		if (id) {
			await get().reloadAll();
			if (changed) {
				const remembered =
					get().settings?.data.uiPrefs.activeChatIds?.[id] ?? null;
				const exists = get().chats.some((c) => c.id_chat === remembered);
				set({ activeChatId: exists ? remembered : null });
			}
		} else
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
		const activeChatId = get().activeChatId;
		if (activeChatId && !chats.some((c) => c.id_chat === activeChatId))
			set({ activeChatId: null });
	},

	setSidebarTab: (t) => set({ activeSidebarTab: t }),
});
