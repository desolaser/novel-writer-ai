import type { ToolDefinition } from '../types/AiTool';
import { CODEX_TOOLS } from './definitions/codexDefinitions';
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
export const TOOL_DEFINITIONS: ToolDefinition[] = [
	...MANUSCRIPT_TOOLS,
	...STRUCTURE_TOOLS,
	...CODEX_TOOLS,
	...NOVEL_TOOLS,
	...WORKSPACE_TOOLS,
];

export function findToolDefinition(name: string): ToolDefinition | null {
	return TOOL_DEFINITIONS.find((tool) => tool.name === name) ?? null;
}
