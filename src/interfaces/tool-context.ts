import type { Acto, Capitulo, Categoria, Detalle, EntradaCodex, EntityId, OpcionDetalle } from '../domain';

/**
 * Contract between the tools layer and whatever holds the novel's data.
 *
 * The tools depend on this abstraction, never on the React store, so they stay
 * testable and the UI keeps the job of wiring an implementation. Lists are read
 * through functions because a write tool reloads the store mid-turn and later
 * calls in the same turn must see the fresh state.
 */
export interface ToolContext {
	// ---- Reads ----
	listChapters(): Capitulo[];
	listActs(): Acto[];
	listCodexEntries(): EntradaCodex[];
	listCategories(): Categoria[];
	listDetalles(): Detalle[];
	readChapterText(id: EntityId): Promise<string>;
	listOptions(idDetalle: EntityId): Promise<OpcionDetalle[]>;

	// ---- Writes ----
	createAct(nombre: string): Promise<Acto | undefined>;
	createChapter(idActo: EntityId, nombre: string, orden: number): Promise<Capitulo | undefined>;
	updateChapter(id: EntityId, patch: Partial<Capitulo>): Promise<void>;
	writeChapterText(id: EntityId, content: string): Promise<string | null>;
	createCodexEntry(idCategoria: EntityId, nombre: string): Promise<EntradaCodex | null>;
	updateCodexEntry(entry: EntradaCodex): Promise<void>;
}
