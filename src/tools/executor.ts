import type { ToolCall, ToolResult } from '../types/AiTool';
import type { ToolContext } from '../interfaces/tool-context';
import { findToolDefinition, TOOL_DEFINITIONS } from './registry';
import { createChapter, listChapters, readChapter, writeChapter } from './chapterTools';
import { readOutline, writeOutline } from './outlineTools';
import { createCodexEntry, listCodex, readCodexEntry, updateCodexEntry } from './codexTools';

/** Maps a tool name to its implementation. Every handler returns the text sent back to the model. */
type ToolHandler = (args: Record<string, string>, context: ToolContext) => Promise<string>;

const HANDLERS: Record<string, ToolHandler> = {
	list_chapters: listChapters,
	read_chapter: readChapter,
	create_chapter: createChapter,
	write_chapter: writeChapter,
	read_outline: readOutline,
	write_outline: writeOutline,
	list_codex: listCodex,
	read_codex_entry: readCodexEntry,
	create_codex_entry: createCodexEntry,
	update_codex_entry: updateCodexEntry,
};

/** Validates the arguments the model supplied against the tool's declared spec. */
function missingArguments(call: ToolCall): string[] {
	const definition = findToolDefinition(call.name);
	if (!definition) return [];
	return definition.args
		.filter((arg) => arg.required && !(call.args[arg.name] ?? '').trim())
		.map((arg) => arg.name);
}

/**
 * Runs one tool call. Never throws: a failure comes back as a result the model can
 * read and react to, which is what keeps the conversation going after a bad call.
 */
export async function executeToolCall(call: ToolCall, context: ToolContext): Promise<ToolResult> {
	if (call.truncated) {
		return {
			callId: call.id,
			name: call.name,
			ok: false,
			output: 'This call was cut off before its closing [[/tool]]: the answer hit the model output limit '
				+ 'while a value was still being written, so nothing was saved. Write the call again with a shorter '
				+ 'value, or split it: make the first call short and add the rest with a second call using [[mode]] append.',
		};
	}
	const handler = HANDLERS[call.name];
	if (!handler) {
		const known = TOOL_DEFINITIONS.map((tool) => tool.name).join(', ');
		return { callId: call.id, name: call.name, ok: false, output: `Unknown tool "${call.name}". Available tools: ${known}.` };
	}
	const missing = missingArguments(call);
	if (missing.length) {
		return { callId: call.id, name: call.name, ok: false, output: `Missing required argument(s): ${missing.join(', ')}.` };
	}
	try {
		const output = await handler(call.args, context);
		return { callId: call.id, name: call.name, ok: true, output };
	} catch (error: any) {
		return { callId: call.id, name: call.name, ok: false, output: error?.message ?? String(error) };
	}
}
