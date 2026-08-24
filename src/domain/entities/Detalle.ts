import { EntityId, ISODate } from '../types';
import { TipoDetalle } from '../types';

/**
 * Detalle: definicion de un campo configurable que puede aparecer en entradas
 * de codex de ciertas categorias. El valor concreto vive en EntradaCodexDetalle.
 */
export interface Detalle {
	id_detalle: EntityId;
	nombre: string;
	tipo_detalle: TipoDetalle;
	/** Si true, el valor de este detalle se incluye en el prompt de IA. */
	incluir_ia: boolean;
	/**
	 * Instruccion opcional del autor para la IA al generar el valor de este
	 * detalle ("responde con un numero entero", "usa bullet points", etc).
	 */
	ai_hint?: string;
	id_novela: EntityId;
	created_at: ISODate;
	updated_at: ISODate;
}