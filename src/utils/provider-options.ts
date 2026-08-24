/**
 * Generic completion options assembled by `getActiveModelConfig` and enriched by call sites
 * (images, modalities, etc). Not every field applies to every provider — the builders below
 * pick only the ones each provider's backend actually accepts. Which fields a provider
 * supports is declared once in `getProviderCapabilities` (constants/providers.ts), which is
 * also what drives which fields `ModelModal` shows for that provider.
 */
export interface CompletionOptions {
	messages?: Array<{ role: string; content: unknown }>;
	images?: string[];
	modalities?: string[];
	max_tokens?: number;
	max_context?: number;
	temperature?: number;
	top_p?: number;
	top_k?: number;
	min_p?: number;
	repetition_penalty?: number;
	repetition_penalty_range?: number;
	frequency_penalty?: number;
	presence_penalty?: number;
	stream?: boolean;
	stop?: string | string[];
	/** Reasoning depth, for providers with an extended-thinking / reasoning-effort control. */
	effort?: EffortLevel;
	/** Whether to enable extended thinking / reasoning, for providers that support toggling it. */
	thinking?: boolean;
	timeout_ms?: number;
	max_budget_usd?: number;
}

export type ChatMessage = { role: string; content: unknown };

export const defaultChatMessages = (prompt: string): ChatMessage[] => [
	{ role: 'system', content: 'You are a helpful assistant.' },
	{ role: 'user', content: prompt },
];

/** Drops undefined-valued keys so spreading the result never sends `"field": undefined`. */
function definedOnly<T extends Record<string, unknown>>(obj: T): Partial<T> {
	const result: Partial<T> = {};
	for (const key in obj) if (obj[key] !== undefined) result[key] = obj[key];
	return result;
}

/**
 * Shared 5-level reasoning-effort scale used across providers that expose one (Anthropic,
 * Claude Code CLI, DeepSeek, OpenRouter, ooba, Ollama). Providers with a narrower scale
 * clamp it via `clampEffort` rather than exposing their own vocabulary in the UI.
 */
export type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
const EFFORT_LEVELS: EffortLevel[] = ['low', 'medium', 'high', 'xhigh', 'max'];

export function normalizeEffort(value: unknown, fallback: EffortLevel = 'low'): EffortLevel {
	return EFFORT_LEVELS.includes(value as EffortLevel) ? (value as EffortLevel) : fallback;
}

/** Maps our 5-level scale onto a provider's narrower one, picking the nearest allowed level. */
export function clampEffort(effort: EffortLevel, allowed: EffortLevel[]): EffortLevel {
	if (allowed.includes(effort)) return effort;
	const index = EFFORT_LEVELS.indexOf(effort);
	for (let distance = 1; distance < EFFORT_LEVELS.length; distance++) {
		const lower = EFFORT_LEVELS[index - distance];
		if (lower && allowed.includes(lower)) return lower;
		const upper = EFFORT_LEVELS[index + distance];
		if (upper && allowed.includes(upper)) return upper;
	}
	return allowed[0];
}

/** Base shape every OpenAI-style chat completion body shares. */
export interface OpenAiCompatibleChatBody {
	model: string;
	messages: ChatMessage[];
	temperature?: number;
	top_p?: number;
	max_tokens?: number;
	stream?: boolean;
	stop?: string | string[];
	frequency_penalty?: number;
	presence_penalty?: number;
}

/** DeepSeek only accepts low/high/max for reasoning_effort — no medium or xhigh. */
const DEEPSEEK_EFFORT_LEVELS: EffortLevel[] = ['low', 'high', 'max'];

export interface DeepSeekChatBody extends OpenAiCompatibleChatBody {
	thinking?: { type: 'enabled' | 'disabled'; reasoning_effort?: EffortLevel };
}

/**
 * DeepSeek's chat completions body. Deliberately excludes frequency_penalty/presence_penalty
 * (DeepSeek's docs mark them "no longer supported") and top_k/min_p/repetition_penalty
 * (never supported) — sending them risks a 400 from DeepSeek's strict validation.
 */
export function toDeepSeekBody(
	prompt: string,
	model: string,
	options: CompletionOptions
): DeepSeekChatBody {
	const body: DeepSeekChatBody = {
		model,
		messages: options.messages ?? defaultChatMessages(prompt),
		stream: options.stream ?? false,
		...definedOnly({
			temperature: options.temperature,
			top_p: options.top_p,
			max_tokens: options.max_tokens,
			stop: options.stop,
		}),
	};
	if (options.thinking === false) {
		body.thinking = { type: 'disabled' };
	} else if (options.effort) {
		body.thinking = { type: 'enabled', reasoning_effort: clampEffort(options.effort, DEEPSEEK_EFFORT_LEVELS) };
	}
	return body;
}

/**
 * OpenCode Zen/Go route a single endpoint to several backend model families (DeepSeek,
 * MiniMax, GLM, Kimi, Claude, Qwen...), so only OpenAI-universal sampling params are safe
 * to forward — anything more specific (top_k, min_p, repetition_penalty, reasoning controls)
 * may not exist on whichever backend answers the request.
 */
