/** A saved, reusable AI model configuration. */
export interface Modelo {
	id_modelo: string;
	nombre_modelo: string;
	nombre_listado: string;
	id_proveedor: number;
	max_context: number;
	max_output: number;
	stream: boolean;
	temperature: number;
	top_p?: number;
	top_k?: number;
	repetition_penalty?: number;
	repetition_penalty_range?: number;
	frecuence_penalty?: number;
	presence_penalty?: number;
	/** Whether this saved model profile can generate images. */
	supports_image_generation?: boolean;
	created_at: string;
	updated_at: string;
}
