import type { ToolDefinition } from '../../types/AiTool';
import { MODE_ARG } from './manuscriptDefinitions';

/** The novel as a whole: blueprint, progress, memory and author note. */

export const NOVEL_TOOLS: ToolDefinition[] = [
	{
		name: 'read_blueprint',
		kind: 'read',
		description: 'Read the Novel Setup: premise, genre, style, tense, language, target chapter length and the structure plan.',
		args: [],
	},
	{
		name: 'update_blueprint',
		kind: 'write',
		description: 'Change fields of the Novel Setup. Only the fields you give change.',
		args: [
			{ name: 'title', description: 'Title of the novel.' },
			{ name: 'genre', description: 'Genre.' },
			{ name: 'style', description: 'Writing style.' },
			{ name: 'setting', description: 'Where and when the story happens.' },
			{ name: 'language', description: 'Language the story is written in.' },
			{ name: 'tense', description: 'Verb tense of the narration.', values: ['past', 'present', 'future'] },
			{ name: 'narrative_time', description: 'How the story is arranged in time.', values: ['linear', 'in-media-res', 'flashback', 'flashforward', 'nonlinear', 'frame'] },
			{ name: 'audience', description: 'Where it will be published.', values: ['web-novel', 'royal-road', 'wattpad', 'traditional'] },
			{ name: 'words_per_chapter', description: 'Target chapter length, like 2000-4000.' },
			{ name: 'premise', description: 'Premise and broad strokes of the plot.', multiline: true },
			{ name: 'structure_plan', description: 'The structure plan, in Markdown.', multiline: true },
		],
	},
	{
		name: 'novel_status',
		kind: 'read',
		description: 'Progress report: total words, chapters without text or outline, acts without summary, chapters under or over the target length.',
		args: [],
	},
	{
		name: 'read_memory',
		kind: 'read',
		description: 'Read the memory and author note the autocomplete sends, for a chapter or for the whole novel.',
		args: [
			{ name: 'chapter', description: 'Chapter name or #N. Omit for the whole novel.' },
		],
	},
	{
		name: 'write_memory',
		kind: 'write',
		description: 'Write the memory (facts to remember) or the author note (style guidance) of a chapter or of the whole novel. The generated story context is kept.',
		args: [
			{ name: 'chapter', description: 'Chapter name or #N. Omit for the whole novel.' },
			{ name: 'field', description: 'Which text to write. Defaults to memory.', values: ['memory', 'author_note'] },
			MODE_ARG,
			{ name: 'content', description: 'Text to write. Empty with replace clears it.', multiline: true },
		],
	},
];
