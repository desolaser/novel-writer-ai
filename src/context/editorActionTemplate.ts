import type { EditorAction } from '../types/EditorAction';

export interface EditorActionPromptContext {
	input: string;
	selection: string;
	note: string;
	before_cursor: string;
	memory?: string;
	author_note?: string;
	chapter_outline?: string;
	codex?: string;
	story_bible?: string;
}

export function buildEditorActionPrompt(
	action: EditorAction,
	context: EditorActionPromptContext,
): string {
	const hasInputMarker =
		/{{\s*(input|selection|note|before_cursor)\s*}}/.test(action.instruction);
	const instructions = action.instruction.replace(
		/{{\s*([^{}]+?)\s*}}/g,
		(_match, key: keyof EditorActionPromptContext) => context[key.trim()] ?? '',
	);
	return hasInputMarker
		? instructions
		: `${instructions}\n\nText:\n${context.input}`;
}
