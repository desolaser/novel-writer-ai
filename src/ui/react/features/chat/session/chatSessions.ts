import type { EntityId } from '../../../../../domain';
import { ChatSession, type ChatSessionDeps } from './ChatSession';

/**
 * Live sessions by chat id. Module-level on purpose: a session must outlive the
 * chat view, which unmounts whenever the author opens the chat list or another
 * sidebar tab.
 */
const sessions = new Map<EntityId, ChatSession>();

/** The chat's session, created with `createDeps` the first time it is needed. */
export function getChatSession(
	chatId: EntityId,
	createDeps: () => ChatSessionDeps | null,
): ChatSession | null {
	const existing = sessions.get(chatId);
	if (existing) return existing;
	const deps = createDeps();
	if (!deps) return null;
	const session = new ChatSession(chatId, deps);
	sessions.set(chatId, session);
	return session;
}

/** Stops and forgets a session, for a chat that was deleted. */
export function disposeChatSession(chatId: EntityId): void {
	sessions.get(chatId)?.stop();
	sessions.delete(chatId);
}

/** Stops every session, when the plugin unloads. */
export function stopAllChatSessions(): void {
	sessions.forEach((session) => session.stop());
	sessions.clear();
}
