import { ApiInterface } from '../interfaces/api-interface';
import type { Model } from '../types/Model';
import type { CompletionResponse } from '../types/CompletionResponse';
import type { CodexCatalogModel, CodexRpcMessage } from '../types/CodexAppServer';
import type { CompletionOptions, EffortLevel } from '../utils/provider-options';
import { normalizeEffort } from '../utils/provider-options';
import {
	CODEX_CHARS_PER_TOKEN,
	CODEX_DEFAULT_TIMEOUT_MS,
	CODEX_PROBE_TIMEOUT_MS,
	CODEX_WRITING_INSTRUCTIONS,
} from '../constants/codex';
import { 
	assertCodexDesktop, 
	CodexRpcClient, 
	resolveCodexExecutable, 
	runCodexProcess 
} from '../utils/codex-process';

/** ChatGPT-subscription provider backed by Codex CLI's JSON-RPC app-server. */
export class CodexApi extends ApiInterface {
	apiKey = '';

	constructor(apiKey: string) {
		super(apiKey);
		this.apiKey = apiKey;
	}

	async validateApiKey(): Promise<boolean> {
		try {
			const executable = await resolveCodexExecutable(this.apiKey, CODEX_PROBE_TIMEOUT_MS);
			const version = await runCodexProcess(executable, ['--version'], CODEX_PROBE_TIMEOUT_MS);
			if (version.code !== 0) return false;
			return await withClient(executable, CODEX_PROBE_TIMEOUT_MS, async client => {
				await initialize(client, CODEX_PROBE_TIMEOUT_MS);
				const account = await client.request('account/read', { refreshToken: false }, CODEX_PROBE_TIMEOUT_MS);
				return account?.account?.type === 'chatgpt';
			});
		} catch (error) {
			console.error('Error validating Codex CLI:', error);
			return false;
		}
	}

	async getAvailableModels(): Promise<Model[]> {
		assertCodexDesktop();
		const executable = await resolveCodexExecutable(this.apiKey, CODEX_PROBE_TIMEOUT_MS);
		return withClient(executable, CODEX_PROBE_TIMEOUT_MS, async client => {
			await initialize(client, CODEX_PROBE_TIMEOUT_MS);
			await requireChatGptAccount(client, CODEX_PROBE_TIMEOUT_MS);
			const models: CodexCatalogModel[] = [];
			let cursor: string | null = null;
			do {
				const page = await client.request('model/list', { cursor, limit: 100, includeHidden: false }, CODEX_PROBE_TIMEOUT_MS);
				models.push(...(page?.data ?? []));
				cursor = page?.nextCursor ?? null;
			} while (cursor);
			return models.filter(model => !model.hidden).map(model => ({
				id: model.model || model.id,
				name: model.displayName || model.model || model.id,
				description: model.description || '',
				pricing: '',
				supportsVision: false,
				supportsImageGeneration: false,
				supportedReasoningEfforts: model.supportedReasoningEfforts.map(option => option.reasoningEffort),
			}));
		});
	}

	async generateCompletion(prompt: string, model: string, options: CompletionOptions = {}): Promise<CompletionResponse> {
		assertCodexDesktop();
		const executable = await resolveCodexExecutable(this.apiKey, CODEX_PROBE_TIMEOUT_MS);
		const stream = generateCodex(executable, prompt, model, options);
		if (options.stream) return { stream, model };
		let text = '';
		for await (const chunk of stream) text += chunk.text;
		return { text, model };
	}
}

async function initialize(client: CodexRpcClient, timeoutMs: number): Promise<void> {
	await client.request('initialize', {
		clientInfo: { name: 'novel_writer_ai', title: 'NovelWriter AI', version: '1.0.0' },
		capabilities: null,
	}, timeoutMs);
	client.notify('initialized');
}

async function requireChatGptAccount(client: CodexRpcClient, timeoutMs: number): Promise<void> {
	const response = await client.request('account/read', { refreshToken: false }, timeoutMs);
	const type = response?.account?.type;
	if (type === 'apiKey') {
		throw new Error('Codex CLI is signed in with an API key. Run `codex logout`, then `codex login` and choose ChatGPT to use your subscription.');
	}
	if (type !== 'chatgpt') {
		throw new Error('No ChatGPT session is available. Run `codex login` in a terminal and sign in with ChatGPT.');
	}
}

