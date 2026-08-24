import type { AiProviderId } from '../infrastructure/settings/plugin-settings';

const providers = {
	openrouter: 'openrouter', deepseek: 'deepseek', ooba: 'ooba', ollama: 'ollama',
	opencodezen: 'opencodezen', opencodego: 'opencodego', novelai: 'novelai',
	anthropic: 'anthropic', claudecode: 'claudecode',
};

type ApiProvider = AiProviderId;
export type ProviderEndpointType = 'openai-compatible' | 'anthropic-compatible';

export interface Provider {
	id_proveedor: number;
	nombre: AiProviderId;
	nombre_display: string;
	tipo_endpoint: ProviderEndpointType;
}

/**
 * Built-in providers. They intentionally remain code-owned rather than user data.
 *
 * IMPORTANT: `id_proveedor` is persisted inside every `Modelo` a user saves, so these
 * numbers are permanent. Append new ones at the end; never reorder or reuse a freed id.
 */
export const PROVIDERS: Provider[] = [
	{ id_proveedor: 1, nombre: 'openrouter', nombre_display: 'OpenRouter', tipo_endpoint: 'openai-compatible' },
	{ id_proveedor: 2, nombre: 'deepseek', nombre_display: 'DeepSeek', tipo_endpoint: 'openai-compatible' },
	{ id_proveedor: 3, nombre: 'ooba', nombre_display: 'Text Generation WebUI', tipo_endpoint: 'openai-compatible' },
	{ id_proveedor: 4, nombre: 'ollama', nombre_display: 'Ollama', tipo_endpoint: 'openai-compatible' },
	{ id_proveedor: 5, nombre: 'opencodezen', nombre_display: 'OpenCodeZen', tipo_endpoint: 'openai-compatible' },
	{ id_proveedor: 6, nombre: 'opencodego', nombre_display: 'OpenCodeGo', tipo_endpoint: 'openai-compatible' },
	{ id_proveedor: 7, nombre: 'novelai', nombre_display: 'NovelAI', tipo_endpoint: 'openai-compatible' },
	{ id_proveedor: 8, nombre: 'anthropic', nombre_display: 'Anthropic API', tipo_endpoint: 'anthropic-compatible' },
	{ id_proveedor: 9, nombre: 'claudecode', nombre_display: 'Claude Code (CLI)', tipo_endpoint: 'anthropic-compatible' },
];

export const getProvider = (id: number) => PROVIDERS.find(provider => provider.id_proveedor === id);
export const getProviderByName = (name: string) => PROVIDERS.find(provider => provider.nombre === name);

/**
 * Providers that don't need an API Key: Ollama runs locally and Claude Code uses the
 * CLI's local OAuth session (there, the field doubles as an optional executable path).
 */
export const providerRequiresApiKey = (name: AiProviderId) =>
	name !== 'ollama' && name !== 'claudecode';

/** Providers that only work on desktop (they spawn a local subprocess). */
export const providerIsDesktopOnly = (name: AiProviderId) => name === 'claudecode';

/**
 * Which generation parameters a provider's endpoint actually reads. Drives two things:
 * which fields `ModelModal` shows for a given provider, and which fields each `*-api.ts`
 * forwards in its request body (see `src/utils/provider-options.ts`). Keeping both in sync
 * with this table is what prevents sending a field a provider's API doesn't understand
 * (silently ignored by lenient backends, a 400 on strict ones like Anthropic/DeepSeek).
 *
 * Sourced from each provider's docs (checked 2026-08):
 * - OpenRouter: temperature, top_p, top_k, min_p, repetition_penalty, frequency_penalty,
 *   presence_penalty, and a `reasoning` (effort/enabled) object are documented;
 *   repetition_penalty_range and a context-length field are not.
 * - DeepSeek: only temperature and top_p remain among sampling params; frequency_penalty/
 *   presence_penalty are marked "no longer supported" and top_k/min_p/repetition_penalty
 *   were never supported. It does support a `thinking` (enabled/disabled + reasoning_effort)
 *   object, with a narrower low/high/max effort scale.
 * - text-generation-webui (ooba): its GenerationOptions model accepts the full sampler set,
 *   including repetition_penalty_range, a context-truncation field (truncation_length), and
 *   enable_thinking / reasoning_effort.
 * - Ollama: the `options` object of /api/chat accepts the full sampler set including
 *   frequency/presence penalty and num_ctx (context length); a top-level `think` field
 *   (boolean or low/medium/high/max) toggles reasoning.
 * - OpenCode Zen/Go route to multiple backend model families behind one endpoint, so only
 *   the OpenAI-universal params (temperature, top_p, frequency/presence penalty) are safe —
 *   reasoning controls are skipped for the same reason.
 * - NovelAI: only temperature/top_p map onto real fields; frequency/presence penalty are
 *   repurposed as stand-ins for NovelAI's own repetition-penalty knobs (see novelai-api.ts).
 *   No reasoning models, so no effort/thinking.
 * - Anthropic API: current models removed sampling params entirely, but expose an adaptive
 *   thinking toggle and an `output_config.effort` level.
 * - Claude Code CLI: exposes `--effort`; no separate thinking toggle in the CLI.
 */
