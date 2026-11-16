import type NovelWriterPlugin from '../../../../../../main';
import type { PortraitToolContext } from '../../../../../interfaces/tool-context';
import { ApiFactory } from '../../../../../factories/api-factory';
import { getImageModelConfig } from '../../../../../infrastructure/settings/active-model';
import { squareThumbnail } from '../../../../../utils/image';
import { useNovelWriter } from '../../../store/novelWriterStore';

/**
 * Square crop of the image. A remote URL from another origin cannot be read
 * back from a canvas (CORS), so then the image is kept as it came.
 */
async function toThumbnail(image: string): Promise<string> {
	try {
		return await squareThumbnail(image);
	} catch (error) {
		console.warn('Novel Writer: could not crop the portrait, keeping it whole', error);
		return image;
	}
}

/**
 * Adapter for generate_portrait: asks the images model from Settings for a
 * picture and sets it, cropped to a square, as the entry's thumbnail. The chat
 * model only coordinates; it never draws.
 */
export function createPortraitToolContext(plugin: NovelWriterPlugin): PortraitToolContext {
	return {
		generatePortrait: async (entryId, prompt) => {
			const active = getImageModelConfig(plugin.settings.data);
			if (!active) throw new Error('No images model is set in Settings.');
			const state = useNovelWriter.getState();
			const entry = state.entradas.find((item) => item.id_entrada_codex === entryId);
			if (!entry) throw new Error('That codex entry no longer exists.');

			const token = plugin.settings.data.apiToken[active.providerId] ?? '';
			const api = new ApiFactory().createApi(active.providerId, token);
			const result = await api.generateCompletion(prompt, active.modelName, {
				...active.options,
				stream: false,
				modalities: ['image', 'text'],
			});
			const image = result.images?.find((url) => typeof url === 'string' && url.trim());
			if (!image) {
				const said = result.text?.trim() ? ` It answered: ${result.text.trim().slice(0, 200)}` : '';
				throw new Error(`The images model returned no image.${said}`);
			}
			await state.setEntryThumbnail(entryId, await toThumbnail(image));
			return { replaced: Boolean(entry.thumbnail) };
		},
	};
}
