import { ApiInterface } from '../interfaces/api-interface';
import { mapAnthropicUsage } from '../utils/anthropic-usage';
import type { Model } from '../types/Model';
import type { CompletionResponse } from '../types/CompletionResponse';

/**
 * Provider that uses the Claude (Pro/Max) subscription by launching the Claude Code CLI
 * in headless mode, instead of the Anthropic API.
 *
 * IMPORTANT: no module-level `import`/`require` of Node modules. The plugin declares
 * `isDesktopOnly: false` and `ApiFactory` imports this class statically, so a require at
 * the top of the file would run when the plugin loads and would break on mobile. Every
 * require lives inside a function.
 */

const DEFAULT_TIMEOUT_MS = 300000;
const PROBE_TIMEOUT_MS = 15000;

/**
 * Full override of Claude Code's system prompt. Without this the CLI responds in coding-
 * assistant mode (explanations, lists, offers to edit files) and also drags along ~13,000
 * tokens of scaffolding per call; with the override we measured ~336.
 */
const PROSE_SYSTEM_PROMPT =
	'You are assisting with writing a novel. Return only the requested prose or text, ' +
	'with no preamble, no comments about what you are about to do, no explanations ' +
	'afterward, and no markdown formatting. Do not offer to edit files or use tools.';

/**
 * The CLI has no models endpoint, so the list is static (same pattern as
 * `novelai-api.ts`). It also doubles as an allowlist: the id is passed via argv, and only
 * these values are accepted.
 */
const MODELS: Model[] = [
	{ id: 'sonnet', name: 'Sonnet (latest)', description: 'Balance of quality and quota usage. Recommended for prose.', contextLength: 1000000, pricing: '', supportsVision: false, supportsImageGeneration: false },
	{ id: 'opus', name: 'Opus (latest)', description: 'Higher quality, uses more quota. May require the Max plan.', contextLength: 1000000, pricing: '', supportsVision: false, supportsImageGeneration: false },
	{ id: 'haiku', name: 'Haiku (latest)', description: 'Fast and cheap on quota, lower narrative quality.', contextLength: 200000, pricing: '', supportsVision: false, supportsImageGeneration: false },
	{ id: 'fable', name: 'Fable (latest)', description: 'The most capable model. High quota usage. May require the Max plan.', contextLength: 1000000, pricing: '', supportsVision: false, supportsImageGeneration: false },
];

const MODEL_IDS = MODELS.map(model => model.id);

/** Resolved executable path, cached for the Obsidian session. */
let resolvedExecutable: string | null = null;

export class ClaudeCodeApi extends ApiInterface {
	/** Reuses ModelModal's API Key field as an optional executable path. */
	apiKey = '';

	constructor(apiKey: string) {
		super(apiKey);
		this.apiKey = apiKey;
	}

	async getAvailableModels(): Promise<Model[]> {
		assertDesktop();
		return MODELS.map(model => ({ ...model }));
	}

	/** Here "validating the key" means: the CLI is installed and responds. */
	async validateApiKey(): Promise<boolean> {
		try {
			assertDesktop();
			const executable = await this.resolveExecutable();
			const result = await runProcess(executable, ['--version'], '', PROBE_TIMEOUT_MS);
			return result.code === 0;
		} catch (error) {
			console.error('Error validating Claude Code CLI:', error);
			return false;
		}
	}

	async generateCompletion(
		prompt: string,
		model: string,
		options: Record<string, any> = {}
	): Promise<CompletionResponse> {
		assertDesktop();
		if (MODEL_IDS.indexOf(model) === -1) {
			throw new Error(`Model "${model}" is not supported by Claude Code. Valid: ${MODEL_IDS.join(', ')}.`);
		}

		const executable = await this.resolveExecutable();
		const streaming = Boolean(options.stream);
		const args = buildArgs(model, streaming, options);
		const timeoutMs = positiveInt(options.timeout_ms, DEFAULT_TIMEOUT_MS);
		const env = buildEnv(options);

		if (streaming) {
			const lines = streamProcessLines(executable, args, prompt, timeoutMs, env);
			return { stream: toTextChunks(lines), model };
		}

		const result = await runProcess(executable, args, prompt, timeoutMs, env);
		if (result.code !== 0) {
			throw new Error(`Claude Code exited with code ${result.code}. ${result.stderr.trim() || 'No detail on stderr.'}`);
		}

		const payload = parseResultLine(result.stdout);
		if (!payload) {
			throw new Error(`Could not parse Claude Code's output. ${result.stderr.trim()}`.trim());
		}
		if (payload.is_error || payload.api_error_status) {
			throw new Error(`Claude Code returned an error (${payload.subtype ?? payload.api_error_status}): ${payload.result ?? ''}`);
		}
		return {
			text: typeof payload.result === 'string' ? payload.result : '',
			usage: mapAnthropicUsage(payload.usage),
			model,
		};
	}

