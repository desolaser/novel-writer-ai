import { EntityId, ISODate } from '../types';

/**
 * Categoria: agrupador de entradas de lore (Personajes, Naciones, Objetos, ...).
 * Las 6 default por novela se marcan con `system = true` y no son borrables.
 */
export interface Categoria {
	id_categoria: EntityId;
	nombre: string;
	color: string;
	/** Indica categoria por defecto del sistema (Personajes, Ubicaciones, ...). */
	system: boolean;
	id_novela: EntityId;
	created_at: ISODate;
	updated_at: ISODate;
}