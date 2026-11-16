import type { ToolDefinition } from '../../types/AiTool';

/** The agent's plan and the author's workspace. None changes the novel. */

export const WORKSPACE_TOOLS: ToolDefinition[] = [
	{
		name: 'update_plan',
		kind: 'read',
		description: 'Show the author your plan as a checklist. Call it at the start of a task with three or more steps, and again whenever a step is done. Always send the whole list.',
		args: [
			{ name: 'steps', description: 'One step per line: [x] done, [>] in progress, [ ] pending.', required: true, multiline: true },
		],
	},
	{
		name: 'open_chapter',
		kind: 'read',
		description: 'Open a chapter for the author to look at: its manuscript or its outline.',
		args: [
			{ name: 'chapter', description: 'Chapter name, or #N for its position in the list.', required: true },
			{ name: 'view', description: 'What to open. Defaults to text.', values: ['text', 'outline'] },
		],
	},
	{
		name: 'open_codex_entry',
		kind: 'read',
		description: 'Open a codex entry for the author to look at.',
		args: [
			{ name: 'entry', description: 'Entry name or alias.', required: true },
		],
	},
	{
		name: 'read_selection',
		kind: 'read',
		description: 'Read the text the author has selected in the editor, or the paragraph at the cursor. Use it when they say "this", "the selection" or "here".',
		args: [],
	},
	{
		name: 'read_note',
		kind: 'read',
		description: 'Read a Markdown note of the author\'s vault, such as research or worldbuilding notes outside the novel.',
		args: [
			{ name: 'note', description: 'Note name or vault path.', required: true },
		],
	},
];