	/**
	 * Resolves the absolute executable path and caches it. Resolved to a real path (via
	 * `where`/`which`) instead of using `shell: true`, because in shell mode Node does NOT
	 * quote arguments and `--tools ""` and `--system-prompt "..."` would break.
	 */
	private async resolveExecutable(): Promise<string> {
		const configured = (this.apiKey ?? '').trim();
		if (configured) return configured;
		if (resolvedExecutable) return resolvedExecutable;

		const isWindows = process.platform === 'win32';
		let candidates: string[] = [];
		try {
			const found = await runProcess(isWindows ? 'where' : 'which', ['claude'], '', PROBE_TIMEOUT_MS);
			if (found.code === 0) {
				candidates = found.stdout.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
			}
		} catch (error) {
			// `where`/`which` may not exist; falls back to the bare name below.
		}
		// A .exe can be launched directly; a .cmd has to go through cmd.exe.
		candidates.sort((a, b) => Number(b.toLowerCase().endsWith('.exe')) - Number(a.toLowerCase().endsWith('.exe')));
		if (!candidates.length) candidates = isWindows ? ['claude.exe', 'claude'] : ['claude'];

		for (const candidate of candidates) {
			try {
				const probe = await runProcess(candidate, ['--version'], '', PROBE_TIMEOUT_MS);
				if (probe.code === 0) {
					resolvedExecutable = candidate;
					return candidate;
				}
			} catch (error) {
				// Try the next candidate.
			}
		}
		throw new Error(
			'Could not find the `claude` executable. Install Claude Code and make sure it is on ' +
			'PATH, or enter the full path in the provider settings field.'
		);
	}
}

function buildArgs(model: string, streaming: boolean, options: Record<string, any>): string[] {
	const args = [
		'-p',
		'--model', model,
		'--output-format', streaming ? 'stream-json' : 'json',
		// Pure text generation: with no tools there are no permissions to ask for (which
		// would hang or fail in headless mode) and most of the injected context is trimmed.
		'--tools', '',
		'--system-prompt', PROSE_SYSTEM_PROMPT,
		// Disables CLAUDE.md, skills, plugins, hooks and MCP servers. Subscription auth
		// keeps working (unlike `--bare`, which forces an API key).
		'--safe-mode',
		'--no-session-persistence',
		'--effort', readEffort(options.effort),
	];
	if (streaming) args.push('--verbose', '--include-partial-messages');
	const budget = Number(options.max_budget_usd);
	if (Number.isFinite(budget) && budget > 0) args.push('--max-budget-usd', String(budget));
	return args;
}

function buildEnv(options: Record<string, any>): Record<string, string> {
	// Inheriting process.env is what lets the CLI find the OAuth session in ~/.claude.
	const env: Record<string, string> = { ...(process.env as Record<string, string>) };
	const maxTokens = Number(options.max_tokens);
	if (Number.isFinite(maxTokens) && maxTokens > 0) {
		env.CLAUDE_CODE_MAX_OUTPUT_TOKENS = String(Math.floor(maxTokens));
	}
	return env;
}

function readEffort(value: unknown): string {
	const levels = ['low', 'medium', 'high', 'xhigh', 'max'];
	return levels.indexOf(value as string) === -1 ? 'low' : (value as string);
}

