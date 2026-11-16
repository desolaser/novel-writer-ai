import { MarkdownView, TFile, type App, type Editor } from 'obsidian';
import type NovelWriterPlugin from '../../../../../../main';
import type {
	EditorSelectionInfo,
	EditorToolContext,
	NavigationToolContext,
	NoteLookup,
	NoteToolContext,
} from '../../../../../interfaces/tool-context';
import { resolveChapterFile } from '../../../../../infrastructure/storage/repos/EstructuraRepo';
import { openCodexEntry } from '../../../../views/openCodexEntry';
import { useNovelWriter } from '../../../store/novelWriterStore';

/**
 * Adapter binding the workspace tools to Obsidian: open views, read the editor
 * selection, find and read notes of the vault. Nothing here writes.
 */

const MAX_SUGGESTIONS = 8;

/** The Markdown editor the author used last, even while the chat has focus. */
function recentMarkdownView(app: App): MarkdownView | null {
	const recent = app.workspace.getMostRecentLeaf(app.workspace.rootSplit)?.view;
	if (recent instanceof MarkdownView) return recent;
	return app.workspace.getActiveViewOfType(MarkdownView);
}

/** Lines around the cursor up to the blank lines that bound its paragraph. */
function paragraphAtCursor(editor: Editor): string {
	const line = editor.getCursor().line;
	const isBlank = (index: number) => !editor.getLine(index).trim();
	if (isBlank(line)) return '';
	let first = line;
	let last = line;
	while (first > 0 && !isBlank(first - 1)) first -= 1;
	while (last < editor.lineCount() - 1 && !isBlank(last + 1)) last += 1;
	return editor.getRange({ line: first, ch: 0 }, { line: last, ch: editor.getLine(last).length });
}

/** Notes the tools may read: Markdown, outside Obsidian's config folder. */
function isReadableNote(app: App, file: unknown): file is TFile {
	if (!(file instanceof TFile) || file.extension !== 'md') return false;
	return !file.path.startsWith(`${app.vault.configDir}/`);
}

function findNoteFile(app: App, reference: string): TFile | null {
	const clean = reference.trim().replace(/^\[\[|\]\]$/g, '');
	const withExtension = clean.endsWith('.md') ? clean : `${clean}.md`;
	const direct = app.vault.getAbstractFileByPath(withExtension);
	if (isReadableNote(app, direct)) return direct;
	const linked = app.metadataCache.getFirstLinkpathDest(clean.replace(/\.md$/, ''), '');
	return isReadableNote(app, linked) ? linked : null;
}

function suggestNotes(app: App, reference: string): string[] {
	const needle = reference.trim().toLowerCase().replace(/\.md$/, '');
	return app.vault.getMarkdownFiles()
		.filter((file) => isReadableNote(app, file))
		.filter((file) => file.basename.toLowerCase().includes(needle))
		.slice(0, MAX_SUGGESTIONS)
		.map((file) => file.path);
}

export function createWorkspaceToolContext(
	plugin: NovelWriterPlugin,
): NavigationToolContext & EditorToolContext & NoteToolContext {
	const app = plugin.app;
	const chapterOf = (id: string) =>
		(useNovelWriter.getState().capitulos ?? []).find((item) => item.id_capitulo === id);

	return {
		openChapterFile: async (id) => {
			const chapter = chapterOf(id);
			const folder = plugin.store.activeFolderPath;
			if (!chapter?.archivo || !folder) return false;
			const file = await resolveChapterFile(app, folder, id, chapter.archivo);
			if (!file) return false;
			await app.workspace.openLinkText(file.path, '', false);
			return true;
		},
		openChapterOutline: (id) => plugin.openOutlineChapter(id),
		openCodexEntry: (id) => openCodexEntry(plugin, id),

		readEditorSelection: (): EditorSelectionInfo | null => {
			const view = recentMarkdownView(app);
			if (!view?.file) return null;
			return {
				notePath: view.file.path,
				selection: view.editor.getSelection(),
				cursorParagraph: paragraphAtCursor(view.editor),
			};
		},

		findNote: (reference): NoteLookup => {
			const file = findNoteFile(app, reference);
			if (file) return { path: file.path, suggestions: [] };
			return { path: null, suggestions: suggestNotes(app, reference) };
		},
		readNote: async (path) => {
			const file = app.vault.getAbstractFileByPath(path);
			if (!isReadableNote(app, file)) throw new Error(`"${path}" is not a readable note.`);
			return app.vault.cachedRead(file);
		},
	};
}
