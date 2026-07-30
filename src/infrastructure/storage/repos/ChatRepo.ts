import { App, TFile } from 'obsidian';
import { Chat, Mensaje, EntityId, nowISO, MessageRole } from '../../../domain';
import { genId } from '../../../utils/ids';
import { readJson, writeJson, joinPath, listFiles, deleteFile, ensureFolder } from '../fsHelpers';

const CHATS_DIR = 'chats';

function chatPath(fp: string, id: EntityId) {
	return joinPath(fp, CHATS_DIR, `chat_${id}.json`);
}

interface ChatFile extends Chat {
	mensajes: Mensaje[];
}

/** Lista los chats de una novela. NO carga mensajes (metadata only). */
export async function listChats(app: App, folderPath: string): Promise<Chat[]> {
	const files = listFiles(app, joinPath(folderPath, CHATS_DIR), '.json');
	const out: Chat[] = [];
	for (const f of files) {
		const data = await readJson<ChatFile>(app, f.path);
		if (data && data.id_chat) {
			const { mensajes, ...chat } = data;
			out.push(chat as Chat);
		}
	}
	return out.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
}

export async function readChat(app: App, folderPath: string, id: EntityId): Promise<ChatFile | null> {
	return await readJson<ChatFile>(app, chatPath(folderPath, id));
}

export async function createChat(app: App, folderPath: string, idNovela: EntityId, nombre: string): Promise<ChatFile> {
	await ensureFolder(app, joinPath(folderPath, CHATS_DIR));
	const id = genId();
	const now = nowISO();
	const chat: ChatFile = {
		id_chat: id, nombre, id_novela: idNovela, archivado: false, mensajes: [],
		created_at: now, updated_at: now,
	};
	await writeJson(app, chatPath(folderPath, id), chat);
	return chat;
}

export async function renameChat(app: App, folderPath: string, id: EntityId, nombre: string) {
	const chat = await readChat(app, folderPath, id);
	if (!chat) return;
	chat.nombre = nombre;
	chat.updated_at = nowISO();
	await writeJson(app, chatPath(folderPath, id), chat);
}

export async function archiveChat(app: App, folderPath: string, id: EntityId, archivado: boolean) {
	const chat = await readChat(app, folderPath, id);
	if (!chat) return;
	chat.archivado = archivado;
	chat.updated_at = nowISO();
	await writeJson(app, chatPath(folderPath, id), chat);
}

export async function deleteChat(app: App, folderPath: string, id: EntityId) {
	await deleteFile(app, chatPath(folderPath, id));
}

export async function appendMensaje(app: App, folderPath: string, idChat: EntityId, role: MessageRole, mensaje: string): Promise<Mensaje> {
	const chat = await readChat(app, folderPath, idChat);
	if (!chat) throw new Error('Chat no encontrado');
	const msg: Mensaje = {
		id_mensaje: genId(), id_chat: idChat, role, mensaje,
		created_at: nowISO(), updated_at: nowISO(),
	};
	chat.mensajes.push(msg);
	chat.updated_at = nowISO();
	await writeJson(app, chatPath(folderPath, idChat), chat);
	return msg;
}

export async function deleteMensaje(app: App, folderPath: string, idChat: EntityId, idMensaje: EntityId) {
	const chat = await readChat(app, folderPath, idChat);
	if (!chat) return;
	chat.mensajes = chat.mensajes.filter(m => m.id_mensaje !== idMensaje);
	chat.updated_at = nowISO();
	await writeJson(app, chatPath(folderPath, idChat), chat);
}