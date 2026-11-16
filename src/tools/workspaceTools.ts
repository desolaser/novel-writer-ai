import type {
	ChapterToolContext,
	CodexToolContext,
	EditorToolContext,
	NavigationToolContext,
	NoteToolContext,
} from '../interfaces/tool-context';
import { resolveChapter } from './chapterTools';
import { resolveEntry } from './codexShared';

/**
 * Tools on the author's workspace: open what they want to see, read what they
 * selected in the editor, read notes of the vault. None changes the novel, so
 * they run without approval.
 */

const MAX_NOTE_CHARS = 20000;

export async function openChapter(
	args: Record<string, string>,
	context: ChapterToolContext & NavigationToolContext,
): Promise<string> {
	const chapter = resolveChapter(args.chapter ?? '', context);
	const where = (args.view ?? 'text').trim().toLowerCase();
	if (where === 'outline') {
		await context.openChapterOutline(chapter.id_capitulo);
		return `Showed the outline of "${chapter.nombre}" to the author.`;
	}
	const opened = await context.openChapterFile(chapter.id_capitulo);
	if (!opened) throw new Error(`Chapter "${chapter.nombre}" has no manuscript file yet.`);
	return `Opened the manuscript of "${chapter.nombre}" for the author.`;
}

export async function openCodexEntryTool(
	args: Record<string, string>,
	context: CodexToolContext & NavigationToolContext,
): Promise<string> {
	const entry = resolveEntry(args.entry ?? '', context);
	await context.openCodexEntry(entry.id_entrada_codex);
	return `Opened the codex entry "${entry.nombre}" for the author.`;
}

export async function readSelection(
	_args: Record<string, string>,
	context: EditorToolContext,
): Promise<string> {
	const info = context.readEditorSelection();
	if (!info) return 'The author has no note open in the editor.';
	if (info.selection.trim()) {
		return `Selected in "${info.notePath}":\n\n${info.selection}`;
	}
	if (info.cursorParagraph.trim()) {
		return `Nothing is selected in "${info.notePath}". Paragraph at the cursor:\n\n${info.cursorParagraph}`;
	}
	return `Nothing is selected in "${info.notePath}", and the cursor is on an empty line.`;
}

export async function readNoteTool(
	args: Record<string, string>,
	context: NoteToolContext,
): Promise<string> {
	const reference = (args.note ?? '').trim();
	if (!reference) throw new Error('Argument "note" is required.');
	const lookup = context.findNote(reference);
	if (!lookup.path) {
		const close = lookup.suggestions.length
			? ` Close matches: ${lookup.suggestions.join(', ')}.`
			: '';
		throw new Error(`No note matches "${reference}".${close}`);
	}
	const text = await context.readNote(lookup.path);
	if (!text.trim()) return `Note "${lookup.path}" is empty.`;
	if (text.length <= MAX_NOTE_CHARS) return `Note "${lookup.path}":\n\n${text}`;
	const cut = text.slice(0, MAX_NOTE_CHARS);
	return `Note "${lookup.path}" (first ${MAX_NOTE_CHARS} of ${text.length} characters):\n\n${cut}`;
}
