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

/** Tipo de contexto que puede asociarse a un chat. */
export type ChatContextKind = 'codex' | 'chapter' | 'outline' | 'note' | 'folder' | 'active-note' | 'character';

/** Item de contexto persistido en el chat. */
export interface ChatContextItem {
	id: string;
	kind: ChatContextKind;
	name: string;
	path?: string;
	content: string;
	thumbnail?: string | null;
	chapterId?: string;
	categoryColor?: string;
}
