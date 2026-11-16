import type { EntityId, Mensaje } from '../../../../../domain';
import type { ChatPersistence } from '../../../../../interfaces/chat-persistence';
import type { ToolContext } from '../../../../../interfaces/tool-context';
import type {
	ToolCall,
	ToolCallState,
	ToolCallStatus,
	ToolResult,
} from '../../../../../types/AiTool';
import { executeToolCall } from '../../../../../tools/executor';
import { findToolDefinition } from '../../../../../tools/registry';
import { parseToolAnswer } from '../../../../../tools/parseToolAnswer';
import {
	createLoopState,
	runAgentLoop,
	type AgentLoopOutcome,
	type AgentLoopState,
	type ModelAnswer,
} from './agentLoop';
import { messagesToHistory, toToolCallRecord, type HistoryTurn } from './toolHistory';

/** What the UI hands over when a turn starts; captured for the whole turn. */
export interface ChatTurnConfig {
	buildPrompt(turns: HistoryTurn[], pending: string): string;
	/** Asks the model; `images` only carries pictures on the first request. */
	complete(prompt: string, images: string[]): Promise<ModelAnswer>;
	toolsEnabled: boolean;
}

export interface ChatSessionDeps {
	persistence: ChatPersistence;
	createToolContext(): ToolContext;
	/** Novel the session's chat belongs to, and the one active right now. */
	novelId: string | null;
	activeNovelId(): string | null;
	autoApproveWrites(): boolean;
	roundsBeforePause(): number;
}

export type ChatSessionStatus = 'idle' | 'running' | 'paused';

export interface ChatSessionSnapshot {
	status: ChatSessionStatus;
	/** A write tool waits for the author. */
	awaiting: boolean;
	liveText: string;
	liveImages: string[];
	calls: ToolCallState[];
	/** Stored assistant message of the turn in progress, once it exists. */
	turnMessageId: string | null;
	notice: string | null;
	stopping: boolean;
	/** Bumps on every write to the chat file, so views know to reload it. */
	version: number;
}

export const IDLE_CHAT_SNAPSHOT: ChatSessionSnapshot = {
	status: 'idle',
	awaiting: false,
	liveText: '',
	liveImages: [],
	calls: [],
	turnMessageId: null,
	notice: null,
	stopping: false,
	version: 0,
};

const PAUSE_NOTICES: Record<'limit' | 'repeating', string> = {
	limit: 'Paused after many rounds of tool calls. Continue to let the AI keep working.',
	repeating: 'Paused: the AI kept repeating the same tool calls.',
};

/**
 * One chat's conversation with the AI, independent of any view.
 *
 * The turn used to live in the chat component: leaving the tab unmounted it,
 * the tool cards vanished, pending approvals were lost and the reply could be
 * saved to whatever chat was open by then. A session belongs to one chat id,
 * keeps running in the background, and views just subscribe to it.
 */
export class ChatSession {
	private snapshot: ChatSessionSnapshot = IDLE_CHAT_SNAPSHOT;
	private readonly listeners = new Set<() => void>();
	private readonly decisions = new Map<string, (approved: boolean) => void>();
	private loop: AgentLoopState | null = null;
	private config: ChatTurnConfig | null = null;
	/** Pictures attached to the message the turn answers. */
	private turnImages: string[] = [];
	private stopRequested = false;
	private approveRestOfTurn = false;
	private saving: Promise<void> = Promise.resolve();

	constructor(readonly chatId: EntityId, private readonly deps: ChatSessionDeps) {}

	subscribe = (listener: () => void): (() => void) => {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	};

	getSnapshot = (): ChatSessionSnapshot => this.snapshot;

	get busy(): boolean {
		return this.snapshot.status !== 'idle';
	}

	/** Stores the author's message and lets the AI answer it. */
	async send(text: string, images: string[], config: ChatTurnConfig): Promise<void> {
		if (this.snapshot.status === 'running') return;
		if (this.snapshot.status === 'paused') await this.finish(null);
		const message = await this.deps.persistence.appendMessage(
			this.chatId, 'user', text, images.length ? { imagenes: images } : undefined,
		);
		this.bumpVersion();
		const chat = await this.deps.persistence.readChat(this.chatId);
		const before = (chat?.mensajes ?? []).filter((m) => m.id_mensaje !== message.id_mensaje);
		await this.startTurn(before, message, images, config);
	}

