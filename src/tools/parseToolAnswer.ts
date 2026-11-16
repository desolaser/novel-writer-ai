import { parseToolCalls, type ParsedAnswer } from '../utils/toolCallParsing';
import { findToolDefinition } from './registry';

function findArgument(toolName: string, argName: string) {
	const tool = findToolDefinition(toolName);
	return tool?.args.find((argument) => argument.name === argName);
}

/**
 * The argument a block without headers belongs to: the only argument of a tool
 * that takes a single multi-line value, like the steps of `update_plan`.
 */
function soleMultilineArgument(toolName: string): string | undefined {
	const args = findToolDefinition(toolName)?.args ?? [];
	return args.length === 1 && args[0].multiline ? args[0].name : undefined;
}

/**
 * Parses a model answer with the catalogue at hand, so the parser knows which
 * arguments exist and which may span several lines. Keeping this here leaves the
 * parser itself generic: it never imports the registry.
 */
export function parseToolAnswer(answer: string, idPrefix: string): ParsedAnswer {
	return parseToolCalls(answer, {
		idPrefix,
		isMultiline: (toolName, argName) => findArgument(toolName, argName)?.multiline,
		knowsArg: (toolName, argName) => Boolean(findArgument(toolName, argName)),
		defaultArg: soleMultilineArgument,
	});
}
