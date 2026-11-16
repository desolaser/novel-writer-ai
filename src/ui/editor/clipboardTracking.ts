import { MarkdownView, type Editor, type Plugin } from 'obsidian';
import type { WritingTracker } from '../../infrastructure/storage/writingTracker';
import { countProseWords } from '../../utils/textStats';

/**
 * Tells the writing tracker about text that comes in or goes out through the
 * clipboard, so pasted words are not counted as typed and moving a paragraph
 * (cut, then paste) adds nothing.
 */

/** What a cut removes: the selection or, with nothing selected, the whole line. */
function cutText(editor: Editor): string {
	const selection = editor.getSelection();
	if (selection) return selection;
	return editor.getLine(editor.getCursor().line);
}

export function registerClipboardTracking(plugin: Plugin, tracker: WritingTracker): void {
	plugin.registerEvent(plugin.app.workspace.on('editor-paste', (event, editor, info) => {
		const path = info.file?.path;
		if (!path || event.defaultPrevented) return;
		const text = event.clipboardData?.getData('text/plain') ?? '';
		const words = countProseWords(text) - countProseWords(editor.getSelection());
		tracker.noteEdit(path, 'pasted', words);
	}));

	plugin.registerDomEvent(document, 'cut', (event) => {
		const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
		const path = view?.file?.path;
		if (!view || !path) return;
		if (!(event.target instanceof Node) || !view.contentEl.contains(event.target)) return;
		tracker.noteEdit(path, 'pasted', -countProseWords(cutText(view.editor)));
	}, { capture: true });
}
