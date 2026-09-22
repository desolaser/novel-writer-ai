import type { EffortLevel } from '../../utils/provider-options';

/** A saved, reusable AI model configuration. */
export interface Modelo {
	id_modelo: string;
	nombre_modelo: string;
	nombre_listado: string;
	id_proveedor: number;
	max_context: number;
	/** Max tokens for text generation / inline continuation. */
	max_output: number;
	/** Max tokens for chat conversations. Falls back to max_output if not set. */
	max_output_chat?: number;
	stream: boolean;
	temperature: number;
	top_p?: number;
	top_k?: number;
	min_p?: number;
	repetition_penalty?: number;
	repetition_penalty_range?: number;
	frecuence_penalty?: number;
	presence_penalty?: number;
	/** Reasoning-effort level, for providers with an extended-thinking / reasoning-effort control. */
	effort?: EffortLevel;
	/** Provider-advertised effort levels for this exact model. */
	supported_reasoning_efforts?: EffortLevel[];
	/** Whether to enable extended thinking / reasoning, for providers that support toggling it. */
	thinking?: boolean;
	/** Whether this saved model profile can generate images. */
	supports_image_generation?: boolean;
	/** Whether this saved model profile can accept images as input (vision). */
	supports_vision?: boolean;
	created_at: string;
	updated_at: string;
}
