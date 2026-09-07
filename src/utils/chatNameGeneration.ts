import type NovelWriterPlugin from '../../main';
import { ApiFactory } from '../factories/api-factory';
import { getActiveModelConfig } from '../infrastructure/settings/active-model';

const MAX_NAME_LENGTH = 50;

function localHeuristic(text: string): string {
	const clean = text.replace(/\s+/g, ' ').trim();
	if (clean.length <= MAX_NAME_LENGTH) return clean;
	const cut = clean.lastIndexOf(' ', MAX_NAME_LENGTH);
	return (cut > 0 ? clean.slice(0, cut) : clean.slice(0, MAX_NAME_LENGTH)) + '...';
}

async function aiGenerated(text: string, plugin: NovelWriterPlugin): Promise<string> {
	const settings = plugin.settings.data;
	const activeModel = getActiveModelConfig(settings, 'chat');
	if (!activeModel.modelName) return localHeuristic(text);
	const token = settings.apiToken[activeModel.providerId] ?? '';
	const api = new ApiFactory().createApi(activeModel.providerId, token);
	const prompt =
		`Generate a short title (max 6 words) for a chat that starts with the following message. ` +
		`Reply ONLY with the title, no quotes, no extra text.\n\nMessage: "${text.slice(0, 300)}"`;
	const result = await api.generateCompletion(prompt, activeModel.modelName, {
		...activeModel.options,
		max_tokens: 30,
		stream: false,
	});
	const title = (result.text ?? '').replace(/^["']|["']$/g, '').trim();
	return title || localHeuristic(text);
}

export async function generateChatName(
	text: string,
	strategy: 'local' | 'active_model',
	plugin: NovelWriterPlugin,
): Promise<string> {
	if (strategy === 'active_model') {
		try {
			return await aiGenerated(text, plugin);
		} catch {
			return localHeuristic(text);
		}
	}
	return localHeuristic(text);
}
