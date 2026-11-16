import { useMemo, useSyncExternalStore } from 'react';
import type NovelWriterPlugin from '../../../../../../main';
import { useNovelWriter } from '../../../store/novelWriterStore';
import type { ToolContext } from '../../../../../interfaces/tool-context';
import { createMemoryToolContext } from '../tools/createMemoryToolContext';
import { createStoreToolContext } from '../tools/createStoreToolContext';
import { createWorkspaceToolContext } from '../tools/createWorkspaceToolContext';
import { IDLE_CHAT_SNAPSHOT, type ChatSession, type ChatSessionDeps } from './ChatSession';
import { getChatSession } from './chatSessions';

/** Everything the chat tools may touch: the novel's data and the workspace. */
function createToolContext(plugin: NovelWriterPlugin): ToolContext {
	return {
		...createStoreToolContext(),
		...createWorkspaceToolContext(plugin),
		...createMemoryToolContext(plugin),
	};
}

/** Wires a new session to the active novel's storage and the plugin settings. */
export function createSessionDeps(plugin: NovelWriterPlugin): ChatSessionDeps | null {
	const persistence = plugin.store.chatPersistence();
	if (!persistence) return null;
	return {
		persistence,
		createToolContext: () => createToolContext(plugin),
		novelId: plugin.store.activeNovelId,
		activeNovelId: () => useNovelWriter.getState().activeNovelId,
		autoApproveWrites: () => plugin.settings.data.chatAutoApproveWrites,
		roundsBeforePause: () => plugin.settings.data.toolRoundsBeforePause || 25,
	};
}

/** The session of a chat, created on first use. */
export function sessionFor(plugin: NovelWriterPlugin, chatId: string): ChatSession | null {
	return getChatSession(chatId, () => createSessionDeps(plugin));
}

const noSubscription = () => () => undefined;
const idleSnapshot = () => IDLE_CHAT_SNAPSHOT;

/** Subscribes a view to the session of the open chat. */
export function useChatSession(plugin: NovelWriterPlugin, chatId: string | null) {
	const session = useMemo(
		() => (chatId ? sessionFor(plugin, chatId) : null),
		[plugin, chatId],
	);
	const snapshot = useSyncExternalStore(
		session?.subscribe ?? noSubscription,
		session?.getSnapshot ?? idleSnapshot,
	);
	return { session, snapshot };
}