	/** Drops the last answer and asks again for the last message of the author. */
	async regenerate(config: ChatTurnConfig): Promise<void> {
		if (this.busy) return;
		const chat = await this.deps.persistence.readChat(this.chatId);
		const messages = chat?.mensajes ?? [];
		const lastAnswer = [...messages].reverse().find((m) => m.role === 'assistant');
		if (lastAnswer) {
			await this.deps.persistence.deleteMessage(this.chatId, lastAnswer.id_mensaje);
			this.bumpVersion();
		}
		const remaining = messages.filter((m) => m !== lastAnswer);
		const lastUser = [...remaining].reverse().find((m) => m.role === 'user');
		if (!lastUser) return;
		const cut = remaining.indexOf(lastUser);
		await this.startTurn(remaining.slice(0, cut), lastUser, lastUser.imagenes ?? [], config);
	}

	/** Resumes a turn paused by the round limit or the repeat guard. */
	async continueTurn(): Promise<void> {
		if (this.snapshot.status !== 'paused' || !this.loop) return;
		await this.runLoop();
	}

	/** Stops the turn at the next step; pending approvals count as rejected. */
	stop(): void {
		if (this.snapshot.status === 'paused') {
			void this.finish('Stopped.');
			return;
		}
		if (this.snapshot.status !== 'running') return;
		this.stopRequested = true;
		this.update({ stopping: true });
		for (const id of [...this.decisions.keys()]) this.decide(id, false);
	}

	approve(id: string): void {
		this.decide(id, true);
	}

	reject(id: string): void {
		this.decide(id, false);
	}

	/** Approves this call and every other write until the turn ends. */
	approveAll(id: string): void {
		this.approveRestOfTurn = true;
		this.decide(id, true);
	}

	private async startTurn(
		before: Mensaje[],
		userMessage: Mensaje,
		images: string[],
		config: ChatTurnConfig,
	): Promise<void> {
		this.config = config;
		this.turnImages = images;
		this.loop = createLoopState(messagesToHistory(before), userMessage.mensaje);
		this.stopRequested = false;
		this.approveRestOfTurn = false;
		this.update({
			...IDLE_CHAT_SNAPSHOT,
			status: 'running',
			version: this.snapshot.version,
			liveImages: [],
		});
		await this.runLoop();
	}

	private async runLoop(): Promise<void> {
		const loop = this.loop;
		const config = this.config;
		if (!loop || !config) return;
		this.update({ status: 'running', notice: null });
		let outcome: AgentLoopOutcome;
		try {
			outcome = await runAgentLoop(loop, {
				buildPrompt: config.buildPrompt,
				// Pictures go with the first request only, like the message they came with.
				complete: (prompt, round) =>
					config.complete(prompt, round === 0 ? this.turnImages : []),
				parse: (answer, round) => config.toolsEnabled
					? parseToolAnswer(answer, `t${Date.now().toString(36)}r${round}`)
					: { text: answer, calls: [] },
				runCalls: (calls, skipped) => this.runCalls(calls, skipped),
				isWriteTool: (name) => findToolDefinition(name)?.kind === 'write',
				shouldStop: () => this.stopRequested,
				onProgress: (state) => {
					this.update({
						liveText: state.visible.join('\n\n'),
						liveImages: [...state.images],
					});
					this.persistTurn();
				},
			}, Math.max(1, this.deps.roundsBeforePause()));
		} catch (error: any) {
			loop.visible.push(`Error: ${error?.message ?? String(error)}`);
			await this.finish(null);
			return;
		}
		if (outcome.kind === 'paused') {
			this.update({ status: 'paused', notice: PAUSE_NOTICES[outcome.reason] });
			this.persistTurn();
			await this.saving;
			return;
		}
		await this.finish(outcome.kind === 'stopped' ? 'Stopped by you.' : null);
	}

	/** Ends the turn: final save, then back to idle. */
	private async finish(notice: string | null): Promise<void> {
		this.stopRequested = false;
		this.persistTurn(true);
		await this.saving;
		this.loop = null;
		this.config = null;
		this.turnImages = [];
		this.update({
			...IDLE_CHAT_SNAPSHOT,
			version: this.snapshot.version,
			notice,
		});
	}

