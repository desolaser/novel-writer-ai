import type {
	Acto,
	Capitulo,
	Categoria,
	Detalle,
	EntradaCodex,
	EntityId,
	NovelBlueprint,
	OpcionDetalle,
	Tag,
} from '../domain';
import type { PromptMetaKey } from '../types/PromptMeta';

/**
 * Contracts between the tools layer and whatever holds the novel's data.
 *
 * The tools depend on these abstractions, never on the React store, so they stay
 * testable and the UI keeps the job of wiring an implementation. Lists are read
 * through functions because a write tool reloads the store mid-turn and later
 * calls in the same turn must see the fresh state.
 *
 * Split by domain rather than one flat interface: each tool module depends on
 * only the slice it actually calls. `ToolContext` is the union the chat wires
 * today, from a store adapter and a workspace adapter.
 */
export interface ChapterToolContext {
	listChapters(): Capitulo[];
	listActs(): Acto[];
	readChapterText(id: EntityId): Promise<string>;

	createAct(nombre: string): Promise<Acto | undefined>;
	updateAct(id: EntityId, patch: Partial<Acto>): Promise<void>;
	createChapter(idActo: EntityId, nombre: string, orden: number): Promise<Capitulo | undefined>;
	updateChapter(id: EntityId, patch: Partial<Capitulo>): Promise<void>;
	writeChapterText(id: EntityId, content: string): Promise<string | null>;
}

export interface CodexToolContext {
	listCodexEntries(): EntradaCodex[];
	listCategories(): Categoria[];
	listDetalles(): Detalle[];
	listOptions(idDetalle: EntityId): Promise<OpcionDetalle[]>;
	/** Details the author attached to a category, in their order. */
	listDetailsOfCategory(idCategoria: EntityId): Promise<Detalle[]>;
	listTags(): Tag[];

	createCodexEntry(idCategoria: EntityId, nombre: string): Promise<EntradaCodex | null>;
	updateCodexEntry(entry: EntradaCodex): Promise<void>;
	/** Soft delete: the author can restore it from the Codex panel. */
	archiveCodexEntry(id: EntityId): Promise<void>;
	/** `valor` is text, an option id or an entry id; null clears it. */
	setDetailValue(idEntry: EntityId, idDetalle: EntityId, valor: string | null): Promise<void>;
	findOrCreateTag(nombre: string): Promise<Tag>;
	setEntryTags(idEntry: EntityId, tagIds: EntityId[]): Promise<void>;
}

export interface BlueprintToolContext {
	readBlueprint(): Promise<NovelBlueprint | null>;
}

/** Moves the author's view; never changes the novel. */
export interface NavigationToolContext {
	/** Opens the chapter's manuscript; false when it has no file yet. */
	openChapterFile(id: EntityId): Promise<boolean>;
	openChapterOutline(id: EntityId): Promise<void>;
	openCodexEntry(id: EntityId): Promise<void>;
}

/** What the author has selected in the most recent note editor. */
export interface EditorSelectionInfo {
	notePath: string;
	selection: string;
	/** Paragraph under the cursor, for when nothing is selected. */
	cursorParagraph: string;
}

export interface EditorToolContext {
	readEditorSelection(): EditorSelectionInfo | null;
}

export interface NoteLookup {
	/** Vault path of the note, when the reference matched one. */
	path: string | null;
	/** Close names, offered when nothing matched. */
	suggestions: string[];
}

/** Markdown notes of the vault, outside the novel's own data. */
export interface NoteToolContext {
	findNote(reference: string): NoteLookup;
	readNote(path: string): Promise<string>;
}

/**
 * Memory and author note at one level: a chapter (its manuscript frontmatter)
 * or the whole novel (`_config.md` in its folder).
 */
export interface PromptMetaLayers {
	/** Value stored at this level; null when it has none. */
	own: string | null;
	/** Value this level falls back to, from parent folders or settings. */
	inherited: string;
}

export interface MemoryToolContext {
	/** `chapterId` null means the novel level. */
	readPromptMeta(chapterId: EntityId | null, key: PromptMetaKey): Promise<PromptMetaLayers>;
	writePromptMeta(chapterId: EntityId | null, key: PromptMetaKey, value: string): Promise<void>;
}

/** Data of the novel, served by the store adapter. */
export type NovelToolContext = ChapterToolContext & CodexToolContext & BlueprintToolContext;

/** Obsidian's workspace and vault, served by the workspace adapter. */
export type WorkspaceToolContext = NavigationToolContext
	& EditorToolContext
	& NoteToolContext
	& MemoryToolContext;

export type ToolContext = NovelToolContext & WorkspaceToolContext;
