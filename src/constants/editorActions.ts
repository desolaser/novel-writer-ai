import type { EditorAction } from '../types/EditorAction';

/** Stable IDs preserve existing Obsidian hotkeys during migration. */
export const DEFAULT_EDITOR_ACTIONS: EditorAction[] = [
	{
		id: 'summarize-selection', name: 'Summarize', placement: 'both',
		input: 'selection', output: 'replace-input',
		instruction: 'Summarize the selected text. Return only the summary.',
	},
	{
		id: 'expand-selection', name: 'Expand', placement: 'both',
		input: 'selection', output: 'replace-input',
		instruction: 'Expand the selected text with useful detail while preserving '
			+ 'its meaning and style. Return only the expanded text.',
	},
	{
		id: 'shorten-selection', name: 'Shorten', placement: 'both',
		input: 'selection', output: 'replace-input',
		instruction: 'Shorten the selected text without losing its essential '
			+ 'meaning. Return only the shortened text.',
	},
	{
		id: 'rephrase-selection', name: 'Rephrase', placement: 'both',
		input: 'selection', output: 'replace-input',
		instruction: 'Rephrase the selected text clearly and naturally. Return only the rephrased text.',
	},
	{
		id: 'correct-selection', name: 'Correct', placement: 'both',
		input: 'selection-or-note', output: 'replace-input',
		instruction: 'Correct all spelling, grammar, punctuation, and '
			+ 'orthographic errors in the following text. Preserve its meaning '
			+ 'and return only the corrected text.',
	},
	{
		id: 'translate-selection-spanish', name: 'Translate to Spanish',
		placement: 'both', input: 'selection', output: 'replace-input',
		menuGroup: 'Translate to',
		instruction: 'Translate the selected text to Spanish. Return only the translation.',
	},
	{
		id: 'translate-selection-english', name: 'Translate to English',
		placement: 'both', input: 'selection', output: 'replace-input',
		menuGroup: 'Translate to',
		instruction: 'Translate the selected text to English. Return only the translation.',
	},
];
