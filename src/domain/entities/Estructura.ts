import { EntityId, ISODate } from '../types';

/** Acto: acto narrativo de la novela. */
export interface Acto {
	id_acto: EntityId;
	nombre: string;
	/** Orden de aparicion. */
	orden: number;
	id_novela: EntityId;
	created_at: ISODate;
	updated_at: ISODate;
}

/** Capitulo: pertenece a un Acto y tiene un manuscrito Markdown asociado. */
export interface Capitulo {
	id_capitulo: EntityId;
	nombre: string;
	/** Resumen / outline de lo que pasara en el capitulo. */
	outline: string;
	/** Path relativo al vault del manuscrito asociado, si ya fue creado. */
	archivo: string | null;
	id_acto: EntityId;
	orden: number;
	created_at: ISODate;
	updated_at: ISODate;
}

