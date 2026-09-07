import type { ToolDefinition } from '../types/AiTool';

/**
 * Catalogue of the tools the chat model may call. Pure data: the descriptions here
 * are what the model reads, and `executor.ts` maps each name to its implementation.
 *
 * Keep the wording short and concrete — every definition is spent tokens on each
 * chat request, and vague descriptions are what make weak models call the wrong tool.
 */
export const TOOL_DEFINITIONS: ToolDefinition[] = [
	{
		name: 'list_chapters',
		kind: 'read',
		description: 'List every chapter of the novel with its act, order, whether it has an outline and its length. Call this first when you need to know what exists.',
		args: [],
	},
	{
		name: 'read_chapter',
		kind: 'read',
		description: 'Read the manuscript text of one chapter.',
		args: [
			{ name: 'chapter', description: 'Chapter name, or #N for its position in the list.', required: true },
		],
	},
	{
		name: 'create_chapter',
		kind: 'write',
		description: 'Create a new chapter. Its manuscript file is created under escritura/capitulos. Optionally fill its outline and its text right away.',
		args: [
			{ name: 'name', description: 'Chapter title.', required: true },
			{ name: 'act', description: 'Act it belongs to, by name. Defaults to the last act, creating one if the novel has none.' },
			{ name: 'outline', description: 'Summary of what happens in the chapter.', multiline: true },
			{ name: 'content', description: 'Manuscript text of the chapter.', multiline: true },
		],
	},
	{
		name: 'write_chapter',
		kind: 'write',
		description: 'Replace or extend the manuscript text of an existing chapter.',
		args: [
			{ name: 'chapter', description: 'Chapter name, or #N for its position in the list.', required: true },
			{ name: 'mode', description: 'replace overwrites the chapter text, append adds to the end.', values: ['replace', 'append'] },
			{ name: 'content', description: 'Text to write.', required: true, multiline: true },
		],
	},
	{
		name: 'read_outline',
		kind: 'read',
		description: 'Read the outline of one chapter.',
		args: [
			{ name: 'chapter', description: 'Chapter name, or #N for its position in the list.', required: true },
		],
	},
	{
		name: 'write_outline',
		kind: 'write',
		description: 'Replace or extend the outline of an existing chapter. To outline a chapter that does not exist yet, use create_chapter.',
		args: [
			{ name: 'chapter', description: 'Chapter name, or #N for its position in the list.', required: true },
			{ name: 'mode', description: 'replace overwrites the outline, append adds to the end.', values: ['replace', 'append'] },
			{ name: 'content', description: 'Outline text.', required: true, multiline: true },
		],
	},
	{
		name: 'list_codex',
		kind: 'read',
		description: 'List codex entries with their category and a short description.',
		args: [
			{ name: 'category', description: 'Only entries of this category, by name.' },
			{ name: 'query', description: 'Only entries whose name, aliases or description contain this text.' },
		],
	},
	{
		name: 'read_codex_entry',
		kind: 'read',
		description: 'Read one codex entry in full: aliases, category, description and details. Private author notes are never returned.',
		args: [
			{ name: 'entry', description: 'Entry name or alias.', required: true },
		],
	},
	{
		name: 'update_codex_entry',
		kind: 'write',
		description: 'Edit an existing codex entry. With [[mode]] append you add to what is already there, which is how you finish a description that did not fit in a single answer.',
		args: [
			{ name: 'entry', description: 'Entry name or alias.', required: true },
			{ name: 'mode', description: 'replace overwrites the field, append adds to the end.', values: ['replace', 'append'] },
			{ name: 'description', description: 'Description text.', multiline: true },
			{ name: 'aliases', description: 'Comma-separated alternate names.' },
		],
	},
	{
		name: 'create_codex_entry',
		kind: 'write',
		description: 'Create a codex entry. Check with list_codex first that it does not already exist.',
		args: [
			{ name: 'name', description: 'Entry name.', required: true },
			{ name: 'category', description: 'Category by name. Defaults to Others.' },
			{ name: 'aliases', description: 'Comma-separated alternate names.' },
			{ name: 'description', description: 'Description of the entry.', multiline: true },
		],
	},
];

export function findToolDefinition(name: string): ToolDefinition | null {
	return TOOL_DEFINITIONS.find((tool) => tool.name === name) ?? null;
}
