import { genId } from '../../utils/ids';
import type { EditorAction } from '../../types/EditorAction';
import type { SettingsService } from './settings-service';

const ALLOWED_MARKERS = new Set([
	'input', 'selection', 'note', 'before_cursor',
	'memory', 'author_note', 'chapter_outline', 'codex', 'story_bible',
]);

export function validateEditorAction(action: EditorAction): string | null {
	if (!action.name.trim()) return 'Name is required.';
	if (!action.instruction.trim()) return 'Instructions are required.';
	if (!['command', 'context-menu', 'both'].includes(action.placement)) {
		return 'Choose a valid location.';
	}
	if (!['selection', 'selection-or-note', 'before-cursor'].includes(action.input)) {
		return 'Choose a valid input.';
	}
	if (!['replace-input', 'insert-at-cursor'].includes(action.output)) {
		return 'Choose a valid result.';
	}
	const template = action.instruction;
	const matches = [...template.matchAll(/{{\s*([^{}]+?)\s*}}/g)];
	const remaining = template.replace(/{{\s*([^{}]+?)\s*}}/g, '');
	if (remaining.includes('{{') || remaining.includes('}}')) {
		return 'An instruction placeholder is incomplete.';
	}
	const unknown = matches.find(match => !ALLOWED_MARKERS.has(match[1].trim()));
	if (unknown) return `Unknown placeholder: {{${unknown[1].trim()}}}.`;
	return null;
}

export class EditorActionRepository {
	constructor(private readonly settings: SettingsService) {}

	list(): EditorAction[] {
		return this.settings.data.editorActions;
	}

	async create(action: Omit<EditorAction, 'id'>): Promise<EditorAction> {
		const created = { ...action, id: `editor-action-${genId()}` };
		const error = validateEditorAction(created);
		if (error) throw new Error(error);
		this.list().push(created);
		await this.settings.save();
		return created;
	}

	async update(action: EditorAction): Promise<void> {
		const error = validateEditorAction(action);
		if (error) throw new Error(error);
		const index = this.list().findIndex(item => item.id === action.id);
		if (index < 0) throw new Error('Action no longer exists.');
		this.list()[index] = action;
		await this.settings.save();
	}

	async remove(id: string): Promise<void> {
		this.settings.data.editorActions = this.list().filter(item => item.id !== id);
		await this.settings.save();
	}
}
