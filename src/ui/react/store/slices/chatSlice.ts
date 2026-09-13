import type { EntityId } from "../../../../domain";
import type { ChatSlice, SliceCreator } from "../types";

export const createChatSlice: SliceCreator<ChatSlice> = (set, get) => ({
	chats: [],
	activeChatId: null,

	createChat: async (nombre) => {
		const s = get().store;
		if (!s) return null;
		const c = await s.createChat(nombre);
		await get().reloadAll();
		return c;
	},
	selectChat: (id) => set({ activeChatId: id }),
	renameChat: async (id, nombre) => {
		const s = get().store;
		if (!s) return;
		await s.renameChat(id, nombre);
		await get().reloadAll();
	},
	deleteChat: async (id) => {
		const s = get().store;
		if (!s) return;
		await s.deleteChat(id);
		if (get().activeChatId === id) set({ activeChatId: null });
		await get().reloadAll();
	},
	appendMensaje: async (role, msg, imagenes) => {
		const s = get().store;
		if (!s || !get().activeChatId) return;
		await s.appendMensaje(get().activeChatId, role, msg, imagenes);
	},
	updateMensaje: async (idChat: EntityId, idMsg: EntityId, msg: string) => {
		const s = get().store;
		if (!s) return;
		await s.updateMensaje(idChat, idMsg, msg);
	},
	deleteMensaje: async (idChat: EntityId, idMsg: EntityId) => {
		const s = get().store;
		if (!s) return;
		await s.deleteMensaje(idChat, idMsg);
	},

	saveChatContext: async (idChat, contextItems, characterContext, impersonateContext) => {
		const s = get().store;
		if (!s) return;
		await s.saveChatContext(idChat, contextItems, characterContext, impersonateContext);
	},
});
