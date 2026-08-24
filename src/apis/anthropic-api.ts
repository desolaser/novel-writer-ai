import Anthropic from '@anthropic-ai/sdk';
import { ApiInterface } from '../interfaces/api-interface';
import { mapAnthropicUsage } from '../utils/anthropic-usage';
import type { Model } from '../types/Model';
import type { CompletionResponse } from '../types/CompletionResponse';
import { normalizeEffort, type CompletionOptions } from '../utils/provider-options';

interface ModelCapabilities {
	adaptiveThinking: boolean;
	effort: boolean;
	imageInput: boolean;
}

/** Image media types accepted by the Anthropic API. */
const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

/**
 * Module-level per-model capability cache: `ApiFactory` builds a new instance per
 * request, so caching on `this` wouldn't do anything. Filled from `getAvailableModels()`
 * and, if missing, with a one-off `models.retrieve()`.
 */
const capabilityCache = new Map<string, ModelCapabilities>();

/** Conservative default: if we know nothing about the model, don't send params that could 400. */
const UNKNOWN_CAPABILITIES: ModelCapabilities = {
	adaptiveThinking: false,
	effort: false,
	imageInput: false,
};

export class AnthropicApi extends ApiInterface {
	apiKey = '';
	private client: Anthropic;

	constructor(apiKey: string) {
		super(apiKey);
		this.apiKey = apiKey;
		// Obsidian's renderer is a browser: this enables the
		// `anthropic-dangerous-direct-browser-access` header that allows direct access.
		this.client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
	}

	async getAvailableModels(): Promise<Model[]> {
		try {
			const models: Model[] = [];
			const page = await this.client.models.list({ limit: 100 });
			for await (const info of page) {
				capabilityCache.set(info.id, readCapabilities(info.capabilities));
				models.push({
					id: info.id,
					name: info.display_name || info.id,
					description: '',
					contextLength: info.max_input_tokens ?? null,
					pricing: '',
					supportsVision: info.capabilities?.image_input?.supported ?? false,
					supportsImageGeneration: false,
				});
			}
			return models;
		} catch (error) {
			console.error('Error in AnthropicApi.getAvailableModels:', error);
			throw error;
		}
	}

	async validateApiKey(): Promise<boolean> {
		try {
			await this.client.models.list({ limit: 1 });
			return true;
		} catch (error) {
			console.error('Error validating Anthropic API key:', error);
			return false;
		}
	}

	async generateCompletion(
		prompt: string,
		model: string,
		options: CompletionOptions = {}
	): Promise<CompletionResponse> {
		const capabilities = await this.resolveCapabilities(model);

		// `options` carries temperature / top_p / top_k / penalties because ModelModal
		// exposes them for every provider. The Anthropic API REMOVED them on current
		// models and returns 400 if they arrive, so the body is built from scratch
		// instead of spreading `options`.
		const body: Record<string, any> = {
			model,
			max_tokens: positiveInt(options.max_tokens, 4096),
			messages: [{ role: 'user', content: buildContent(prompt, options.images) }],
		};
		if (capabilities.adaptiveThinking && options.thinking !== false) body.thinking = { type: 'adaptive' };
		if (capabilities.effort) body.output_config = { effort: normalizeEffort(options.effort) };

		try {
			if (options.stream) {
				const stream = this.client.messages.stream(body as any);
				return { stream: toTextChunks(stream), model };
			}

			const message = await this.client.messages.create(body as any);
			if (message.stop_reason === 'refusal') {
				const details: any = (message as any).stop_details;
				throw new Error(
					`Anthropic refused the request${details?.category ? ` (${details.category})` : ''}. ` +
					'Rephrase the prompt or try a different model.'
				);
			}
			const text = message.content
				.filter((block: any) => block.type === 'text')
				.map((block: any) => block.text)
				.join('');
			return { text, usage: mapAnthropicUsage(message.usage as any), model };
		} catch (error) {
			console.error('Error in AnthropicApi.generateCompletion:', describeError(error));
			throw error instanceof Error ? error : new Error(String(error));
		}
	}

	/** Returns the model's capabilities, looking them up once per session. */
	private async resolveCapabilities(model: string): Promise<ModelCapabilities> {
		const cached = capabilityCache.get(model);
		if (cached) return cached;
		try {
			const info = await this.client.models.retrieve(model);
			const capabilities = readCapabilities(info.capabilities);
			capabilityCache.set(model, capabilities);
			return capabilities;
		} catch (error) {
			// An unknown model shouldn't block generation: it just runs without thinking/effort.
			console.warn(`Could not read capabilities for "${model}":`, describeError(error));
			return UNKNOWN_CAPABILITIES;
		}
	}
}

function readCapabilities(capabilities: any): ModelCapabilities {
	return {
		adaptiveThinking: capabilities?.thinking?.types?.adaptive?.supported ?? false,
		effort: capabilities?.effort?.supported ?? false,
		imageInput: capabilities?.image_input?.supported ?? false,
	};
}

function positiveInt(value: unknown, fallback: number): number {
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

/** Images go BEFORE the text: that's the order Anthropic's docs recommend. */
function buildContent(prompt: string, images: unknown): any[] {
	const blocks: any[] = [];
	if (Array.isArray(images)) {
		for (const image of images) {
			const parsed = parseDataUrl(image);
			if (parsed) blocks.push({ type: 'image', source: { type: 'base64', ...parsed } });
		}
	}
	blocks.push({ type: 'text', text: prompt });
	return blocks;
}

/** The chat uploads images as data URLs (`FileReader.readAsDataURL`). */
function parseDataUrl(value: unknown): { media_type: string; data: string } | null {
	if (typeof value !== 'string') return null;
	const match = /^data:([^;,]+);base64,(.+)$/.exec(value.trim());
	if (!match) return null;
	const mediaType = match[1].toLowerCase();
	if (!SUPPORTED_IMAGE_TYPES.includes(mediaType)) {
		console.warn(`Anthropic does not accept ${mediaType} images; skipping.`);
		return null;
	}
	return { media_type: mediaType, data: match[2] };
}

/**
 * Adapts the SDK stream to the shape the plugin consumes (`main.ts` -> `chunkText`),
 * passing through text only: deltas from `thinking` blocks are discarded.
 */
async function* toTextChunks(stream: AsyncIterable<any>): AsyncGenerator<{ text: string }> {
	for await (const event of stream) {
		if (event?.type !== 'content_block_delta') continue;
		if (event.delta?.type !== 'text_delta') continue;
		if (event.delta.text) yield { text: event.delta.text };
	}
}

function describeError(error: unknown): string {
	if (error instanceof Anthropic.AuthenticationError) return 'Invalid API key or insufficient permissions.';
	if (error instanceof Anthropic.RateLimitError) return 'Rate limit reached.';
	if (error instanceof Anthropic.APIError) return `Error ${error.status}: ${error.message}`;
	return error instanceof Error ? error.message : String(error);
}
