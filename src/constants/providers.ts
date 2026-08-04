import type { AiProviderId } from '../infrastructure/settings/plugin-settings';

const providers = {
	openrouter: 'openrouter', deepseek: 'deepseek', ooba: 'ooba', ollama: 'ollama',
	opencodezen: 'opencodezen', opencodego: 'opencodego', novelai: 'novelai',
};

type ApiProvider = AiProviderId;
export type ProviderEndpointType = 'openai-compatible' | 'anthropic-compatible';

export interface Provider {
	id_proveedor: number;
	nombre: AiProviderId;
	nombre_display: string;
	tipo_endpoint: ProviderEndpointType;
}

/** Built-in providers. They intentionally remain code-owned rather than user data. */
export const PROVIDERS: Provider[] = [
	{ id_proveedor: 1, nombre: 'openrouter', nombre_display: 'OpenRouter', tipo_endpoint: 'openai-compatible' },
	{ id_proveedor: 2, nombre: 'deepseek', nombre_display: 'DeepSeek', tipo_endpoint: 'openai-compatible' },
	{ id_proveedor: 3, nombre: 'ooba', nombre_display: 'Text Generation WebUI', tipo_endpoint: 'openai-compatible' },
	{ id_proveedor: 4, nombre: 'ollama', nombre_display: 'Ollama', tipo_endpoint: 'openai-compatible' },
	{ id_proveedor: 5, nombre: 'opencodezen', nombre_display: 'OpenCodeZen', tipo_endpoint: 'openai-compatible' },
	{ id_proveedor: 6, nombre: 'opencodego', nombre_display: 'OpenCodeGo', tipo_endpoint: 'openai-compatible' },
	{ id_proveedor: 7, nombre: 'novelai', nombre_display: 'NovelAI', tipo_endpoint: 'openai-compatible' },
];

export const getProvider = (id: number) => PROVIDERS.find(provider => provider.id_proveedor === id);
export const getProviderByName = (name: string) => PROVIDERS.find(provider => provider.nombre === name);

export default providers;
export type { ApiProvider };
