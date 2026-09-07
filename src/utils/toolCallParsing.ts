import type { ToolCall } from '../types/AiTool';
import { normalizeForMatch } from './codexAiParsing';

/**
 * Parsing of tool calls out of a model answer.
 *
 * Expected shape, one block per call:
 *
 *   [[tool: write_chapter]]
 *   [[chapter]] Chapter 3
 *   [[content]]
 *   ...text...
 *   [[/tool]]
 *
 * Everything is deliberately forgiving: single brackets, stray spaces, a missing
 * closing marker or a block wrapped in a code fence all still parse. Whatever sits
 * outside the blocks is the prose shown to the author.
 */

const TOOL_START = /^(.*?)\[{1,2}\s*tool\s*:\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\]{1,2}[ \t]*$/;
const TOOL_END = /^[ \t]*\[{1,2}\s*\/\s*tool\s*\]{1,2}[ \t]*$/;
const ARG_HEADER = /^[ \t]*\[{1,2}[ \t]*([a-zA-Z_][a-zA-Z0-9_ ]*?)[ \t]*\]{1,2}[ \t]*:?[ \t]*(.*)$/;

/**
 * Prepares an answer for line-by-line scanning: drops fences a model may have wrapped
 * around the block, and puts the opening and closing markers on their own line when
 * they were written inline with the rest of the call. The `(?!\])` guards keep the
 * split from landing between the two brackets of a marker.
 */
function normalizeAnswer(text: string): string {
	return (text || '')
		.replace(/```[a-zA-Z]*\s*\n?/g, '')
		.replace(/```/g, '')
		.replace(/([^\s\[])[ \t]*(\[{1,2}\s*\/\s*tool\s*\]{1,2})/g, '$1\n$2')
		.replace(/(\[{1,2}\s*tool\s*:\s*[a-zA-Z_][a-zA-Z0-9_]*\s*\]{1,2}(?!\]))[ \t]*(?=[^\s\]])/g, '$1\n')
		.replace(/(\[{1,2}\s*\/\s*tool\s*\]{1,2}(?!\]))[ \t]*(?=[^\s\]])/g, '$1\n');
}

export interface ParseToolCallsOptions {
	/** Prefix for the generated call ids, unique per round. */
	idPrefix?: string;
	/**
	 * Tells the parser which arguments may span several lines. Return undefined for an
	 * argument it does not know about: the parser then assumes a value starting on its
	 * own line is multi-line, and one written next to the header ends with that line.
	 */
	isMultiline?: (toolName: string, argName: string) => boolean | undefined;
}

interface CollectedBlock {
	args: Record<string, string>;
	/** Index of the last line belonging to the block. */
	end: number;
	/** The answer ended while a multi-line value was still open. */
	truncated: boolean;
}

/** Index of the closing marker of a block, or -1 when the model never wrote one. */
function findClosing(lines: string[], from: number): number {
	for (let index = from; index < lines.length; index++) {
		if (TOOL_END.test(lines[index])) return index;
		if (TOOL_START.test(lines[index])) return -1;
	}
	return -1;
}

/**
 * Reads the body of one block. With a closing marker everything up to it belongs to
 * the block. Without one, the block ends at the first line that cannot be part of it,
 * so prose the model wrote after forgetting the marker stays prose instead of being
 * swallowed into the last argument.
 */
function collectBlock(
	lines: string[],
	from: number,
	toolName: string,
	closingAt: number,
	isMultiline?: ParseToolCallsOptions['isMultiline'],
): CollectedBlock {
	const args: Record<string, string> = {};
	let current: string | null = null;
	let buffer: string[] = [];
	let multiline = false;
	const flush = () => {
		if (current) args[current] = buffer.join('\n').trim();
		current = null;
		buffer = [];
	};

	let index = from;
	for (; index < lines.length; index++) {
		if (closingAt >= 0 && index === closingAt) break;
		const line = lines[index];
		if (closingAt < 0 && TOOL_START.test(line)) break;

		const header = TOOL_END.test(line) ? null : line.match(ARG_HEADER);
		if (header) {
			flush();
			current = header[1].trim().toLowerCase().replace(/\s+/g, '_');
			const inline = header[2].trim();
			buffer = inline ? [inline] : [];
			const declared = isMultiline?.(toolName, current);
			multiline = declared === undefined ? !inline : declared;
			continue;
		}
		if (closingAt < 0) {
			const blank = !line.trim();
			// Nothing here can extend a single-line argument, so the block is over.
			if (!blank && (!current || !multiline)) break;
			if (blank && !multiline) continue;
		}
		if (current && multiline) buffer.push(line);
	}
	// Running past the last line with a multi-line value still open is the signature of
	// an answer cut short by the output limit; a closed block never looks like this.
	const truncated = closingAt < 0 && index >= lines.length && current !== null && multiline;
	flush();
	return { args, end: closingAt >= 0 ? closingAt : index - 1, truncated };
}

export interface ParsedAnswer {
	/** Prose to show the author, with the tool blocks stripped out. */
	text: string;
	calls: ToolCall[];
}

/** Extracts every tool call from an answer, along with the prose around them. */
export function parseToolCalls(answer: string, options: ParseToolCallsOptions = {}): ParsedAnswer {
	const { idPrefix = 'call', isMultiline } = options;
	const lines = normalizeAnswer(answer).split(/\r?\n/);
	const prose: string[] = [];
	const calls: ToolCall[] = [];

	let index = 0;
	while (index < lines.length) {
		const start = lines[index].match(TOOL_START);
		if (!start) {
			prose.push(lines[index]);
			index += 1;
			continue;
		}
		if (start[1].trim()) prose.push(start[1].trim());
		const name = start[2].trim().toLowerCase();
		const block = collectBlock(lines, index + 1, name, findClosing(lines, index + 1), isMultiline);
		calls.push({
			id: `${idPrefix}_${calls.length}`,
			name,
			args: block.args,
			raw: lines.slice(index, block.end + 1).join('\n'),
			...(block.truncated ? { truncated: true } : {}),
		});
		index = block.end + 1;
	}
	return { text: prose.join('\n').trim(), calls };
}

/** Renders tool outcomes as the text handed back to the model on the next turn. */
export function formatToolResults(results: Array<{ name: string; ok: boolean; output: string }>): string {
	const blocks = results.map((result) =>
		`[[result: ${result.name}]]\n${result.ok ? result.output : `ERROR: ${result.output}`}`);
	return `Tool results. Use them to answer; do not repeat the tool call unless something failed.\n\n${blocks.join('\n\n')}`;
}

/**
 * Resolves a reference written by the model (a name, a partial name or "#3")
 * against a list of named items. Returns null when nothing matches well enough.
 */
export function resolveByName<T>(reference: string, items: T[], nameOf: (item: T) => string, idOf?: (item: T) => string): T | null {
	const raw = (reference || '').trim();
	if (!raw || !items.length) return null;
	if (idOf) {
		const byId = items.find((item) => idOf(item) === raw);
		if (byId) return byId;
	}
	const indexed = raw.match(/^#?\s*(\d{1,3})$/);
	if (indexed) {
		const position = Number(indexed[1]) - 1;
		if (position >= 0 && position < items.length) return items[position];
	}
	const needle = normalizeForMatch(raw);
	if (!needle) return null;
	const exact = items.find((item) => normalizeForMatch(nameOf(item)) === needle);
	if (exact) return exact;
	const partial = items.filter((item) => {
		const name = normalizeForMatch(nameOf(item));
		return name.length > 2 && (name.includes(needle) || needle.includes(name));
	});
	return partial.length === 1 ? partial[0] : null;
}
