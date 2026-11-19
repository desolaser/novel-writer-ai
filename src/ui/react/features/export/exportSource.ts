import type { Capitulo, EntityId } from "../../../../domain";
import type { ExportSource } from "../../../../utils/manuscriptExport/exportBook";
import { chaptersInOrder } from "../../../../utils/novelMetrics";
import { useNovelWriter } from "../../store/novelWriterStore";

/** The active novel, ready for the export functions. */
export interface LoadedNovel {
	novelId: EntityId;
	folder: string;
	source: ExportSource;
}

/** Chapters of the active novel in reading order. */
export function readingOrder(): Capitulo[] {
	const state = useNovelWriter.getState();
	return chaptersInOrder(state.actos, state.capitulos);
}

/** Text of a chapter's manuscript; empty when it has no file yet. */
export async function readChapterText(chapter: Capitulo): Promise<string> {
	if (!chapter.archivo) return "";
	return useNovelWriter.getState().readCapituloTexto(chapter.id_capitulo);
}

/**
 * Reads everything an export needs from the store and the manuscripts. The
 * book title is the Novel Setup's title, or the novel's name without one.
 */
export async function loadActiveNovel(): Promise<LoadedNovel> {
	const state = useNovelWriter.getState();
	const store = state.store;
	const novelId = store?.activeNovelId;
	const folder = store?.activeFolderPath;
	if (!store || !novelId || !folder) throw new Error("No novel is open.");

	const novel = state.novels.find((item) => item.novela.id_novela === novelId);
	const blueprint = await store.readBlueprint();
	const texts = new Map<EntityId, string>();
	for (const chapter of state.capitulos) {
		const text = await readChapterText(chapter);
		if (text) texts.set(chapter.id_capitulo, text);
	}
	return {
		novelId,
		folder,
		source: {
			title: blueprint?.title?.trim() || novel?.novela.nombre || "",
			author: novel?.novela.autor ?? "",
			language: blueprint?.language ?? "",
			acts: state.actos,
			chapters: state.capitulos,
			texts,
		},
	};
}
