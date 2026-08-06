import { EntityId, ISODate, MessageRole } from '../types';

/** Chat: conversacion con la IA. Borrado logico habilitado. */
export interface Chat {
	id_chat: EntityId;
	nombre: string;
	id_novela: EntityId;
	archivado: boolean;
	/** ID del prompt custom de chat usado en esta conversacion. */
	id_prompt?: EntityId;
	created_at: ISODate;
	updated_at: ISODate;
}

/** Mensaje: pertenece a un Chat. */
export interface Mensaje {
	id_mensaje: EntityId;
	id_chat: EntityId;
	role: MessageRole;
	mensaje: string;
	/** Generated images associated with this message, stored as URLs or data URLs. */
	imagenes?: string[];
	created_at: ISODate;
	updated_at: ISODate;
}
