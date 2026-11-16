import type {
	ToolAvailability,
	ToolDefinition,
	ToolGroupId,
} from '../types/AiTool';
import { CODEX_TOOLS } from './definitions/codexDefinitions';
import { GENERATOR_TOOLS } from './definitions/generatorDefinitions';
import { MANUSCRIPT_TOOLS } from './definitions/manuscriptDefinitions';
import { NOVEL_TOOLS } from './definitions/novelDefinitions';
import { STRUCTURE_TOOLS } from './definitions/structureDefinitions';
import { WORKSPACE_TOOLS } from './definitions/workspaceDefinitions';

/**
 * Catalogue of the tools the chat model may call. Pure data, split by domain in
 * `definitions/`: the descriptions there are what the model reads, and
 * `executor.ts` maps each name to its implementation.
 *
 * Keep the wording short and concrete — every definition is spent tokens on each
 * chat request, and vague descriptions are what make weak models call the wrong tool.
 */

export interface ToolGroup {
	id: ToolGroupId;
	label: string;
	description: string;
	tools: ToolDefinition[];
}

export const TOOL_GROUPS: ToolGroup[] = [
	{
		id: 'manuscript',
		label: 'Manuscript',
		description: 'Read, write, edit and search the text and the outline of each chapter.',
		tools: MANUSCRIPT_TOOLS,
	},
	{
		id: 'structure',
		label: 'Structure',
		description: 'Create acts and write their summaries; rename, move and delete chapters.',
		tools: STRUCTURE_TOOLS,
	},
	{
		id: 'codex',
		label: 'Codex',
		description: 'Read, create and edit codex entries, their custom details and tags. '
			+ 'Entries set to Never stay hidden.',
		tools: CODEX_TOOLS,
	},
	{
		id: 'novel',
		label: 'Novel',
		description: 'Read and change the Novel Setup, get a progress report, '
			+ 'and edit the memory and author\'s note.',
		tools: NOVEL_TOOLS,
	},
	{
		id: 'workspace',
		label: 'Workspace',
		description: 'Show a plan checklist, open chapters and entries for you, '
			+ 'read your selection and other notes. Changes nothing.',
		tools: WORKSPACE_TOOLS,
	},
	{
		id: 'generators',
		label: 'Generators',
		description: 'Run the Outline\'s AI generators: chapter outlines, act summaries, '
			+ 'full drafts and the story so far. They use the utilities and writing '
			+ 'models, not the chat model.',
		tools: GENERATOR_TOOLS,
	},
];

export const TOOL_DEFINITIONS: ToolDefinition[] = TOOL_GROUPS.flatMap((group) => group.tools);

/** Every group on, notes readable across the vault: the behavior before Settings had it. */
export const ALL_TOOLS_AVAILABLE: ToolAvailability = {
	groups: {
		manuscript: true,
		structure: true,
		codex: true,
		novel: true,
		workspace: true,
		generators: true,
	},
	noteAccess: 'vault',
	canGenerateImages: true,
};

/** The tools the author left on in Settings, in catalogue order. */
export function availableTools(availability: ToolAvailability): ToolDefinition[] {
	return TOOL_GROUPS
		.filter((group) => availability.groups[group.id] !== false)
		.flatMap((group) => group.tools)
		.filter((tool) => tool.name !== 'read_note' || availability.noteAccess !== 'off')
		.filter((tool) => tool.name !== 'generate_portrait' || availability.canGenerateImages);
}

export function findToolDefinition(name: string): ToolDefinition | null {
	return TOOL_DEFINITIONS.find((tool) => tool.name === name) ?? null;
}