	private async runCalls(
		calls: ToolCall[],
		skipped: Record<string, string>,
	): Promise<ToolResult[]> {
		const context = this.deps.createToolContext();
		const states: ToolCallState[] = calls.map((call) => {
			const definition = findToolDefinition(call.name);
			const reason = skipped[call.id];
			if (!reason) return { call, definition, status: 'pending' as ToolCallStatus };
			const result: ToolResult = { callId: call.id, name: call.name, ok: false, output: reason };
			return { call, definition, status: 'error' as ToolCallStatus, result };
		});
		this.update({ calls: [...this.snapshot.calls, ...states] });

		const results: ToolResult[] = [];
		for (const state of states) {
			if (state.result) {
				results.push(state.result);
				continue;
			}
			const result = await this.runOne(state, context);
			results.push(result);
		}
		this.persistTurn();
		return results;
	}

	private async runOne(state: ToolCallState, context: ToolContext): Promise<ToolResult> {
		const { call, definition } = state;
		const refuse = (status: ToolCallStatus, output: string): ToolResult => {
			const result: ToolResult = { callId: call.id, name: call.name, ok: false, output };
			this.patchCall(call.id, status, result);
			return result;
		};
		if (this.stopRequested) {
			return refuse('rejected', 'The author stopped the turn before this call ran.');
		}
		if (this.deps.novelId !== this.deps.activeNovelId()) {
			this.stopRequested = true;
			return refuse('error', 'The author switched to another novel, so nothing was changed.');
		}
		const needsApproval = definition?.kind === 'write'
			&& !call.truncated
			&& !this.approveRestOfTurn
			&& !this.deps.autoApproveWrites();
		if (needsApproval) {
			this.patchCall(call.id, 'awaiting');
			this.persistTurn();
			const approved = await new Promise<boolean>((resolve) => {
				this.decisions.set(call.id, resolve);
			});
			if (!approved) {
				return refuse('rejected', this.stopRequested
					? 'The author stopped the turn before this call ran.'
					: 'The author rejected this action. Do not retry it unless they ask for it.');
			}
		}
		this.patchCall(call.id, 'running');
		// Write tools only get here approved: by the author, by "approve all"
		// for this turn, or by the auto-approve setting the author turned on.
		const result = await executeToolCall(call, context, true);
		this.patchCall(call.id, result.ok ? 'done' : 'error', result);
		return result;
	}

	private decide(id: string, approved: boolean): void {
		const resolve = this.decisions.get(id);
		if (!resolve) return;
		this.decisions.delete(id);
		resolve(approved);
	}

	private patchCall(id: string, status: ToolCallStatus, result?: ToolResult): void {
		const calls = this.snapshot.calls.map((state) => state.call.id === id
			? { ...state, status, result: result ?? state.result }
			: state);
		this.update({ calls, awaiting: calls.some((state) => state.status === 'awaiting') });
	}

	/**
	 * Saves the turn's answer as it grows: created after the first reply of the
	 * model, then updated after every round. Saves are chained so they land in
	 * order, and the answer survives Obsidian closing mid-turn.
	 */
	private persistTurn(final = false): void {
		const loop = this.loop;
		if (!loop) return;
		const visible = loop.visible.join('\n\n').trim();
		const images = [...loop.images];
		const toolCalls = this.snapshot.calls.map((state) => toToolCallRecord(state));
		const nothing = !visible && !images.length && !toolCalls.length;
		if (nothing && !final) return;
		const text = visible || (images.length || toolCalls.length ? '' : '(no response)');
		this.saving = this.saving.then(async () => {
			const persistence = this.deps.persistence;
			const id = this.snapshot.turnMessageId;
			if (id) {
				await persistence.patchMessage(this.chatId, id, { mensaje: text, imagenes: images, toolCalls });
			} else {
				const message = await persistence.appendMessage(
					this.chatId, 'assistant', text, { imagenes: images, toolCalls },
				);
				this.update({ turnMessageId: message.id_mensaje });
			}
			this.bumpVersion();
		}).catch((error) => {
			console.error('Novel Writer: could not save the chat answer', error);
		});
	}

	private bumpVersion(): void {
		this.update({ version: this.snapshot.version + 1 });
	}

	private update(patch: Partial<ChatSessionSnapshot>): void {
		this.snapshot = { ...this.snapshot, ...patch };
		this.listeners.forEach((listener) => listener());
	}
}
