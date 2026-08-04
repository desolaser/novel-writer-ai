import type { PluginSettings } from './plugin-settings';
import { getProvider } from '../../constants/providers';

/** Resolves the selected saved profile into the provider and request options used by APIs. */
export function getActiveModelConfig(settings: PluginSettings) {
	const model = settings.modelos.find(item => item.id_modelo === settings.modeloPredeterminadoId);
	if (!model) {
		return {
			providerId: settings.proveedor.id, modelName: settings.proveedor.modelo,
			options: {
				max_tokens: settings.aiOptions.maxOutput, temperature: settings.aiOptions.temperature,
				top_p: settings.aiOptions.topP, top_k: settings.aiOptions.topK,
				repetition_penalty: settings.aiOptions.repetitionPenalty,
				repetition_penalty_range: settings.aiOptions.repetitionPenaltyRange,
				frequency_penalty: settings.aiOptions.frequencyPenalty, presence_penalty: settings.aiOptions.presencePenalty,
				stream: settings.aiOptions.streaming,
			},
		};
	}
	const provider = getProvider(model.id_proveedor);
	if (!provider) throw new Error('El proveedor del modelo activo no existe.');
	return {
		providerId: provider.nombre, modelName: model.nombre_modelo,
		options: {
			max_tokens: model.max_output, max_context: model.max_context, temperature: model.temperature,
			top_p: model.top_p, top_k: model.top_k, repetition_penalty: model.repetition_penalty,
			repetition_penalty_range: model.repetition_penalty_range, frequency_penalty: model.frecuence_penalty,
			presence_penalty: model.presence_penalty, stream: model.stream,
		},
	};
}
