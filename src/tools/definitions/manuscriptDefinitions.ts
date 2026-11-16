import type { ToolArgSpec, ToolDefinition } from '../../types/AiTool';

/** Chapter text, outlines and text search. */

export const CHAPTER_ARG: ToolArgSpec = {
	name: 'chapter',
	description: 'Chapter name, or #N for its position in the list.',
	required: true,
};

export const MODE_ARG: ToolArgSpec = {
	name: 'mode',
	description: 'replace overwrites, append adds to the end.',
	values: ['replace', 'append'],
};

export const MANUSCRIPT_TOOLS: ToolDefinition[] = [
	{
		name: 'list_chapters',
		kind: 'read',
		description: 'List every chapter of the novel with its act, order, whether it has an outline and its length. Call this first when you need to know what exists.',
		args: [],
	},
	{
		name: 'read_chapter',
		kind: 'read',
		description: 'Read the manuscript text of one chapter, whole or only some paragraphs. For long chapters, read the part you need.',
		args: [
			CHAPTER_ARG,
			{ name: 'from', description: 'First paragraph to read (1 = first). Omit both from and to for the whole chapter.' },
			{ name: 'to', description: 'Last paragraph to read. Defaults to the end.' },
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
			CHAPTER_ARG,
			{ name: 'mode', description: 'replace overwrites the chapter text, append adds to the end.', values: ['replace', 'append'] },
			{ name: 'content', description: 'Text to write.', required: true, multiline: true },
		],
	},
	{
		name: 'edit_chapter',
		kind: 'write',
		description: 'Replace an exact passage of a chapter with new text. Use it for changes to part of a chapter instead of rewriting it whole. Read the chapter first: the passage must match exactly.',
		args: [
			CHAPTER_ARG,
			{ name: 'find', description: 'Exact text to replace, copied from the chapter. Must appear once unless all is yes.', required: true, multiline: true },
			{ name: 'replace', description: 'New text. Leave empty to delete the passage.', multiline: true },
			{ name: 'all', description: 'yes replaces every occurrence.', values: ['yes', 'no'] },
		],
	},
	{
		name: 'search_novel',
		kind: 'read',
		description: 'Find where a word or phrase appears in chapter texts, outlines and codex entries. Returns short snippets.',
		args: [
			{ name: 'query', description: 'Text to look for (case-insensitive).', required: true },
			{ name: 'scope', description: 'Where to search. Defaults to all.', values: ['all', 'chapters', 'outlines', 'codex'] },
		],
	},
	{
		name: 'read_outline',
		kind: 'read',
		description: 'Read the outline of one chapter.',
		args: [CHAPTER_ARG],
	},
	{
		name: 'write_outline',
		kind: 'write',
		description: 'Replace or extend the outline of an existing chapter. To outline a chapter that does not exist yet, use create_chapter.',
		args: [
			CHAPTER_ARG,
			{ name: 'mode', description: 'replace overwrites the outline, append adds to the end.', values: ['replace', 'append'] },
			{ name: 'content', description: 'Outline text.', required: true, multiline: true },
		],
	},
];
