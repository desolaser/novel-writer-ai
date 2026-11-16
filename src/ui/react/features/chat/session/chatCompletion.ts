import type NovelWriterPlugin from '../../../../../../main';
import { ApiFactory } from '../../../../../factories/api-factory';
import { getActiveModelConfig } from '../../../../../infrastructure/settings/active-model';
import type { ModelAnswer } from './agentLoop';

const imageUrls = (result: { images?: string[] }): string[] =>
	result.images?.filter((url) => typeof url === 'string' && url.trim()) ?? [];

/**
 * Binds the chat model chosen in Settings to a plain "prompt in, answer out"
 * function for one turn. Throws right away when no chat model is configured.
 */
export function createChatCompletion(
	plugin: NovelWriterPlugin,
): (prompt: string, images: string[]) => Promise<ModelAnswer> {
	const settings = plugin.settings.data;
	const active = getActiveModelConfig(settings, 'chat');
	if (!active.modelName) throw new Error('Configure an active model in Settings.');
	const token = settings.apiToken[active.providerId] ?? '';
	const api = new ApiFactory().createApi(active.providerId, token);
	const generatesImages = active.providerId === 'openrouter'
		&& active.profile?.supports_image_generation;
	return async (prompt, images) => {
		const result = await api.generateCompletion(prompt, active.modelName, {
			...active.options,
			stream: false,
			...(generatesImages ? { modalities: ['image', 'text'] } : {}),
			...(images.length ? { images } : {}),
		});
		return { text: result.text ?? '', images: imageUrls(result) };
	};
}

/** Output limit of the chat model, which the tool instructions mention. */
export function chatOutputLimit(plugin: NovelWriterPlugin): number | undefined {
	return getActiveModelConfig(plugin.settings.data, 'chat').options.max_tokens;
}
