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
 * Providers whose endpoint ignores (or rejects) temperature / top_p / top_k and the
 * penalties. The Anthropic API returns 400 if they're sent.
 */
export const providerIgnoresSamplingParams = (name: AiProviderId) =>
	name === 'anthropic' || name === 'claudecode';

export default providers;
export type { ApiProvider };
