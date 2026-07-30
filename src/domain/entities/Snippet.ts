import { EntityId, ISODate } from '../types';

/** Snippet: texto libre para brainstorming. Borrado logico habilitado. */
export interface Snippet {
	id_snippet: EntityId;
	nombre: string;
	texto: string;
	id_novela: EntityId;
	archivado: boolean;
	created_at: ISODate;
	updated_at: ISODate;
}