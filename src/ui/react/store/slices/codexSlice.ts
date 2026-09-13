import type { CodexSlice, SliceCreator } from "../types";

export const createCodexSlice: SliceCreator<CodexSlice> = (set, get) => ({
	categorias: [],
	etiquetas: [],
	tags: [],
	entradas: [],
	editingEntryId: null,

	createEntry: async (idCategoria, nombre) => {
		const s = get().store;
		if (!s) return null;
		const created = await s.createEntry(idCategoria, nombre);
		await get().reloadAll();
		return created ?? null;
	},
	updateEntry: async (e) => {
		const s = get().store;
		if (!s) return;
		await s.writeEntry(e);
		set({
			entradas: get().entradas.map((x) =>
				x.id_entrada_codex === e.id_entrada_codex ? e : x
			),
		});
	},
	deleteEntry: async (id) => {
		const s = get().store;
		if (!s) return;
		await s.deleteEntry(id);
		set({ editingEntryId: null });
		await get().reloadAll();
	},
	archiveEntry: async (id, archived) => {
		const s = get().store;
		if (!s) return;
		await s.archiveEntry(id, archived);
		if (archived) set({ editingEntryId: null });
		await get().reloadAll();
	},
	moveEntryToNovel: async (idEntry, targetNovelId) => {
		const s = get().store;
		if (!s) return;
		await s.moveEntryToNovel(idEntry, targetNovelId);
		set({ editingEntryId: null });
		await get().reloadAll();
	},
	copyEntryToNovel: async (idEntry, targetNovelId) => {
		const s = get().store;
		if (!s) return;
		await s.copyEntryToNovel(idEntry, targetNovelId);
	},
	setEntryThumbnail: async (idEntry, dataUrl) => {
		const s = get().store;
		if (!s) return;
		await s.setEntryThumbnail(idEntry, dataUrl);
		await get().reloadAll();
	},
	setEditingEntry: (id) => set({ editingEntryId: id }),
	addReferencia: async (idEntry, url) => {
		const s = get().store;
		if (!s) return null;
		const ref = await s.addReferencia(idEntry, url);
		return ref;
	},
	removeReferencia: async (idEntry, idRef) => {
		const s = get().store;
		if (!s) return;
		await s.removeReferencia(idEntry, idRef);
	},
	setEntryTags: async (idEntry, tagIds) => {
		const s = get().store;
		if (!s) return;
		await s.setEntryTags(idEntry, tagIds);
		set({
			entradas: get().entradas.map((x) =>
				x.id_entrada_codex === idEntry
					? { ...x, tags: Array.from(new Set(tagIds)) }
					: x
			),
		});
	},
	findOrCreateTag: async (name) => {
		const s = get().store;
		if (!s) throw new Error("store not bound");
		const t = await s.findOrCreateTag(name);
		const existing = get().tags.find((x) => x.id_tag === t.id_tag);
		if (!existing) set({ tags: [...get().tags, t] });
		return t;
	},

	createCategoria: async (nombre, color) => {
		const s = get().store;
		if (!s) return;
		await s.createCategoriaCustom(nombre, color);
		await get().reloadAll();
	},
	updateCategoria: async (cat) => {
		const s = get().store;
		if (!s) return;
		await s.updateCategoria(cat);
		await get().reloadAll();
	},
	deleteCategoria: async (id) => {
		const s = get().store;
		if (!s) return;
		await s.deleteCategoria(id);
		await get().reloadAll();
	},

	refreshEntry: async (id) => {
		const s = get().store;
		if (!s) return;
		const e = await s.readEntry(id);
		if (e)
			set({
				entradas: get().entradas.map((x) =>
					x.id_entrada_codex === id ? e : x
				),
			});
	},
});
