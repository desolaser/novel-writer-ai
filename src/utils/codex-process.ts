import type { CodexProcessResult, CodexRpcMessage } from '../types/CodexAppServer';

let resolvedExecutable: string | null = null;

export function assertCodexDesktop(): void {
	if (typeof process === 'undefined' || !process?.versions?.node) {
		throw new Error('The ChatGPT (Codex CLI) provider only works on Obsidian desktop.');
	}
}

export async function resolveCodexExecutable(configuredPath: string, timeoutMs: number): Promise<string> {
	assertCodexDesktop();
	if (configuredPath.trim()) return configuredPath.trim();
	if (resolvedExecutable) return resolvedExecutable;
	const isWindows = process.platform === 'win32';
	let candidates: string[] = [];
	try {
		const found = await runCodexProcess(isWindows ? 'where' : 'which', ['codex'], timeoutMs);
		if (found.code === 0) candidates = found.stdout.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
	} catch (_error) { /* Fall back to the executable name. */ }
	candidates.sort((a, b) => Number(b.toLowerCase().endsWith('.exe')) - Number(a.toLowerCase().endsWith('.exe')));
	if (!candidates.length) candidates = isWindows ? ['codex.exe', 'codex'] : ['codex'];
	for (const candidate of candidates) {
		try {
			const result = await runCodexProcess(candidate, ['--version'], timeoutMs);
			if (result.code === 0) return (resolvedExecutable = candidate);
		} catch (_error) { /* Try the next installation. */ }
	}
	throw new Error('Codex CLI was not found. Install it, run `codex login`, and ensure `codex` is on PATH, or enter the full Codex CLI path.');
}

export function spawnCodex(executable: string, args: string[], cwd?: string): any {
	const { spawn } = require('child_process');
	const lower = executable.toLowerCase();
	const wrapped = process.platform === 'win32' && (lower.endsWith('.cmd') || lower.endsWith('.bat'));
	return spawn(wrapped ? 'cmd.exe' : executable, wrapped ? ['/d', '/s', '/c', executable].concat(args) : args, {
		shell: false,
		windowsHide: true,
		cwd,
		env: process.env,
	});
}

export function runCodexProcess(executable: string, args: string[], timeoutMs: number): Promise<CodexProcessResult> {
	return new Promise((resolve, reject) => {
		let child: any;
		try { 
			child = spawnCodex(executable, args); 
		} catch (error) { 
			reject(error); 
			return; 
		}

		let stdout = ''; let stderr = ''; let settled = false;
		const timer = setTimeout(() => {
			if (settled) return;
			settled = true; killCodex(child);
			reject(new Error(`Codex CLI did not respond within ${Math.round(timeoutMs / 1000)}s and was cancelled.`));
		}, timeoutMs);

		child.stdout?.setEncoding('utf8'); 
		child.stderr?.setEncoding('utf8');
		child.stdout?.on('data', (chunk: string) => { stdout += chunk; });
		child.stderr?.on('data', (chunk: string) => { stderr += chunk; });
		child.on('error', (error: any) => { if (!settled) { settled = true; clearTimeout(timer); reject(describeCodexSpawnError(error, executable)); } });
		child.on('close', (code: number) => { if (!settled) { settled = true; clearTimeout(timer); resolve({ code: code ?? -1, stdout, stderr }); } });
	});
}

export class CodexRpcClient {
	private readonly child: any;
	private readonly pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
	private readonly listeners = new Set<(message: CodexRpcMessage) => void>();
	private buffer = '';
	private stderr = '';
	private nextId = 1;
	private closed = false;
	private readonly processClosed: Promise<void>;
	private resolveProcessClosed!: () => void;

	constructor(executable: string, cwd: string) {
		this.processClosed = new Promise(resolve => { this.resolveProcessClosed = resolve; });
		this.child = spawnCodex(executable, ['app-server', '--stdio'], cwd);
		this.child.stdout?.setEncoding('utf8'); 
		this.child.stderr?.setEncoding('utf8');
		this.child.stdout?.on('data', (chunk: string) => this.consume(chunk));
		this.child.stderr?.on('data', (chunk: string) => { this.stderr += chunk; });
		this.child.on('error', (error: any) => this.failAll(describeCodexSpawnError(error, executable)));
		this.child.on('close', (code: number) => {
			this.resolveProcessClosed();
			this.failAll(new Error(`Codex app-server exited with code ${code}. ${this.stderr.trim() || 'No detail on stderr.'}`));
		});
	}

	request(method: string, params: any, timeoutMs: number): Promise<any> {
		if (this.closed) return Promise.reject(new Error('Codex app-server is closed.'));
		const id = this.nextId++;
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => { 
				this.pending.delete(id);
				reject(new Error(`Codex app-server timed out during ${method}.`)); 
			}, timeoutMs);
			this.pending.set(id, {
				resolve: value => { 
					clearTimeout(timer); 
					resolve(value); 
				},
				reject: error => { 
					clearTimeout(timer); 
					reject(error); 
				},
			});
			this.write({ method, id, params });
		});
	}

	notify(method: string, params?: any): void { this.write({ method, params }); }
	onMessage(listener: (message: CodexRpcMessage) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
	respond(id: number | string, result: any): void { this.write({ id, result }); }
	async close(): Promise<void> {
		if (!this.closed) {
			this.closed = true;
			for (const waiter of this.pending.values()) waiter.reject(new Error('Codex app-server was closed.'));
			this.pending.clear();
			killCodex(this.child);
		}
		await Promise.race([this.processClosed, new Promise<void>(resolve => setTimeout(resolve, 2000))]);
	}

	private write(message: CodexRpcMessage): void {
		this.child.stdin?.write(`${JSON.stringify(message)}\n`);
	}

	private consume(chunk: string): void {
		this.buffer += chunk;
		const lines = this.buffer.split(/\r?\n/); this.buffer = lines.pop() ?? '';
		for (const line of lines) {
			if (!line.trim()) continue;
			let message: CodexRpcMessage;
			try { message = JSON.parse(line); } catch (_error) { continue; }
			if (message.id !== undefined && !message.method) {
				const id = Number(message.id); const waiter = this.pending.get(id);
				if (waiter) {
					this.pending.delete(id);
					message.error ? waiter.reject(new Error(message.error.message || `Codex RPC error ${message.error.code}.`)) : waiter.resolve(message.result);
				}
			} else for (const listener of this.listeners) listener(message);
		}
	}

	private failAll(error: Error): void {
		if (this.closed) return;
		this.closed = true;
		for (const waiter of this.pending.values()) waiter.reject(error);
		this.pending.clear();
	}
}

export function killCodex(child: any): void { 
	try { 
		child?.kill(); 
	} catch (_error) { /* Already closed. */ } 
}

function describeCodexSpawnError(error: any, executable: string): Error {
	if (error?.code === 'ENOENT') return new Error(`Could not run "${executable}". Install Codex CLI or enter its full path.`);
	return error instanceof Error ? error : new Error(String(error));
}