async function* generateCodex(
	executable: string,
	prompt: string,
	model: string,
	options: CompletionOptions
): AsyncGenerator<{ text: string }> {
	const timeoutMs = positiveInt(options.timeout_ms, CODEX_DEFAULT_TIMEOUT_MS);
	const { fs, os, path } = nodeModules();
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'novel-writer-codex-'));
	const client = new CodexRpcClient(executable, cwd);
	let unsubscribe = () => {};
	try {
		await initialize(client, CODEX_PROBE_TIMEOUT_MS);
		await requireChatGptAccount(client, CODEX_PROBE_TIMEOUT_MS);
		const thread = await client.request('thread/start', {
			model,
			cwd,
			approvalPolicy: 'never',
			sandbox: 'read-only',
			ephemeral: true,
			serviceName: 'novel_writer_ai',
			baseInstructions: CODEX_WRITING_INSTRUCTIONS,
			developerInstructions: CODEX_WRITING_INSTRUCTIONS,
			config: {
				mcp_servers: {},
				web_search: 'disabled',
				features: { skills: false, plugins: false },
			},
		}, timeoutMs);
		if (thread?.sandbox?.type && thread.sandbox.type !== 'readOnly') {
			throw new Error('This Codex CLI version did not apply the required read-only sandbox. Generation was blocked.');
		}
		const threadId = thread?.thread?.id;
		if (!threadId) throw new Error('Codex app-server did not return a thread id.');

		const events = createEventQueue();
		unsubscribe = client.onMessage(message => events.push(message));
		const turnResponse = await client.request('turn/start', {
			threadId,
			input: [{ type: 'text', text: addOutputHint(prompt, options), text_elements: [] }],
			model,
			effort: normalizeEffort(options.effort),
		}, timeoutMs);
		const turnId = turnResponse?.turn?.id;
		let used = 0;
		const limit = outputCharLimit(options);
		let pendingText = '';
		const stops = normalizeStops(options.stop);
		const retained = longestStop(stops);
		const deadline = Date.now() + timeoutMs;

		while (true) {
			const message = await events.next(Math.max(1, deadline - Date.now()));
			if (message.method && message.id !== undefined) {
				client.respond(message.id, { decision: 'decline' });
				await interruptQuietly(client, threadId, turnId);
				throw new Error('Codex requested a native tool or approval. The request was rejected to protect the vault.');
			}
			if (message.method === 'item/started' && isNativeAction(message.params?.item?.type)) {
				await interruptQuietly(client, threadId, turnId);
				throw new Error('Codex attempted to use a native tool. Generation was cancelled before accepting its output.');
			}
			if (message.method === 'error') throw describeServerError(message.params);
			if (message.method === 'item/agentMessage/delta') {
				pendingText += String(message.params?.delta ?? '');
				if (!pendingText) continue;
				const stopped = cutAtStop(pendingText, stops);
				const safeLength = stopped.stopped ? stopped.text.length : Math.max(0, stopped.text.length - retained);
				const chunk = stopped.text.slice(0, safeLength);
				pendingText = stopped.stopped ? '' : pendingText.slice(safeLength);
				if (chunk.length >= limit - used) {
					const tail = truncateAtWord(chunk, limit - used);
					if (tail) yield { text: tail };
					await interruptQuietly(client, threadId, turnId);
					return;
				}
				used += chunk.length;
				if (chunk) yield { text: chunk };
				if (stopped.stopped) { await interruptQuietly(client, threadId, turnId); return; }
			}
			if (message.method === 'turn/completed' && message.params?.turn?.id === turnId) {
				const turn = message.params.turn;
				if (turn.status === 'failed') throw describeTurnError(turn.error);
				if (pendingText) {
					const tail = truncateAtWord(pendingText, limit - used);
					if (tail) yield { text: tail };
				}
				return;
			}
		}
	} finally {
		unsubscribe();
		await client.close();
		try { fs.rmSync(cwd, { recursive: true, force: true }); } catch (_error) { /* OS may still be releasing handles. */ }
	}
}

