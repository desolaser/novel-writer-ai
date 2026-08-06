import type { PluginSettings } from "./plugin-settings";
import { getProvider } from "../../constants/providers";
import type { ModelContext } from "../../domain/entities/Modelo";

/**
 * Resolves the selected saved profile into the provider and request options used by APIs.
 * @param context Determines which max_output to use: 'chat' uses max_output_chat (falls back to max_output), 'generate' uses max_output.
 */
export function getActiveModelConfig(
	settings: PluginSettings,
	context: ModelContext = "generate"
) {
	const model = settings.modelos.find(
		(item) => item.id_modelo === settings.modeloPredeterminadoId
	);
	if (!model) {
		// When no saved model exists, use the legacy AiOptions fallback, respecting context.
		const fallbackMaxTokens =
			context === "chat"
				? settings.aiOptions.maxOutputChat ??
				  settings.aiOptions.maxOutput
				: settings.aiOptions.maxOutput;
		return {
			providerId: settings.proveedor.id,
			modelName: settings.proveedor.modelo,
			options: {
				max_tokens: fallbackMaxTokens,
				temperature: settings.aiOptions.temperature,
				top_p: settings.aiOptions.topP,
				top_k: settings.aiOptions.topK,
				repetition_penalty: settings.aiOptions.repetitionPenalty,
				repetition_penalty_range:
					settings.aiOptions.repetitionPenaltyRange,
				frequency_penalty: settings.aiOptions.frequencyPenalty,
				presence_penalty: settings.aiOptions.presencePenalty,
				stream: settings.aiOptions.streaming,
			},
		};
	}
	const provider = getProvider(model.id_proveedor);
	if (!provider) throw new Error("El proveedor del modelo activo no existe.");
	// For chat context, prefer max_output_chat; fall back to max_output if not set.
	const maxTokens =
		context === "chat"
			? model.max_output_chat ?? model.max_output
			: model.max_output;
	return {
		providerId: provider.nombre,
		modelName: model.nombre_modelo,
		options: {
			max_tokens: maxTokens,
			max_context: model.max_context,
			temperature: model.temperature,
			top_p: model.top_p,
			top_k: model.top_k,
			repetition_penalty: model.repetition_penalty,
			repetition_penalty_range: model.repetition_penalty_range,
			frequency_penalty: model.frecuence_penalty,
			presence_penalty: model.presence_penalty,
			stream: model.stream,
		},
	};
}
