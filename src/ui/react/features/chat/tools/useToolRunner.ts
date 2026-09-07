import { useCallback, useRef, useState } from 'react';
import type { ToolCall, ToolCallState, ToolCallStatus, ToolResult } from '../../../../../types/AiTool';
import { executeToolCall } from '../../../../../tools/executor';
import { findToolDefinition } from '../../../../../tools/registry';
import { createStoreToolContext } from './createStoreToolContext';

/**
 * Drives the tool calls of one chat turn.
 *
 * Read tools run as soon as they arrive. Write tools stop the turn and wait for the
 * author to approve or reject them, which is why `runCalls` returns a promise that
 * only settles once every call has an outcome — the chat loop awaits it before
 * asking the model to continue.
 */
export function useToolRunner() {
	const [calls, setCalls] = useState<ToolCallState[]>([]);
	const decisionsRef = useRef<Record<string, (approved: boolean) => void>>({});

	const patchCall = useCallback((id: string, status: ToolCallStatus, result?: ToolResult) => {
		setCalls((previous) => previous.map((state) =>
			state.call.id === id ? { ...state, status, result: result ?? state.result } : state));
	}, []);

	const decide = useCallback((id: string, approved: boolean) => {
		const resolve = decisionsRef.current[id];
		if (!resolve) return;
		delete decisionsRef.current[id];
		resolve(approved);
	}, []);

	/** Releases every pending decision as a rejection, so no turn is left hanging. */
	const cancelPending = useCallback(() => {
		Object.keys(decisionsRef.current).forEach((id) => decide(id, false));
	}, [decide]);

	const reset = useCallback(() => {
		cancelPending();
		setCalls([]);
	}, [cancelPending]);

	const runCalls = useCallback(async (incoming: ToolCall[]): Promise<ToolResult[]> => {
		const context = createStoreToolContext();
		const states: ToolCallState[] = incoming.map((call) => ({
			call,
			definition: findToolDefinition(call.name),
			status: 'pending',
		}));
		setCalls((previous) => [...previous, ...states]);

		const results: ToolResult[] = [];
		for (const state of states) {
			const { id } = state.call;
			// A truncated call is refused by the executor, so do not bother the author with it.
			if (state.definition?.kind === 'write' && !state.call.truncated) {
				patchCall(id, 'awaiting');
				const approved = await new Promise<boolean>((resolve) => { decisionsRef.current[id] = resolve; });
				if (!approved) {
					const rejected: ToolResult = {
						callId: id,
						name: state.call.name,
						ok: false,
						output: 'The author rejected this action. Do not retry it unless they ask for it.',
					};
					patchCall(id, 'rejected', rejected);
					results.push(rejected);
					continue;
				}
			}
			patchCall(id, 'running');
			const result = await executeToolCall(state.call, context);
			patchCall(id, result.ok ? 'done' : 'error', result);
			results.push(result);
		}
		return results;
	}, [patchCall]);

	return {
		calls,
		runCalls,
		reset,
		cancelPending,
		approve: (id: string) => decide(id, true),
		reject: (id: string) => decide(id, false),
		awaiting: calls.some((state) => state.status === 'awaiting'),
	};
}