function createEventQueue() {
	const values: CodexRpcMessage[] = [];
	let wake: ((message: CodexRpcMessage) => void) | null = null;
	return {
		push(message: CodexRpcMessage) { 
			if (wake) { 
				const resolve = wake; 
				wake = null; 
				resolve(message); 
			} else values.push(message); 
		},
		next(timeoutMs: number): Promise<CodexRpcMessage> {
			if (values.length) return Promise.resolve(values.shift() as CodexRpcMessage);
			return new Promise((resolve, reject) => {
				const timer = setTimeout(() => { 
					wake = null; 
					reject(new Error('Codex generation timed out and was cancelled.')); 
				}, timeoutMs);
				wake = message => { 
					clearTimeout(timer); 
					resolve(message);
				};
			});
		},
	};
}

function isNativeAction(type: string): boolean {
	return ['commandExecution', 'fileChange', 'mcpToolCall', 'dynamicToolCall', 'collabAgentToolCall', 'webSearch', 'imageView', 'imageGeneration'].includes(type);
}

async function interruptQuietly(client: CodexRpcClient, threadId: string, turnId?: string): Promise<void> {
	if (!turnId) return;
	try { await client.request('turn/interrupt', { threadId, turnId }, CODEX_PROBE_TIMEOUT_MS); } catch (_error) { /* Closing the process is the fallback. */ }
}

async function withClient<T>(executable: string, timeoutMs: number, action: (client: CodexRpcClient) => Promise<T>): Promise<T> {
	const { fs, os, path } = nodeModules();
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'novel-writer-codex-probe-'));
	const client = new CodexRpcClient(executable, cwd);
	try { 
		return await action(client); 
	}
	finally { 
		await client.close(); 
		try { 
			fs.rmSync(cwd, { recursive: true, force: true }); 
		} catch (_error) {} 
	}
}

function nodeModules(): { fs: any; os: any; path: any } {
	return { 
		fs: require('fs'), 
		os: require('os'), 
		path: require('path') 
	};
}

function positiveInt(value: unknown, fallback: number): number {
	const parsed = Number(value); 
	return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function outputCharLimit(options: CompletionOptions): number {
	const tokens = positiveInt(options.max_tokens, 0); return tokens ? tokens * CODEX_CHARS_PER_TOKEN : Infinity;
}

function addOutputHint(prompt: string, options: CompletionOptions): string {
	const tokens = positiveInt(options.max_tokens, 0);
	if (!tokens) return prompt;
	return `${prompt}\n\nKeep the answer under approximately ${Math.max(20, Math.floor(tokens * 0.6))} words and bring it to a natural close before that limit.`;
}

function truncateAtWord(text: string, limit: number): string {
	if (!Number.isFinite(limit) || text.length <= limit) return text;
	const clipped = text.slice(0, Math.max(0, limit));
	const split = clipped.search(/\s\S*$/);
	return (split > limit / 2 ? clipped.slice(0, split) : clipped).trimEnd();
}

function normalizeStops(stop: string | string[] | undefined): string[] {
	return (Array.isArray(stop) ? stop : stop ? [stop] : []).filter(Boolean);
}

function longestStop(stops: string[]): number { return Math.max(0, ...stops.map(stop => Math.max(0, stop.length - 1))); }

function cutAtStop(text: string, stops: string[]): { text: string; stopped: boolean } {
	let index = -1;
	for (const stop of stops) { const found = text.indexOf(stop); if (found >= 0 && (index < 0 || found < index)) index = found; }
	return index < 0 ? { text, stopped: false } : { text: text.slice(0, index), stopped: true };
}

function describeTurnError(error: any): Error {
	return new Error(actionableError(error?.message || 'Codex generation failed.', error?.codexErrorInfo));
}

function describeServerError(params: any): Error {
	return new Error(actionableError(params?.error?.message || 'Codex app-server returned an error.', params?.error?.codexErrorInfo));
}

function actionableError(message: string, info: any): string {
	const kind = typeof info === 'string' ? info : Object.keys(info ?? {})[0];
	if (kind === 'UsageLimitExceeded') return 'Your ChatGPT Codex quota is exhausted. Wait for the quota window to reset, then try again.';
	if (kind === 'Unauthorized') return 'The ChatGPT session has expired. Run `codex login` again.';
	if (kind === 'SandboxError') return `Codex could not establish the required read-only sandbox: ${message}`;
	if (/model/i.test(message) && /(access|available|support|not found)/i.test(message)) return `The selected Codex model is no longer accessible: ${message}`;
	return message;
}
