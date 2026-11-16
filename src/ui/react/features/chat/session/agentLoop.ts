import type { ToolCall, ToolResult } from '../../../../../types/AiTool';
import { formatToolResults } from '../../../../../utils/toolCallParsing';
import { describeCallsForHistory, compactToolResults, type HistoryTurn } from './toolHistory';

/**
 * The agent loop of one chat turn, without React or storage.
 *
 * Ask the model, run the tools it calls, hand it the results and ask again,
 * until it answers without calling anything. Like Claude Code, the model
 * decides when the work is done; the loop only keeps it from running away:
 *
 * - After `roundsAllowed` rounds of tool calls it pauses. The author can
 *   continue the same turn or leave it there.
 * - A call identical to one already run twice (since the last successful
 *   write) is not run again; the model gets an error telling it to use the
 *   result it already has. Two rounds made only of such repeats pause the turn.
 * - The author can stop at any time; the loop checks between steps.
 */

export interface ModelAnswer {
	text: string;
	images: string[];
}

export interface ParsedModelAnswer {
	text: string;
	calls: ToolCall[];
}

export interface AgentLoopDeps {
	/** Prompt from the conversation so far plus the pending user text or results. */
	buildPrompt(turns: HistoryTurn[], pending: string): string;
	complete(prompt: string, round: number): Promise<ModelAnswer>;
	parse(answer: string, round: number): ParsedModelAnswer;
	/**
	 * Runs the calls (asking for approval where needed). Calls listed in
	 * `skipped` must not run; their value is the error to report instead.
	 */
	runCalls(calls: ToolCall[], skipped: Record<string, string>): Promise<ToolResult[]>;
	isWriteTool(name: string): boolean;
	shouldStop(): boolean;
	/** Called whenever the visible text or images of the turn change. */
	onProgress(state: AgentLoopState): void;
}

export interface AgentLoopState {
	/** Conversation sent before `pending`: earlier messages plus this turn's rounds. */
	turns: HistoryTurn[];
	/** The author's message on the first round, tool results afterwards. */
	pending: string;
	/** Prose the model wrote this turn, one item per round. */
	visible: string[];
	images: string[];
	/** Requests made to the model in this turn so far. */
	round: number;
	/** Times each call signature ran since the last successful write. */
	seen: Record<string, number>;
	/** Consecutive rounds in which every call was a skipped repeat. */
	repeatRounds: number;
}

export type AgentLoopOutcome =
	| { kind: 'done' }
	| { kind: 'stopped' }
	| { kind: 'paused'; reason: 'limit' | 'repeating' };

/** Identical calls allowed before a repeat is refused. */
const MAX_IDENTICAL_CALLS = 2;
/** Rounds of nothing but refused repeats before the turn pauses. */
const MAX_REPEAT_ROUNDS = 2;

export function createLoopState(turns: HistoryTurn[], userText: string): AgentLoopState {
	return {
		turns: [...turns],
		pending: userText,
		visible: [],
		images: [],
		round: 0,
		seen: {},
		repeatRounds: 0,
	};
}

/** Same tool, same arguments: what counts as "the same call" for the guard. */
export function callSignature(call: ToolCall): string {
	const args = Object.keys(call.args)
		.sort()
		.map((key) => [key, (call.args[key] ?? '').trim()]);
	return `${call.name}:${JSON.stringify(args)}`;
}

function repeatMessage(count: number): string {
	return `Skipped: you already made this exact call ${count} times in this turn. `
		+ 'Use the result you already have, or change the arguments if you need '
		+ 'something different.';
}

/**
 * Runs rounds until the model is done, the author stops it, or a guard pauses
 * it. `state` is updated in place, so a paused turn resumes by calling this
 * again with the same state.
 */
export async function runAgentLoop(
	state: AgentLoopState,
	deps: AgentLoopDeps,
	roundsAllowed: number,
): Promise<AgentLoopOutcome> {
	let toolRounds = 0;
	while (true) {
		if (deps.shouldStop()) return { kind: 'stopped' };

		const prompt = deps.buildPrompt(state.turns, state.pending);
		const answer = await deps.complete(prompt, state.round);
		// Stopped while the model was answering: drop the answer, run nothing.
		if (deps.shouldStop()) return { kind: 'stopped' };
		const parsed = deps.parse(answer.text ?? '', state.round);
		if (parsed.text) state.visible.push(parsed.text);
		if (answer.images.length) state.images.push(...answer.images);
		deps.onProgress(state);

		if (!parsed.calls.length) return { kind: 'done' };
		if (deps.shouldStop()) return { kind: 'stopped' };

		const skipped: Record<string, string> = {};
		for (const call of parsed.calls) {
			const count = state.seen[callSignature(call)] ?? 0;
			if (count >= MAX_IDENTICAL_CALLS) skipped[call.id] = repeatMessage(count);
		}
		const results = await deps.runCalls(parsed.calls, skipped);
		recordRound(state, parsed, results, skipped, deps);

		if (deps.shouldStop()) return { kind: 'stopped' };
		if (state.repeatRounds >= MAX_REPEAT_ROUNDS) {
			return { kind: 'paused', reason: 'repeating' };
		}
		toolRounds += 1;
		if (toolRounds >= roundsAllowed) return { kind: 'paused', reason: 'limit' };
	}
}

/** Moves the round into the history and prepares the results as the next input. */
function recordRound(
	state: AgentLoopState,
	parsed: ParsedModelAnswer,
	results: ToolResult[],
	skipped: Record<string, string>,
	deps: AgentLoopDeps,
): void {
	const allSkipped = parsed.calls.every((call) => skipped[call.id]);
	state.repeatRounds = allSkipped ? state.repeatRounds + 1 : 0;

	const wroteSomething = results.some((result) => result.ok && deps.isWriteTool(result.name));
	// After a write, reading the same thing again is legitimate: it changed.
	if (wroteSomething) state.seen = {};
	for (const call of parsed.calls) {
		if (skipped[call.id]) continue;
		const signature = callSignature(call);
		state.seen[signature] = (state.seen[signature] ?? 0) + 1;
	}

	const firstRound = state.round === 0;
	state.turns = compactToolResults([
		...state.turns,
		{ role: 'user', mensaje: state.pending, toolResults: !firstRound },
		{ role: 'assistant', mensaje: describeCallsForHistory(parsed.text, parsed.calls) },
	]);
	state.pending = formatToolResults(results);
	state.round += 1;
}