export function toOpenCodeChatBody(
	prompt: string,
	model: string,
	options: CompletionOptions
): OpenAiCompatibleChatBody {
	return {
		model,
		messages: options.messages ?? defaultChatMessages(prompt),
		stream: false, // requestUrl (used to avoid CORS) doesn't support streaming
		temperature: options.temperature ?? 0.7,
		max_tokens: options.max_tokens ?? 1000,
		...definedOnly({
			top_p: options.top_p,
			frequency_penalty: options.frequency_penalty,
			presence_penalty: options.presence_penalty,
		}),
	};
}

export interface OpenRouterChatBody extends OpenAiCompatibleChatBody {
	top_k?: number;
	min_p?: number;
	repetition_penalty?: number;
	modalities?: string[];
	reasoning?: { enabled: boolean; effort?: EffortLevel };
}

/**
 * OpenRouter's chat completions body. repetition_penalty_range and a context-length field
 * are not in OpenRouter's documented parameter list, so they're dropped rather than forwarded.
 * OpenRouter's `reasoning.effort` uses the same low/medium/high/xhigh/max vocabulary we do.
 */
export function toOpenRouterBody(
	messages: ChatMessage[],
	model: string,
	options: CompletionOptions
): OpenRouterChatBody {
	const body: OpenRouterChatBody = {
		model,
		messages,
		stream: options.stream ?? false,
		temperature: options.temperature ?? 0.7,
		max_tokens: options.max_tokens ?? 1000,
		...definedOnly({
			top_p: options.top_p,
			top_k: options.top_k,
			min_p: options.min_p,
			repetition_penalty: options.repetition_penalty,
			frequency_penalty: options.frequency_penalty,
			presence_penalty: options.presence_penalty,
			stop: options.stop,
			modalities: options.modalities,
		}),
	};
	if (options.thinking === false) {
		body.reasoning = { enabled: false };
	} else if (options.effort) {
		body.reasoning = { enabled: true, effort: options.effort };
	}
	return body;
}

export interface OobaChatBody extends OpenAiCompatibleChatBody {
	top_k?: number;
	min_p?: number;
	repetition_penalty?: number;
	repetition_penalty_range?: number;
	truncation_length?: number;
	enable_thinking?: boolean;
	reasoning_effort?: EffortLevel;
	logit_bias?: Record<string, number>;
}

/**
 * text-generation-webui's /v1/chat/completions body. Its `GenerationOptions` model accepts
 * the full sampler set (confirmed against modules/api/typing.py), including
 * repetition_penalty_range, a context-truncation field — named `truncation_length`, not
 * `max_context`, so it's renamed rather than passed through — and `enable_thinking` /
 * `reasoning_effort` for reasoning-capable models.
 */
export function toOobaBody(
	model: string,
	messages: ChatMessage[],
	options: CompletionOptions
): OobaChatBody {
	return {
		model,
		messages,
		stream: options.stream ?? false,
		temperature: options.temperature ?? 0.8,
		max_tokens: options.max_tokens ?? 1000,
		enable_thinking: options.thinking !== false,
		logit_bias: { '27': -100, '33340': -100 },
		...definedOnly({
			top_p: options.top_p,
			top_k: options.top_k,
			min_p: options.min_p,
			repetition_penalty: options.repetition_penalty,
			repetition_penalty_range: options.repetition_penalty_range,
			frequency_penalty: options.frequency_penalty,
			presence_penalty: options.presence_penalty,
			truncation_length: options.max_context,
			stop: options.stop,
			reasoning_effort: options.thinking === false ? undefined : options.effort,
		}),
	};
}

/** The `options` sub-object of Ollama's /api/chat body. */
export interface OllamaGenerationOptions {
	mirostat: number;
	mirostat_eta: number;
	mirostat_tau: number;
	num_ctx?: number;
	repeat_last_n: number;
	repeat_penalty: number;
	temperature: number;
	num_predict: number;
	top_k: number;
	top_p: number;
	min_p: number;
	frequency_penalty?: number;
	presence_penalty?: number;
}

/** Ollama's /api/chat `options` accept the full sampler set, including frequency/presence penalty. */
export function toOllamaOptions(options: CompletionOptions): OllamaGenerationOptions {
	return {
		mirostat: 0,
		mirostat_eta: 0.1,
		mirostat_tau: 5.0,
		num_ctx: options.max_context,
		repeat_last_n: options.repetition_penalty_range ?? 64,
		repeat_penalty: options.repetition_penalty ?? 1.1,
		temperature: options.temperature ?? 0.7,
		num_predict: options.max_tokens ?? 512,
		top_k: options.top_k ?? 40,
		top_p: options.top_p ?? 0.9,
		min_p: options.min_p ?? 0,
		...definedOnly({
			frequency_penalty: options.frequency_penalty,
			presence_penalty: options.presence_penalty,
		}),
	};
}

/** Ollama's `think` level accepts low/medium/high/max — no xhigh. */
const OLLAMA_EFFORT_LEVELS: EffortLevel[] = ['low', 'medium', 'high', 'max'];

/**
 * Ollama's reasoning toggle (`think`) is a top-level request field, not part of the
 * `options` sampler sub-object — accepts a boolean or a "low"/"medium"/"high"/"max" level.
 * Returns `undefined` when the caller expressed no preference, so the field is omitted
 * entirely and the model's own default applies.
 */
export function toOllamaThink(options: CompletionOptions): boolean | EffortLevel | undefined {
	if (options.thinking === false) return false;
	if (options.effort) return clampEffort(options.effort, OLLAMA_EFFORT_LEVELS);
	if (options.thinking === true) return true;
	return undefined;
}
