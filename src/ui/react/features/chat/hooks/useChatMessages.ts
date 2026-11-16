import { useCallback, useEffect, useState } from 'react';
import { Notice } from 'obsidian';
import type NovelWriterPlugin from '../../../../../../main';

interface UseChatMessagesParams {
	plugin: NovelWriterPlugin;
	store: any;
	activeChatId: string | null;
	/** Bumps whenever the chat's session writes to the chat file. */
	version: number;
	updateMensaje: (chatId: string, msgId: string, text: string) => Promise<void>;
	deleteMensaje: (chatId: string, msgId: string) => Promise<void>;
}

/** Owns the message list of the active chat, its editing state, and per-message actions. */
export function useChatMessages({
	plugin, store, activeChatId, version, updateMensaje, deleteMensaje,
}: UseChatMessagesParams) {
	const [mensajes, setMensajes] = useState<any[]>([]);
	const [currentPromptId, setCurrentPromptId] = useState<string | null>(null);
	const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
	const [editingMsgText, setEditingMsgText] = useState('');

	/** Disk is the source of truth: the session saves there as it works. */
	const reload = useCallback(async () => {
		if (!activeChatId || !store) {
			setMensajes([]);
			setCurrentPromptId(null);
			return;
		}
		const chat = await store.readChat(activeChatId);
		setMensajes(chat?.mensajes ?? []);
		setCurrentPromptId(chat?.id_prompt ?? null);
	}, [activeChatId, store]);

	useEffect(() => {
		let cancelled = false;
		if (!activeChatId || !store) {
			setMensajes([]);
			setCurrentPromptId(null);
			return;
		}
		store.readChat(activeChatId).then((chat: any) => {
			if (cancelled) return;
			setMensajes(chat?.mensajes ?? []);
			setCurrentPromptId(chat?.id_prompt ?? null);
		});
		return () => {
			cancelled = true;
		};
	}, [activeChatId, store, version]);

	const copyToClipboard = useCallback(async (text: string) => {
		try {
			await navigator.clipboard.writeText(text);
			new Notice('✅ Content copied to clipboard.');
		} catch {
			new Notice('❌ Could not copy to clipboard.');
		}
	}, []);

	const saveAsNote = useCallback(async (text: string) => {
		try {
			const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
			const filename = `AI-Response-${timestamp}.md`;
			const activeFile = plugin.app.workspace.getActiveFile();
			const folder = activeFile?.parent?.path ?? '/';
			const filePath = `${folder}/${filename}`;
			await plugin.app.vault.create(filePath, text);
			new Notice(`✅ Response saved as note: ${filename}`);
		} catch (e: any) {
			new Notice(`❌ Error saving note: ${e?.message ?? String(e)}`);
		}
	}, [plugin]);

	const startEditMessage = useCallback((msgId: string, text: string) => {
		setEditingMsgId(msgId);
		setEditingMsgText(text);
	}, []);

	const saveEditedMessage = useCallback(async (msgId: string) => {
		if (!activeChatId || !editingMsgText.trim()) return;
		await updateMensaje(activeChatId, msgId, editingMsgText);
		setMensajes(prev => prev.map(m => m.id_mensaje === msgId ? { ...m, mensaje: editingMsgText } : m));
		setEditingMsgId(null);
		setEditingMsgText('');
	}, [activeChatId, editingMsgText, updateMensaje]);

	const handleDeleteMessage = useCallback(async (msgId: string) => {
		if (!activeChatId) return;
		await deleteMensaje(activeChatId, msgId);
		setMensajes(prev => prev.filter(m => m.id_mensaje !== msgId));
	}, [activeChatId, deleteMensaje]);

	const cancelEdit = useCallback(() => {
		setEditingMsgId(null);
		setEditingMsgText('');
	}, []);

	return {
		mensajes, reload,
		currentPromptId, setCurrentPromptId,
		editingMsgId, editingMsgText, setEditingMsgText,
		copyToClipboard, saveAsNote, startEditMessage, saveEditedMessage, handleDeleteMessage, cancelEdit,
	};
}
