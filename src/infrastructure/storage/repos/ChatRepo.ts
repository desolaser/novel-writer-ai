import { App, TFile } from 'obsidian';
import { Chat, Mensaje, MensajeToolCall, ChatContextItem, EntityId, nowISO, MessageRole } from '../../../domain';
import { genId } from '../../../utils/ids';
import { readJson, writeJson, joinPath, listFiles, deleteFile, ensureFolder } from '../fsHelpers';
import { withFileLock } from '../fileLock';

const CHATS_DIR = 'chats';

function chatPath(fp: string, id: EntityId) {
	return joinPath(fp, CHATS_DIR, `chat_${id}.json`);
}

interface ChatFile extends Chat {
	mensajes: Mensaje[];
	contextItems?: ChatContextItem[];
	characterContext?: ChatContextItem | null;
	impersonateContext?: ChatContextItem | null;
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

/**
 * Reads, changes and writes back one chat file inside its lock. Every change to
 * a chat goes through here: the file holds the whole conversation, so two
 * unsynchronized updates (a rename and a new reply) drop one of them.
 * Returns null without writing when the chat does not exist.
 */
async function updateChatFile<T>(
	app: App,
	folderPath: string,
	id: EntityId,
	change: (chat: ChatFile) => T | null,
): Promise<T | null> {
	const path = chatPath(folderPath, id);
	return withFileLock(path, async () => {
		const chat = await readJson<ChatFile>(app, path);
		if (!chat) return null;
		const result = change(chat);
		if (result === null) return null;
		chat.updated_at = nowISO();
		await writeJson(app, path, chat);
		return result;
	});
}

export async function readChat(app: App, folderPath: string, id: EntityId): Promise<ChatFile | null> {
	const path = chatPath(folderPath, id);
	return withFileLock(path, () => readJson<ChatFile>(app, path));
}

export async function createChat(app: App, folderPath: string, idNovela: EntityId, nombre: string, idPrompt?: EntityId): Promise<ChatFile> {
	await ensureFolder(app, joinPath(folderPath, CHATS_DIR));
	const id = genId();
	const now = nowISO();
	const chat: ChatFile = {
		id_chat: id, nombre, id_novela: idNovela, archivado: false, mensajes: [],
		created_at: now, updated_at: now,
	};
	if (idPrompt) (chat as any).id_prompt = idPrompt;
	await withFileLock(chatPath(folderPath, id), () => writeJson(app, chatPath(folderPath, id), chat));
	return chat;
}

export async function renameChat(app: App, folderPath: string, id: EntityId, nombre: string) {
	await updateChatFile(app, folderPath, id, (chat) => {
		chat.nombre = nombre;
		return true;
	});
}

export async function archiveChat(app: App, folderPath: string, id: EntityId, archivado: boolean) {
	await updateChatFile(app, folderPath, id, (chat) => {
		chat.archivado = archivado;
		return true;
	});
}

export async function deleteChat(app: App, folderPath: string, id: EntityId) {
	const path = chatPath(folderPath, id);
	await withFileLock(path, () => deleteFile(app, path));
}

export async function appendMensaje(
	app: App,
	folderPath: string,
	idChat: EntityId,
	role: MessageRole,
	mensaje: string,
	imagenes?: string[],
	toolCalls?: MensajeToolCall[],
): Promise<Mensaje> {
	const msg: Mensaje = {
		id_mensaje: genId(), id_chat: idChat, role, mensaje,
		...(imagenes?.length ? { imagenes } : {}),
		...(toolCalls?.length ? { toolCalls } : {}),
		created_at: nowISO(), updated_at: nowISO(),
	};
	const added = await updateChatFile(app, folderPath, idChat, (chat) => {
		chat.mensajes.push(msg);
		return msg;
	});
	if (!added) throw new Error('Chat not found');
	return added;
}

export interface MensajePatch {
	mensaje?: string;
	imagenes?: string[];
	toolCalls?: MensajeToolCall[];
}

/** Changes the given fields of one message; the others stay as they are. */
export async function patchMensaje(
	app: App,
	folderPath: string,
	idChat: EntityId,
	idMensaje: EntityId,
	patch: MensajePatch,
) {
	await updateChatFile(app, folderPath, idChat, (chat) => {
		const msg = chat.mensajes.find(m => m.id_mensaje === idMensaje);
		if (!msg) return null;
		if (patch.mensaje !== undefined) msg.mensaje = patch.mensaje;
		if (patch.imagenes !== undefined) {
			if (patch.imagenes.length) msg.imagenes = patch.imagenes;
			else delete msg.imagenes;
		}
		if (patch.toolCalls !== undefined) {
			if (patch.toolCalls.length) msg.toolCalls = patch.toolCalls;
			else delete msg.toolCalls;
		}
		msg.updated_at = nowISO();
		return true;
	});
}

export async function updateMensaje(app: App, folderPath: string, idChat: EntityId, idMensaje: EntityId, mensaje: string) {
	await patchMensaje(app, folderPath, idChat, idMensaje, { mensaje });
}

export async function deleteMensaje(app: App, folderPath: string, idChat: EntityId, idMensaje: EntityId) {
	await updateChatFile(app, folderPath, idChat, (chat) => {
		chat.mensajes = chat.mensajes.filter(m => m.id_mensaje !== idMensaje);
		return true;
	});
}

export async function saveChatContext(
	app: App,
	folderPath: string,
	idChat: EntityId,
	contextItems: ChatContextItem[],
	characterContext: ChatContextItem | null,
	impersonateContext: ChatContextItem | null,
) {
	await updateChatFile(app, folderPath, idChat, (chat) => {
		chat.contextItems = contextItems.length > 0 ? contextItems : undefined;
		chat.characterContext = characterContext ?? undefined;
		chat.impersonateContext = impersonateContext ?? undefined;
		return true;
	});
}

export async function writeChat(app: App, folderPath: string, chat: ChatFile) {
	chat.updated_at = nowISO();
	const path = chatPath(folderPath, chat.id_chat);
	await withFileLock(path, () => writeJson(app, path, chat));
}
