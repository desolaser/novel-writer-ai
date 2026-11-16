import type { ToolArgSpec, ToolDefinition } from '../../types/AiTool';
import { MODE_ARG } from './manuscriptDefinitions';

/** Codex entries, their custom details and their mentions. */

const ENTRY_ARG: ToolArgSpec = {
	name: 'entry',
	description: 'Entry name or alias.',
	required: true,
};

export const CODEX_TOOLS: ToolDefinition[] = [
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
		description: 'Read one codex entry in full: aliases, category, tags, description, details and which entries reference it. Private author notes are never returned.',
		args: [ENTRY_ARG],
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
	{
		name: 'update_codex_entry',
		kind: 'write',
		description: 'Edit an existing codex entry. With [[mode]] append you add to what is already there, which is how you finish a description that did not fit in a single answer.',
		args: [
			ENTRY_ARG,
			MODE_ARG,
			{ name: 'description', description: 'Description text.', multiline: true },
			{ name: 'aliases', description: 'Comma-separated alternate names.' },
			{ name: 'category', description: 'Move the entry to this category, by name.' },
			{ name: 'tags', description: 'Comma-separated tags. New tags are created.' },
			{ name: 'first_message', description: 'Opening line a character says when a roleplay chat starts. {{char}} and {{user}} work.', multiline: true },
		],
	},
	{
		name: 'archive_codex_entry',
		kind: 'write',
		description: 'Archive a codex entry the novel no longer needs. The author can restore it.',
		args: [ENTRY_ARG],
	},
	{
		name: 'list_codex_fields',
		kind: 'read',
		description: 'List the custom details each category has (type, options, author hints). Call it before set_codex_detail.',
		args: [
			{ name: 'category', description: 'Only this category, by name.' },
		],
	},
	{
		name: 'set_codex_detail',
		kind: 'write',
		description: 'Set one custom detail of an entry, such as age or faction. Option details take an option name; reference details take another entry\'s name.',
		args: [
			ENTRY_ARG,
			{ name: 'detail', description: 'Detail name, as list_codex_fields shows it.', required: true },
			{ name: 'mode', description: 'replace overwrites, append adds to text details.', values: ['replace', 'append'] },
			{ name: 'value', description: 'New value. Leave empty to clear it.', multiline: true },
		],
	},
	{
		name: 'find_mentions',
		kind: 'read',
		description: 'Find the chapters where a codex entry is mentioned by name or alias, with snippets. Use it to check continuity.',
		args: [ENTRY_ARG],
	},
];
