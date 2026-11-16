import type { PluginSettings } from "./plugin-settings";
import { getProvider } from "../../constants/providers";
import type { ModelPurpose } from "../../types/ModelPurpose";
import type { Modelo } from "../../domain/entities/Modelo";

/** Missing assignments inherit; invalid references must not spend on another model. */
export function getActiveModelProfile(
	settings: PluginSettings,
	purpose: ModelPurpose
) {
	const id = settings.modelAssignments?.[purpose]
		|| settings.modeloPredeterminadoId;
	const model = settings.modelos.find((item) => item.id_modelo === id);
	if (id && !model) {
		throw new Error(`The ${purpose} model no longer exists. Check Settings.`);
	}
	return model;
}

/**
 * Resolves the selected saved profile into the provider and request options used by APIs.
 * Chat keeps its existing output budget. Task-specific overrides are applied
 * by callers after resolving the complete profile.
 */
export function getActiveModelConfig(
	settings: PluginSettings,
	purpose: ModelPurpose
) {
	const model = getActiveModelProfile(settings, purpose);

	if (!model) {
		// When no saved model exists, use the legacy AiOptions fallback, respecting context.
		const fallbackMaxTokens =
			purpose === "chat"
				? settings.aiOptions.maxOutputChat ??
				  settings.aiOptions.maxOutput
				: settings.aiOptions.maxOutput;
		return {
			profile: model,
			providerId: settings.proveedor.id,
			modelName: settings.proveedor.modelo,
			options: {
				max_context: settings.aiOptions.maxContext,
				max_tokens: fallbackMaxTokens,
				temperature: settings.aiOptions.temperature,
				top_p: settings.aiOptions.topP,
				top_k: settings.aiOptions.topK,
				min_p: settings.aiOptions.minP,
				repetition_penalty: settings.aiOptions.repetitionPenalty,
				repetition_penalty_range:
					settings.aiOptions.repetitionPenaltyRange,
				frequency_penalty: settings.aiOptions.frequencyPenalty,
				presence_penalty: settings.aiOptions.presencePenalty,
				stream: settings.aiOptions.streaming,
				effort: settings.aiOptions.effort,
				thinking: settings.aiOptions.thinking,
			},
		};
	}

	// For chat context, prefer max_output_chat; fall back to max_output if not set.
	const maxTokens =
		purpose === "chat"
			? model.max_output_chat ?? model.max_output
			: model.max_output;
	return configForProfile(model, maxTokens);
}

/** Provider, model name and request options of a saved profile. */
function configForProfile(model: Modelo, maxTokens: number | undefined) {
	const provider = getProvider(model.id_proveedor);
	if (!provider) throw new Error("The provider of the active model does not exist.");
	return {
		profile: model,
		providerId: provider.nombre,
		modelName: model.nombre_modelo,
		options: {
			max_tokens: maxTokens,
			max_context: model.max_context,
			temperature: model.temperature,
			top_p: model.top_p,
			top_k: model.top_k,
			min_p: model.min_p,
			repetition_penalty: model.repetition_penalty,
			repetition_penalty_range: model.repetition_penalty_range,
			frequency_penalty: model.frecuence_penalty,
			presence_penalty: model.presence_penalty,
			stream: model.stream,
			effort: model.effort,
			thinking: model.thinking,
		},
	};
}

/** Only OpenRouter returns generated images through `modalities` today. */
export const IMAGE_PROVIDER = "openrouter";

/**
 * The profile that generates images (codex portraits), or null when the author
 * chose none. Unlike the text purposes it never falls back to the default
 * model, which usually cannot generate images.
 */
export function getImageModelConfig(settings: PluginSettings) {
	const id = settings.imageModelId;
	if (!id) return null;
	const model = settings.modelos.find((item) => item.id_modelo === id);
	if (!model) throw new Error("The images model no longer exists. Check Settings.");
	const config = configForProfile(model, model.max_output);
	if (config.providerId !== IMAGE_PROVIDER || !model.supports_image_generation) {
		throw new Error(`"${model.nombre_listado}" cannot generate images. Pick an OpenRouter model marked 🖌 in Settings.`);
	}
	return config;
}