function positiveInt(value: unknown, fallback: number): number {
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function assertDesktop(): void {
	if (typeof process === 'undefined' || !process?.versions?.node) {
		throw new Error('The Claude Code provider only works on Obsidian desktop.');
	}
}

/** The final `{"type":"result"}` object is the one carrying the text and usage. */
function parseResultLine(stdout: string): any {
	let result: any = null;
	for (const line of stdout.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (trimmed.charAt(0) !== '{') continue;
		try {
			const parsed = JSON.parse(trimmed);
			if (parsed?.type === 'result' || parsed?.result !== undefined) result = parsed;
		} catch (error) {
			// Incomplete line or noise: ignored.
		}
	}
	return result;
}

/**
 * Converts the CLI's NDJSON into text chunks.
 *
 * NOTE: only `content_block_delta` events are emitted. The `type: "assistant"` event
 * repeats the FULL message, so without filtering it the text comes out duplicated.
 */
async function* toTextChunks(lines: AsyncIterable<string>): AsyncGenerator<{ text: string }> {
	let emitted = false;
	let fallback = '';
	for await (const line of lines) {
		let event: any;
		try {
			event = JSON.parse(line);
		} catch (error) {
			continue;
		}
		if (event?.type === 'stream_event') {
			const inner = event.event;
			if (inner?.type === 'content_block_delta' && inner.delta?.type === 'text_delta' && inner.delta.text) {
				emitted = true;
				yield { text: inner.delta.text };
			}
			continue;
		}
		if (event?.type === 'result') {
			if (event.is_error || event.api_error_status) {
				throw new Error(`Claude Code returned an error (${event.subtype ?? event.api_error_status}): ${event.result ?? ''}`);
			}
			if (typeof event.result === 'string') fallback = event.result;
		}
	}
	// If no delta arrived (a CLI version without --include-partial-messages), use the final text.
	if (!emitted && fallback) yield { text: fallback };
}

interface ProcessResult {
	code: number;
	stdout: string;
	stderr: string;
}

function spawnClaude(executable: string, args: string[], env?: Record<string, string>): any {
	// Lazy require: see the mobile note at the top of this file.
	const { spawn } = require('child_process');
	const os = require('os');
	const lower = executable.toLowerCase();
	// Node >=20.12 refuses to run .cmd/.bat directly; it's routed through cmd.exe, which
	// receives the arguments already quoted by Node (shell stays false).
	const useCmdWrapper = process.platform === 'win32' && (lower.endsWith('.cmd') || lower.endsWith('.bat'));
	const command = useCmdWrapper ? 'cmd.exe' : executable;
	const finalArgs = useCmdWrapper ? ['/d', '/s', '/c', executable].concat(args) : args;
	return spawn(command, finalArgs, {
		shell: false,
		windowsHide: true,
		cwd: os.tmpdir(),
		env: env ?? process.env,
	});
}

function runProcess(
	executable: string,
	args: string[],
	input: string,
	timeoutMs: number,
	env?: Record<string, string>
): Promise<ProcessResult> {
	return new Promise((resolve, reject) => {
		let child: any;
		try {
			child = spawnClaude(executable, args, env);
		} catch (error) {
			reject(error);
			return;
		}
		let stdout = '';
		let stderr = '';
		let settled = false;
		const timer = setTimeout(() => {
			if (settled) return;
			settled = true;
			killQuietly(child);
			reject(new Error(`Claude Code did not respond within ${Math.round(timeoutMs / 1000)}s and was cancelled.`));
		}, timeoutMs);

		child.stdout?.setEncoding('utf8');
		child.stderr?.setEncoding('utf8');
		child.stdout?.on('data', (chunk: string) => { stdout += chunk; });
		child.stderr?.on('data', (chunk: string) => { stderr += chunk; });
		child.on('error', (error: any) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			reject(describeSpawnError(error, executable));
		});
		child.on('close', (code: number) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolve({ code: code ?? -1, stdout, stderr });
		});

		writeStdin(child, input);
	});
}

/** Reads stdout line by line, to consume the NDJSON as it arrives. */
async function* streamProcessLines(
	executable: string,
	args: string[],
	input: string,
	timeoutMs: number,
	env?: Record<string, string>
): AsyncGenerator<string> {
	const child = spawnClaude(executable, args, env);
	const pending: string[] = [];
	let buffer = '';
	let stderr = '';
	let finished = false;
	let failure: Error | null = null;
	let wake: (() => void) | null = null;
	const notify = () => { const resume = wake; wake = null; if (resume) resume(); };

	const timer = setTimeout(() => {
		failure = new Error(`Claude Code did not respond within ${Math.round(timeoutMs / 1000)}s and was cancelled.`);
		killQuietly(child);
		finished = true;
		notify();
	}, timeoutMs);

	child.stdout?.setEncoding('utf8');
	child.stderr?.setEncoding('utf8');
	child.stdout?.on('data', (chunk: string) => {
		buffer += chunk;
		const parts = buffer.split(/\r?\n/);
		buffer = parts.pop() ?? '';
		for (const part of parts) if (part.trim()) pending.push(part.trim());
		notify();
	});
	child.stderr?.on('data', (chunk: string) => { stderr += chunk; });
	child.on('error', (error: any) => {
		failure = describeSpawnError(error, executable);
		finished = true;
		notify();
	});
	child.on('close', (code: number) => {
		if (buffer.trim()) pending.push(buffer.trim());
		buffer = '';
		if (!failure && code !== 0) {
			failure = new Error(`Claude Code exited with code ${code}. ${stderr.trim() || 'No detail on stderr.'}`);
		}
		finished = true;
		notify();
	});

	writeStdin(child, input);

	try {
		while (true) {
			while (pending.length) yield pending.shift() as string;
			if (finished) break;
			await new Promise<void>(resolve => { wake = resolve; });
		}
		while (pending.length) yield pending.shift() as string;
		if (failure) throw failure;
	} finally {
		clearTimeout(timer);
		killQuietly(child);
	}
}

/** The prompt goes through stdin, not argv: avoids length limits and quoting issues. */
function writeStdin(child: any, input: string): void {
	if (!child.stdin) return;
	child.stdin.on('error', () => { /* the process may close stdin early */ });
	child.stdin.end(input ?? '');
}

function killQuietly(child: any): void {
	try {
		child.kill();
	} catch (error) {
		// The process had already exited.
	}
}

function describeSpawnError(error: any, executable: string): Error {
	if (error?.code === 'ENOENT') {
		return new Error(
			`Could not run "${executable}". Make sure Claude Code is installed and on PATH, ` +
			'or enter the full path in the provider settings field.'
		);
	}
	return error instanceof Error ? error : new Error(String(error));
}
