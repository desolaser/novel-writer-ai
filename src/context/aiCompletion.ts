import type NovelWriterPlugin from "../../main";
import { ApiFactory } from "../factories/api-factory";
import { getActiveModelConfig } from "../infrastructure/settings/active-model";

/**
 * One non-streamed utility completion with a task-specific output budget.
 * Blueprint generation, act summaries, and codex AI proposals use this helper.
 */
export async function runModelCompletion(
	plugin: NovelWriterPlugin,
	prompt: string,
	maxTokens: number,
): Promise<string> {
	return createUtilityCompletion(plugin).complete(prompt, maxTokens);
}

/** Capture one profile and API so a running batch keeps its original budget. */
export function createUtilityCompletion(plugin: NovelWriterPlugin) {
	const settings = plugin.settings.data;
	const activeModel = getActiveModelConfig(settings, "utilities");
	if (!activeModel.modelName) {
		throw new Error("Configure a utilities model in Settings.");
	}
	const api = new ApiFactory().createApi(
		activeModel.providerId,
		settings.apiToken[activeModel.providerId] ?? ""
	);
	return {
		outputBudget: activeModel.options.max_tokens,
		async complete(prompt: string, maxTokens: number): Promise<string> {
			const result = await api.generateCompletion(
				prompt, activeModel.modelName, {
					...activeModel.options,
					max_tokens: maxTokens,
					stream: false,
				}
			);
			const text = (result.text ?? "").trim();
			if (!text) throw new Error("The model returned an empty answer.");
			return text;
		},
	};
}
