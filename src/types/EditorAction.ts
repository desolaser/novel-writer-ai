export type EditorActionPlacement = 'command' | 'context-menu' | 'both';
export type EditorActionInput = 'selection' | 'selection-or-note' | 'before-cursor';
export type EditorActionOutput = 'replace-input' | 'insert-at-cursor';

/** A user-configurable AI operation on a Markdown editor. */
export interface EditorAction {
	id: string;
	name: string;
	placement: EditorActionPlacement;
	instruction: string;
	input: EditorActionInput;
	output: EditorActionOutput;
	menuGroup?: string;
}