export interface ProviderCapabilities {
	/** Server-side context/truncation length the provider actually reads. */
	maxContext: boolean;
	temperature: boolean;
	topP: boolean;
	topK: boolean;
	minP: boolean;
	repetitionPenalty: boolean;
	repetitionPenaltyRange: boolean;
	frequencyPenalty: boolean;
	presencePenalty: boolean;
	/** Reasoning-effort level (low/medium/high/xhigh/max). */
	effort: boolean;
	/** Toggle to enable/disable extended thinking / reasoning. */
	thinking: boolean;
}

const NO_CAPABILITIES: ProviderCapabilities = {
	maxContext: false,
	temperature: false,
	topP: false,
	topK: false,
	minP: false,
	repetitionPenalty: false,
	repetitionPenaltyRange: false,
	frequencyPenalty: false,
	presencePenalty: false,
	effort: false,
	thinking: false,
};

const PROVIDER_CAPABILITIES: Record<AiProviderId, ProviderCapabilities> = {
	openrouter: {
		...NO_CAPABILITIES,
		temperature: true,
		topP: true,
		topK: true,
		minP: true,
		repetitionPenalty: true,
		frequencyPenalty: true,
		presencePenalty: true,
		effort: true,
		thinking: true,
	},
	deepseek: {
		...NO_CAPABILITIES,
		temperature: true,
		topP: true,
		effort: true,
		thinking: true,
	},
	ooba: {
		...NO_CAPABILITIES,
		maxContext: true,
		temperature: true,
		topP: true,
		topK: true,
		minP: true,
		repetitionPenalty: true,
		repetitionPenaltyRange: true,
		frequencyPenalty: true,
		presencePenalty: true,
		effort: true,
		thinking: true,
	},
	ollama: {
		...NO_CAPABILITIES,
		maxContext: true,
		temperature: true,
		topP: true,
		topK: true,
		minP: true,
		repetitionPenalty: true,
		repetitionPenaltyRange: true,
		frequencyPenalty: true,
		presencePenalty: true,
		effort: true,
		thinking: true,
	},
	opencodezen: {
		...NO_CAPABILITIES,
		temperature: true,
		topP: true,
		frequencyPenalty: true,
		presencePenalty: true,
	},
	opencodego: {
		...NO_CAPABILITIES,
		temperature: true,
		topP: true,
		frequencyPenalty: true,
		presencePenalty: true,
	},
	novelai: {
		...NO_CAPABILITIES,
		temperature: true,
		topP: true,
		frequencyPenalty: true,
		presencePenalty: true,
	},
	anthropic: { ...NO_CAPABILITIES, effort: true, thinking: true },
	claudecode: { ...NO_CAPABILITIES, effort: true },
};

export const getProviderCapabilities = (name: AiProviderId): ProviderCapabilities =>
	PROVIDER_CAPABILITIES[name] ?? NO_CAPABILITIES;

/** The pure sampling knobs — excludes reasoning controls (effort/thinking), which have their own UI gating. */
const SAMPLING_KEYS: (keyof ProviderCapabilities)[] = [
	'temperature', 'topP', 'topK', 'minP',
	'repetitionPenalty', 'repetitionPenaltyRange', 'frequencyPenalty', 'presencePenalty',
];

/** True when a provider exposes none of the sampling parameters above (only Max Output/Stream apply). */
export const providerIgnoresSamplingParams = (name: AiProviderId): boolean => {
	const capabilities = getProviderCapabilities(name);
	return !SAMPLING_KEYS.some(key => capabilities[key]);
};

export default providers;
export type { ApiProvider };
