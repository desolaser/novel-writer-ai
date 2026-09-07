import { EntityId, ISODate } from '../types';

/** Opcion de un Detalle tipo Dropdown. */
export interface OpcionDetalle {
	id_opcion_detalle: EntityId;
	nombre: string;
	color: string;
	/** Orden de aparicion (permite drag&drop y sort alfabetico). */
	orden: number;
	id_detalle: EntityId;
	created_at: ISODate;
	updated_at: ISODate;
}