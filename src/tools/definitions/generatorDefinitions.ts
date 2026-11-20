import type { ToolDefinition } from '../../types/AiTool';
import { CHAPTER_ARG } from './manuscriptDefinitions';

/**
 * The outline's AI generators, run by the chat. They use the utilities and
 * writing models from Settings, with the plugin's own prompts, so a long draft
 * or a summary does not have to pass through the chat's context.
 */

export const GENERATOR_TOOLS: ToolDefinition[] = [
	{
		name: 'generate_outline',
		kind: 'write',
		description: 'Write a chapter outline with the utilities model, replacing the current one: from its manuscript, or from the story so far for a chapter not written yet.',
		args: [
			CHAPTER_ARG,
			{ name: 'source', description: 'What to outline from. Defaults to manuscript.', values: ['manuscript', 'story_so_far'] },
		],
	},
	{
		name: 'summarize_act',
		kind: 'write',
		description: 'Write an act summary from its chapter outlines with the utilities model, replacing the current one.',
		args: [
			{ name: 'act', description: 'Act name, or #N for its position.', required: true },
		],
	},
	{
		name: 'draft_chapter',
		kind: 'write',
		description: 'Write a full draft of a chapter from its outline with the writing model. A chapter that already has text is only replaced with overwrite yes.',
		args: [
			CHAPTER_ARG,
			{ name: 'words', description: 'Target length in words. Defaults to the words per chapter of the Novel Setup.' },
			{ name: 'overwrite', description: 'Replace existing text. Defaults to no.', values: ['no', 'yes'] },
		],
	},
	{
		name: 'check_continuity',
		kind: 'write',
		description: 'Check a chapter for contradictions with earlier chapters and the codex, using the utilities model and the facts saved per chapter (extracted again only where the text changed). Returns the issues; the report is saved.',
		args: [CHAPTER_ARG],
	},
	{
		name: 'generate_portrait',
		kind: 'write',
		description: 'Draw a portrait of a codex entry with the images model, from its description and details, and set it as the entry\'s image. Replaces the current one.',
		args: [
			{ name: 'entry', description: 'Entry name or alias.', required: true },
			{ name: 'style', description: 'Art style or extra direction, like "oil painting, warm light".' },
		],
	},
	{
		name: 'refresh_story_context',
		kind: 'write',
		description: 'Rebuild the "story so far" the autocomplete and drafts receive, inside the chapter memory. No AI involved.',
		args: [
			{ name: 'chapter', description: 'Chapter name or #N. Omit for every chapter.' },
		],
	},
];
