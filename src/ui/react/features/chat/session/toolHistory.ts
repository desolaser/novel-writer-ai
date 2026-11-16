import type { Mensaje, MensajeToolCall } from '../../../../../domain';
import type { ToolCall, ToolCallState } from '../../../../../types/AiTool';

/**
 * How tool activity is written into the conversation the model reads, and
 * into the trace stored with each chat message.
 */

/** One entry of the flattened conversation handed to the prompt builder. */
export interface HistoryTurn {
	role: 'user' | 'assistant';
	mensaje: string;
	/** A user turn that only carries tool results, which may be trimmed later. */
	toolResults?: boolean;
}

/** Longest argument value repeated back to the model in later rounds. */
const HISTORY_ARG_LIMIT = 300;
/** Tool result blocks kept whole; older ones are trimmed to save context. */
const FULL_RESULT_ROUNDS = 2;
const TRIMMED_RESULT_LENGTH = 600;
/** Longest argument or output stored in the chat file. */
const STORED_VALUE_LIMIT = 1500;

function cut(value: string, limit: number): string {
	const clean = value ?? '';
	if (clean.length <= limit) return clean;
	return `${clean.slice(0, limit).trimEnd()}... (${clean.length - limit} more characters)`;
}

/**
 * The model's turn as it stays in the history: its prose plus the calls it
 * made, with long values shortened. Without the calls the model forgot what
 * it had already asked for and repeated itself; with the full values a
 * chapter written in round one would be resent on every later round.
 */
export function describeCallsForHistory(text: string, calls: ToolCall[]): string {
	const blocks = calls.map((call) => {
		const args = Object.entries(call.args)
			.filter(([, value]) => (value ?? '').trim())
			.map(([name, value]) => `[[${name}]] ${cut(value.trim(), HISTORY_ARG_LIMIT)}`);
		return [`[[tool: ${call.name}]]`, ...args, '[[/tool]]'].join('\n');
	});
	return [text, ...blocks].filter(Boolean).join('\n\n') || '(tool call)';
}

/** Trims every tool result block except the most recent ones. */
export function compactToolResults(turns: HistoryTurn[]): HistoryTurn[] {
	const resultIndexes = turns
		.map((turn, index) => (turn.toolResults ? index : -1))
		.filter((index) => index >= 0);
	const keepFrom = resultIndexes.length - FULL_RESULT_ROUNDS;
	const trim = new Set(resultIndexes.slice(0, Math.max(0, keepFrom)));
	return turns.map((turn, index) => {
		if (!trim.has(index) || turn.mensaje.length <= TRIMMED_RESULT_LENGTH) return turn;
		return {
			...turn,
			mensaje: `${turn.mensaje.slice(0, TRIMMED_RESULT_LENGTH).trimEnd()}\n`
				+ '... (older tool results trimmed; call the tool again if you need them)',
		};
	});
}

/**
 * Trace of a call. Stored copies shorten long values; the live card the author
 * approves from passes `Infinity` so the whole text can be read first.
 */
export function toToolCallRecord(state: ToolCallState, limit = STORED_VALUE_LIMIT): MensajeToolCall {
	const args: Record<string, string> = {};
	for (const [name, value] of Object.entries(state.call.args)) {
		if ((value ?? '').trim()) args[name] = cut(value, limit);
	}
	return {
		id: state.call.id,
		name: state.call.name,
		kind: state.definition?.kind ?? 'unknown',
		args,
		status: state.status,
		...(state.result ? { ok: state.result.ok, output: cut(state.result.output, limit) } : {}),
		...(state.call.truncated ? { truncated: true } : {}),
		...(state.textOffset !== undefined ? { textOffset: state.textOffset } : {}),
		...(state.targets && Object.keys(state.targets).length ? { targets: state.targets } : {}),
	};
}

/** One line per call, appended to an old answer so later turns know what happened. */
function toolLog(calls: MensajeToolCall[]): string {
	const lines = calls.map((call) => {
		const target = call.args.chapter ?? call.args.entry ?? call.args.name ?? '';
		const outcome = call.status === 'done' ? 'ok' : call.status;
		return `- ${call.name}${target ? ` (${cut(target, 60)})` : ''}: ${outcome}`;
	});
	return `[Tools used in this answer]\n${lines.join('\n')}`;
}

/** Stored messages as the conversation the model reads. */
export function messagesToHistory(messages: Mensaje[]): HistoryTurn[] {
	return messages
		.filter((message) => message.role === 'user' || message.role === 'assistant')
		.map((message) => {
			const calls = message.toolCalls ?? [];
			const text = message.mensaje ?? '';
			if (message.role !== 'assistant' || !calls.length) {
				return { role: message.role as 'user' | 'assistant', mensaje: text };
			}
			return { role: 'assistant', mensaje: [text, toolLog(calls)].filter(Boolean).join('\n\n') };
		});
}
