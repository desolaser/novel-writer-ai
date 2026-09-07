import { parseToolCalls, type ParsedAnswer } from '../utils/toolCallParsing';
import { findToolDefinition } from './registry';

/**
 * Parses a model answer with the catalogue at hand, so the parser knows which
 * arguments are allowed to span several lines. Keeping this here leaves the parser
 * itself generic: it never imports the registry.
 */
export function parseToolAnswer(answer: string, idPrefix: string): ParsedAnswer {
	return parseToolCalls(answer, {
		idPrefix,
		isMultiline: (toolName, argName) =>
			findToolDefinition(toolName)?.args.find((argument) => argument.name === argName)?.multiline,
	});
}
