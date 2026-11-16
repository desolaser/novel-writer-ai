import type { NovelToolContext } from '../../../../../interfaces/tool-context';
import { createEmptyBlueprint } from '../../../../../domain';
import { useNovelWriter } from '../../../store/novelWriterStore';

/**
 * Adapter binding the novel's data tools to the React store.
 *
 * Every read goes through `getState()` at call time rather than through a captured
 * snapshot: a write tool reloads the store mid-turn, and the calls that follow it
 * in the same answer must see what it just changed.
 */
export function createStoreToolContext(): NovelToolContext {
	const state = () => useNovelWriter.getState() as any;
	return {
		listChapters: () => state().capitulos ?? [],
		listActs: () => state().actos ?? [],
		listCodexEntries: () => state().entradas ?? [],
		listCategories: () => state().categorias ?? [],
		listDetalles: () => state().detalles ?? [],
		listTags: () => state().tags ?? [],
		readChapterText: (id) => state().readCapituloTexto(id),
		listOptions: (idDetalle) => state().listOpcionesByDetalle(idDetalle),
		listDetailsOfCategory: (idCategoria) => state().getDetallesByCategoria(idCategoria),
		readBlueprint: async () => (await state().store?.readBlueprint()) ?? null,
		updateBlueprint: async (patch) => {
			const store = state().store;
			if (!store?.activeNovelId) throw new Error('No novel is open.');
			const scan = (state().novels ?? []).find((item: any) =>
				item.novela.id_novela === store.activeNovelId);
			const current = await store.readBlueprint()
				?? createEmptyBlueprint(store.activeNovelId, scan?.novela.nombre ?? '');
			await store.writeBlueprint({ ...current, ...patch });
		},

		createAct: (nombre) => state().createActo(nombre),
		updateAct: (id, patch) => state().updateActo(id, patch),
		createChapter: (idActo, nombre, orden) => state().createCapitulo(idActo, nombre, orden),
		updateChapter: (id, patch) => state().updateCapitulo(id, patch),
		deleteChapter: (id) => state().deleteCapitulo(id),
		writeChapterText: (id, content) => state().writeCapituloTexto(id, content),
		createCodexEntry: (idCategoria, nombre) => state().createEntry(idCategoria, nombre),
		updateCodexEntry: (entry) => state().updateEntry(entry),
		archiveCodexEntry: (id) => state().archiveEntry(id, true),
		setDetailValue: async (idEntry, idDetalle, valor) => {
			await state().setDetalleValor(idEntry, idDetalle, valor);
			// The slice only writes the file; the entry in the store is refreshed here
			// so the next call of the same turn reads the new value.
			await state().refreshEntry(idEntry);
		},
		findOrCreateTag: (nombre) => state().findOrCreateTag(nombre),
		setEntryTags: (idEntry, tagIds) => state().setEntryTags(idEntry, tagIds),
	};
}
