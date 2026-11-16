import type { EntityId, Mensaje, MensajeToolCall, MessageRole } from '../domain';

export interface MessageExtras {
	imagenes?: string[];
	toolCalls?: MensajeToolCall[];
}

export interface MessagePatch extends MessageExtras {
	mensaje?: string;
}

export interface StoredChat {
	mensajes: Mensaje[];
}

/**
 * Message storage of one novel's chats, as the chat session needs it.
 *
 * Bound to the novel when the session starts: a reply that finishes after the
 * author switched novels must still land in the chat it belongs to.
 */
export interface ChatPersistence {
	readChat(chatId: EntityId): Promise<StoredChat | null>;
	appendMessage(
		chatId: EntityId,
		role: MessageRole,
		text: string,
		extras?: MessageExtras,
	): Promise<Mensaje>;
	patchMessage(chatId: EntityId, messageId: EntityId, patch: MessagePatch): Promise<void>;
	deleteMessage(chatId: EntityId, messageId: EntityId): Promise<void>;
}
