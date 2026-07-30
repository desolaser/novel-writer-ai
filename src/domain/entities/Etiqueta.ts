import { EntityId, ISODate } from '../types';

/**
 * Etiqueta: marca curada (con color) para capitulos y/o escenas.
 * Ej: estados (draft, editado) o tiempo narrativo (flashback, presente).
 */
export interface Etiqueta {
	id_etiqueta: EntityId;
	nombre: string;
	color: string;
	id_novela: EntityId;
	created_at: ISODate;
	updated_at: ISODate;
}