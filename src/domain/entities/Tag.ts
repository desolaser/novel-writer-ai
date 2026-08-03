import { EntityId, ISODate } from '../types';

/**
 * Tag: etiquetado libre/curado para filtrar Entradas de Codex.
	 * Distinto de Etiqueta (que aplica a capitulos).
 */
export interface Tag {
	id_tag: EntityId;
	nombre: string;
	color: string | null;
	id_novela: EntityId;
	created_at: ISODate;
	updated_at: ISODate;
}
