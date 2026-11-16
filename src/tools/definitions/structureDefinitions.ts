import type { ToolArgSpec, ToolDefinition } from '../../types/AiTool';
import { CHAPTER_ARG, MODE_ARG } from './manuscriptDefinitions';

/** Acts and where each chapter sits. */

const ACT_ARG: ToolArgSpec = {
	name: 'act',
	description: 'Act name, or #N for its position.',
	required: true,
};

export const STRUCTURE_TOOLS: ToolDefinition[] = [
	{
		name: 'read_act',
		kind: 'read',
		description: 'Read an act: its summary and its chapters. The act summary is what later prompts use in place of old chapter outlines.',
		args: [ACT_ARG],
	},
	{
		name: 'create_act',
		kind: 'write',
		description: 'Create a new act at the end of the novel.',
		args: [
			{ name: 'name', description: 'Act name.', required: true },
			{ name: 'summary', description: 'Summary of the whole act.', multiline: true },
		],
	},
	{
		name: 'update_act',
		kind: 'write',
		description: 'Rename an act or write its summary. Update the summary after changing its chapters a lot.',
		args: [
			ACT_ARG,
			{ name: 'name', description: 'New name.' },
			MODE_ARG,
			{ name: 'summary', description: 'Summary of the whole act.', multiline: true },
		],
	},
	{
		name: 'rename_chapter',
		kind: 'write',
		description: 'Rename a chapter. Its manuscript file is renamed too.',
		args: [
			CHAPTER_ARG,
			{ name: 'name', description: 'New chapter title.', required: true },
		],
	},
	{
		name: 'move_chapter',
		kind: 'write',
		description: 'Move a chapter to another position, in its act or in another act.',
		args: [
			CHAPTER_ARG,
			{ name: 'act', description: 'Act to move it to. Defaults to its current act.' },
			{ name: 'position', description: 'Position inside that act (1 = first). Defaults to the end.' },
		],
	},
];
