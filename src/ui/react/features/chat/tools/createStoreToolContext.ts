import type { ToolContext } from '../../../../../interfaces/tool-context';
import { useNovelWriter } from '../../../store/novelWriterStore';

/**
 * Adapter binding the tools layer to the React store.
 *
 * Every read goes through `getState()` at call time rather than through a captured
 * snapshot: a write tool reloads the store mid-turn, and the calls that follow it
 * in the same answer must see what it just changed.
 */
export function createStoreToolContext(): ToolContext {
	const state = () => useNovelWriter.getState() as any;
	return {
		listChapters: () => state().capitulos ?? [],
		listActs: () => state().actos ?? [],
		listCodexEntries: () => state().entradas ?? [],
		listCategories: () => state().categorias ?? [],
		listDetalles: () => state().detalles ?? [],
		readChapterText: (id) => state().readCapituloTexto(id),
		listOptions: (idDetalle) => state().listOpcionesByDetalle(idDetalle),

		createAct: (nombre) => state().createActo(nombre),
		createChapter: (idActo, nombre, orden) => state().createCapitulo(idActo, nombre, orden),
		updateChapter: (id, patch) => state().updateCapitulo(id, patch),
		writeChapterText: (id, content) => state().writeCapituloTexto(id, content),
		createCodexEntry: (idCategoria, nombre) => state().createEntry(idCategoria, nombre),
		updateCodexEntry: (entry) => state().updateEntry(entry),
	};
}
