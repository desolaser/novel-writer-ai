import type NovelWriterPlugin from "../../../../../main";
import { ApiFactory } from "../../../../factories/api-factory";
import { getActiveModelConfig } from "../../../../infrastructure/settings/active-model";

/**
 * Output tokens the active model is configured for. Asking for more than this
 * either errors or comes back truncated, so batch sizes are derived from it
 * instead of from a fixed guess.
 */
export function activeOutputBudget(plugin: NovelWriterPlugin): number {
	try {
		const tokens = getActiveModelConfig(plugin.settings.data, "generate").options.max_tokens;
		return typeof tokens === "number" && tokens > 0 ? tokens : 0;
	} catch {
		return 0;
	}
}

/**
 * One non-streamed completion with the active model, shared by the two blueprint
 * engines. Both need the same call and nothing else of each other.
 */
export async function runBlueprintCompletion(
	plugin: NovelWriterPlugin,
	prompt: string,
	maxTokens: number,
): Promise<string> {
	const settings = plugin.settings.data;
	const activeModel = getActiveModelConfig(settings, "generate");
	if (!activeModel.modelName) throw new Error("Configure an active model in Settings.");
	const api = new ApiFactory().createApi(
		activeModel.providerId,
		settings.apiToken[activeModel.providerId] ?? ""
	);
	const result = await api.generateCompletion(prompt, activeModel.modelName, {
		...activeModel.options,
		max_tokens: maxTokens,
		stream: false,
	});
	const text = (result.text ?? "").trim();
	if (!text) throw new Error("The model returned an empty answer.");
	return text;
}
