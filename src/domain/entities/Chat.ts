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
	/** Tool calls the AI made while writing this answer, in order. */
	toolCalls?: MensajeToolCall[];
	created_at: ISODate;
	updated_at: ISODate;
}

/** Lifecycle of a tool call; the last four are final. */
export type MensajeToolCallStatus =
	| 'pending' | 'awaiting' | 'running' | 'done' | 'error' | 'rejected';

/**
 * Trace of one tool call kept with the assistant message, so the chat still
 * shows what the AI did after the author leaves and comes back. Long values
 * are cut: the chapter itself lives in its file, not in the chat.
 */
export interface MensajeToolCall {
	id: string;
	name: string;
	kind: 'read' | 'write' | 'unknown';
	args: Record<string, string>;
	status: MensajeToolCallStatus;
	ok?: boolean;
	output?: string;
	truncated?: boolean;
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
