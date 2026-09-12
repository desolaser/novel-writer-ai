import type { Acto, Capitulo, Categoria, Detalle, EntradaCodex, EntityId, OpcionDetalle } from '../domain';

/**
 * Contracts between the tools layer and whatever holds the novel's data.
 *
 * The tools depend on these abstractions, never on the React store, so they stay
 * testable and the UI keeps the job of wiring an implementation. Lists are read
 * through functions because a write tool reloads the store mid-turn and later
 * calls in the same turn must see the fresh state.
 *
 * Split by domain (chapters/acts vs. codex) rather than one flat interface: chapter
 * tools never touch codex methods and vice versa, so each tool module can depend on
 * only the slice it actually calls. `ToolContext` is the union the single store
 * adapter implements today.
 */
export interface ChapterToolContext {
	listChapters(): Capitulo[];
	listActs(): Acto[];
	readChapterText(id: EntityId): Promise<string>;

	createAct(nombre: string): Promise<Acto | undefined>;
	createChapter(idActo: EntityId, nombre: string, orden: number): Promise<Capitulo | undefined>;
	updateChapter(id: EntityId, patch: Partial<Capitulo>): Promise<void>;
	writeChapterText(id: EntityId, content: string): Promise<string | null>;
}

export interface CodexToolContext {
	listCodexEntries(): EntradaCodex[];
	listCategories(): Categoria[];
	listDetalles(): Detalle[];
	listOptions(idDetalle: EntityId): Promise<OpcionDetalle[]>;

	createCodexEntry(idCategoria: EntityId, nombre: string): Promise<EntradaCodex | null>;
	updateCodexEntry(entry: EntradaCodex): Promise<void>;
}

export type ToolContext = ChapterToolContext & CodexToolContext;
