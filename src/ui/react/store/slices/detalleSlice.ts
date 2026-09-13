import type { DetalleSlice, SliceCreator } from "../types";

export const createDetalleSlice: SliceCreator<DetalleSlice> = (set, get) => ({
	detalles: [],

	createDetalle: async (nombre, tipo, incluirIa) => {
		const s = get().store;
		if (!s) return;
		await s.createDetalle(nombre, tipo, incluirIa);
		await get().reloadAll();
	},
	updateDetalle: async (d) => {
		const s = get().store;
		if (!s) return;
		await s.updateDetalle(d);
		await get().reloadAll();
	},
	deleteDetalle: async (id) => {
		const s = get().store;
		if (!s) return;
		await s.deleteDetalle(id);
		await get().reloadAll();
	},
	setDetalleCategorias: async (idDetalle, idCategorias) => {
		const s = get().store;
		if (!s) return;
		await s.setDetalleCategorias(idDetalle, idCategorias);
		await get().reloadAll();
	},
	upsertOpcion: async (op) => {
		const s = get().store;
		if (!s) return;
		await s.upsertOpcion(op);
		await get().reloadAll();
	},
	deleteOpcion: async (id) => {
		const s = get().store;
		if (!s) return;
		await s.deleteOpcion(id);
		await get().reloadAll();
	},
	listOpcionesByDetalle: async (idDetalle) => {
		const s = get().store;
		if (!s) return [];
		return await s.listOpcionesByDetalle(idDetalle);
	},
	getDetallesByCategoria: async (idCategoria) => {
		const s = get().store;
		if (!s) return [];
		return await s.getDetallesByCategoria(idCategoria);
	},
	setDetalleValor: async (idEntry, idDetalle, valor) => {
		const s = get().store;
		if (!s) return;
		await s.setDetalleValor!(idEntry, idDetalle, valor);
	},
	reorderDetalles: async (orderedIds) => {
		const s = get().store;
		if (!s) return;
		await s.reorderDetalles(orderedIds);
		await get().reloadAll();
	},
	reorderEntryDetalles: async (idEntry, orderedDetalleIds) => {
		const s = get().store;
		if (!s) return;
		await s.reorderEntryDetalles(idEntry, orderedDetalleIds);
	},
});
