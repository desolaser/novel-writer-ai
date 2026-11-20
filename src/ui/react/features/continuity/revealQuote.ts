import { MarkdownView } from "obsidian";
import type NovelWriterPlugin from "../../../../../main";
import type { Capitulo } from "../../../../domain";
import { resolveChapterFile } from "../../../../infrastructure/storage/repos/EstructuraRepo";
import { findQuote } from "../../../../utils/quoteLocation";

/**
 * Opens a chapter's manuscript and selects a quoted passage. Returns false
 * when the chapter has no file or the passage is no longer in the text.
 */
export async function revealQuote(
	plugin: NovelWriterPlugin,
	chapter: Capitulo,
	quote: string,
): Promise<boolean> {
	const app = plugin.app;
	const folder = plugin.store.activeFolderPath;
	if (!chapter.archivo || !folder) return false;
	const file = await resolveChapterFile(
		app, folder, chapter.id_capitulo, chapter.archivo,
	);
	if (!file) return false;
	const leaf = app.workspace.getLeaf(false);
	await leaf.openFile(file);
	const view = leaf.view;
	if (!(view instanceof MarkdownView)) return false;
	const editor = view.editor;
	const range = findQuote(editor.getValue(), quote);
	if (!range) return false;
	const from = editor.offsetToPos(range.start);
	const to = editor.offsetToPos(range.end);
	editor.setSelection(from, to);
	editor.scrollIntoView({ from, to }, true);
	editor.focus();
	return true;
}
