import type { OutlineSlice, SliceCreator } from "../types";

export const createOutlineSlice: SliceCreator<OutlineSlice> = (set, get) => ({
	actos: [],
	capitulos: [],

	createActo: async (nombre) => {
		const s = get().store;
		if (!s) return;
		const ac = await s.createActo(nombre);
		await get().reloadAll();
		return ac;
	},
	updateActo: async (id, patch) => {
		const s = get().store;
		if (!s) return;
		await s.updateActo(id, patch);
		await get().reloadAll();
	},
	deleteActo: async (id) => {
		const s = get().store;
		if (!s) return;
		try {
			await s.deleteActo(id);
		} catch (e: any) {
			alert(e.message);
		}
		await get().reloadAll();
	},
	createCapitulo: async (idActo, nombre, orden) => {
		const s = get().store;
		if (!s) return;
		const cap = await s.createCapitulo(idActo, nombre, orden);
		await get().reloadAll();
		return cap;
	},
	updateCapitulo: async (id, patch) => {
		const s = get().store;
		if (!s) return;
		await s.updateCapitulo(id, patch);
		await get().reloadAll();
	},
	deleteCapitulo: async (id) => {
		const s = get().store;
		if (!s) return;
		try {
			await s.deleteCapitulo(id);
		} catch (e: any) {
			alert(e.message);
		}
		await get().reloadAll();
	},
	ensureCapituloArchivo: async (id) => {
		const s = get().store;
		if (!s) return null;
		const path = await s.ensureCapituloArchivo(id);
		await get().reloadAll();
		return path;
	},
	writeCapituloTexto: async (id, content) => {
		const s = get().store;
		if (!s) return null;
		return s.writeCapituloTexto(id, content);
	},
	readCapituloTexto: async (id) => {
		const s = get().store;
		if (!s) return "";
		return s.readCapituloTexto(id);
	},
	linkCapituloArchivo: async (id, path) => {
		const s = get().store;
		if (!s) return;
		await s.linkCapituloArchivo(id, path);
		await get().reloadAll();
	},
	reconcileCapituloArchivos: async () => {
		const s = get().store;
		if (!s) return;
		await s.reconcileCapituloArchivos();
		await get().reloadAll();
	},
	replaceEstructura: async (drafts) => {
		const s = get().store;
		if (!s) return;
		await s.replaceEstructura(drafts);
		await get().reloadAll();
	},
});
