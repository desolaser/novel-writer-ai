import type { ToolCall, ToolResult } from '../types/AiTool';
import type { ToolContext } from '../interfaces/tool-context';
import { findToolDefinition, TOOL_DEFINITIONS } from './registry';
import { createChapter, editChapter, listChapters, readChapter, writeChapter } from './chapterTools';
import { findMentionsTool, searchNovel } from './searchTools';
import { readOutline, writeOutline } from './outlineTools';
import { deleteScene, setScene } from './sceneTools';
import {
	archiveCodexEntry,
	createCodexEntry,
	listCodex,
	readCodexEntry,
	updateCodexEntry,
} from './codexTools';
import { listCodexFields, setCodexDetail } from './codexDetailTools';
import {
	createActTool,
	deleteChapter,
	moveChapter,
	readAct,
	renameChapter,
	updateActTool,
} from './structureTools';
import { novelStatus } from './novelTools';
import { setChapterInfo } from './chapterInfoTools';
import { readBlueprintTool, updateBlueprintTool } from './blueprintTools';
import { generatePortrait } from './portraitTools';
import {
	draftChapterTool,
	generateOutlineTool,
	refreshStoryContextTool,
	summarizeActTool,
} from './generatorTools';
import { readMemory, writeMemory } from './memoryTools';
import { updatePlan } from './planTools';
import { openChapter, openCodexEntryTool, readNoteTool, readSelection } from './workspaceTools';

/** Maps a tool name to its implementation. Every handler returns the text sent back to the model. */
type ToolHandler = (args: Record<string, string>, context: ToolContext) => Promise<string>;

const HANDLERS: Record<string, ToolHandler> = {
	list_chapters: listChapters,
	read_chapter: readChapter,
	create_chapter: createChapter,
	write_chapter: writeChapter,
	edit_chapter: editChapter,
	search_novel: searchNovel,
	read_outline: readOutline,
	write_outline: writeOutline,
	set_scene: setScene,
	delete_scene: deleteScene,

	read_act: readAct,
	create_act: createActTool,
	update_act: updateActTool,
	rename_chapter: renameChapter,
	move_chapter: moveChapter,
	set_chapter_info: setChapterInfo,
	delete_chapter: deleteChapter,

	list_codex: listCodex,
	read_codex_entry: readCodexEntry,
	create_codex_entry: createCodexEntry,
	update_codex_entry: updateCodexEntry,
	archive_codex_entry: archiveCodexEntry,
	list_codex_fields: listCodexFields,
	set_codex_detail: setCodexDetail,
	find_mentions: findMentionsTool,

	read_blueprint: readBlueprintTool,
	update_blueprint: updateBlueprintTool,
	novel_status: novelStatus,
	read_memory: readMemory,
	write_memory: writeMemory,

	update_plan: updatePlan,
	open_chapter: openChapter,
	open_codex_entry: openCodexEntryTool,
	read_selection: readSelection,
	read_note: readNoteTool,

	generate_outline: generateOutlineTool,
	summarize_act: summarizeActTool,
	draft_chapter: draftChapterTool,
	refresh_story_context: refreshStoryContextTool,
	generate_portrait: generatePortrait,
};

/** Validates the arguments the model supplied against the tool's declared spec. */
function missingArguments(call: ToolCall, definition: ReturnType<typeof findToolDefinition>): string[] {
	if (!definition) return [];
	return definition.args
		.filter((arg) => arg.required && !(call.args[arg.name] ?? '').trim())
		.map((arg) => arg.name);
}

/**
 * Runs one tool call. Never throws: a failure comes back as a result the model can
 * read and react to, which is what keeps the conversation going after a bad call.
 *
 * `approved` must be explicitly passed as `true` for a write-kind tool to run. This
 * is a second line of defense on top of the chat UI's approve/reject cards: whatever
 * calls this function is the one place a write can slip through without the author's
 * consent, so the default keeps every write refused until the caller proves it got
 * approval — never add a caller that hardcodes `true` for a tool it hasn't gated.
 */
export async function executeToolCall(call: ToolCall, context: ToolContext, approved = false): Promise<ToolResult> {
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
	const definition = findToolDefinition(call.name);
	if (definition?.kind === 'write' && !approved) {
		return { callId: call.id, name: call.name, ok: false, output: 'This is a write tool and requires the author\'s approval before it runs; this call was not approved.' };
	}
	const missing = missingArguments(call, definition);
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
