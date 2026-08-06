import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Notice, TFile, TFolder, MarkdownRenderer, FuzzySuggestModal, Modal, Setting } from 'obsidian';
import { useNovelWriter } from '../../store/novelWriterStore';
import type NovelWriterPlugin from '../../../../../main';
import { ApiFactory } from '../../../../factories/api-factory';
import { Icon } from '../../components/Icon';
import { openEntryModal } from '../codex/CodexEntryModal';
import { ThumbnailCropModal } from '../codex/ThumbnailCropModal';
import { getActiveModelConfig } from '../../../../infrastructure/settings/active-model';
import type { EntradaCodex, ChatContextItem, ChatContextKind } from '../../../../domain';
import { CustomPromptsModal } from "../chat/CustomPromptsModal";

type ContextKind = ChatContextKind;
type ContextItem = ChatContextItem;
type ContextMenu = 'root' | 'codex' | 'chapters' | 'outlines' | 'notes' | 'folders' | 'characters' | 'impersonate';

const extractImageUrls = (result: { images?: string[] }): string[] => result.images?.filter(url => typeof url === 'string' && url.trim()) ?? [];

const dataUrlToArrayBuffer = async (dataUrl: string): Promise<ArrayBuffer> => {
	const res = await fetch(dataUrl);
	return res.arrayBuffer();
};

const stripFrontmatter = (content: string) => content.replace(/^---\s*\r?\n[\s\S]*?\r?\n---\s*(?:\r?\n)?/, '');
const includesQuery = (query: string, ...values: Array<string | null | undefined>) =>
	values.join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());

/** Tiny markdown block renderer using Obsidian's built-in renderer. */
function MarkdownBlock({ plugin, content }: { plugin: NovelWriterPlugin; content: string }) {
	const ref = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		el.empty();
		void MarkdownRenderer.renderMarkdown(content, el, '', plugin);
	}, [content, plugin]);
	return <div ref={ref} className="nw-markdown-body" />;
}

/** Prompt builder that injects character persona and chat prompt. */
function buildPrompt(
	mensajes: any[],
	contextItems: ContextItem[],
	newUserMessage: string,
	characterContext: ContextItem | null,
	impersonateContext: ContextItem | null,
	activeNoteItem: ContextItem | null,
	chatPromptText?: string,
): string {
	const groups: Array<[ContextKind, string]> = [
		['codex', 'Entradas de Codex seleccionadas'], ['chapter', 'Capítulos seleccionados'], ['outline', 'Outlines seleccionados'],
		['note', 'Notas seleccionadas'], ['folder', 'Carpetas seleccionadas'],
	];
	const contextPrompt = groups.map(([kind, title]) => {
		const items = contextItems.filter(item => item.kind === kind);
		if (!items.length) return '';
		return `${title}:\n${items.map(item => `--- ${item.name}${item.path ? ` (${item.path})` : ''} ---\n${item.content}`).join('\n\n')}`;
	}).filter(Boolean).join('\n\n');

	// Active-note: always the currently open file, included separately
	const activeNoteBlock = activeNoteItem
		? `Nota activa seleccionada:\n--- ${activeNoteItem.name}${activeNoteItem.path ? ` (${activeNoteItem.path})` : ''} ---\n${activeNoteItem.content}`
		: '';

	const history = [...mensajes, { role: 'user', mensaje: newUserMessage }]
		.filter(m => m.role === 'user' || m.role === 'assistant')
		.map(m => ({ role: m.role, content: m.mensaje }));

	let systemPrompt = '';
	if (chatPromptText) {
		systemPrompt = `${chatPromptText}\n\n`;
	}
	if (characterContext) {
		systemPrompt += `[MODO ROL: Estás interpretando al personaje "${characterContext.name}". Responde siempre EN PERSONAJE, usando su tono, vocabulario, conocimiento y personalidad. NO salgas del personaje bajo ninguna circunstancia. NO menciones que eres una IA. Eres "${characterContext.name}".]\n\nInformación del personaje:\n${characterContext.content}\n\n`;
	}
	if (impersonateContext) {
		systemPrompt += `[MODO IMPERSONAR: El usuario está interpretando al personaje "${impersonateContext.name}". El usuario ES "${impersonateContext.name}". Trátalo como si fuera ese personaje. NO te refieras a él como "usuario" o "tú", llámalo "${impersonateContext.name}".]\n\nInformación del personaje del usuario:\n${impersonateContext.content}\n\n`;
	}

	const combinedPrompt = [contextPrompt, activeNoteBlock].filter(Boolean).join('\n\n');
	const contextBlock = combinedPrompt ? `Contexto seleccionado explícitamente por el usuario:\n${combinedPrompt}\n\n` : '';
	const userLabel = impersonateContext ? impersonateContext.name : 'Usuario';
	return `${systemPrompt}${contextBlock}${history.map(m => `${m.role === 'user' ? userLabel : 'IA'}: ${m.content}`).join('\n\n')}\n\nIA: `;
}

/** Modal to pick a vault folder. */
class FolderPickerModal extends FuzzySuggestModal<TFolder> {
	private onPick: (folder: TFolder) => void;
	private itemsCache: TFolder[];
	constructor(app: any, folders: TFolder[], onPick: (folder: TFolder) => void) {
		super(app);
		this.setPlaceholder('Selecciona una carpeta...');
		this.itemsCache = folders;
		this.onPick = onPick;
	}
	getItems(): TFolder[] { return this.itemsCache; }
	getItemText(item: TFolder): string { return item.path; }
	onChooseItem(item: TFolder): void { this.onPick(item); }
}

/** Simple confirm modal. */
class ConfirmModal extends Modal {
	private onConfirm: () => void;
	private message: string;
	constructor(app: any, message: string, onConfirm: () => void) {
		super(app);
		this.message = message;
		this.onConfirm = onConfirm;
	}
	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('p', { text: this.message });
		new Setting(contentEl)
			.addButton(btn => btn.setButtonText('Sí').setCta().onClick(() => { this.onConfirm(); this.close(); }))
			.addButton(btn => btn.setButtonText('No').onClick(() => this.close()));
	}
	onClose() { this.contentEl.empty(); }
}

export function ChatTab({ plugin }: { plugin: NovelWriterPlugin }) {
	const { 
		activeChatId, 
		selectChat, 
		appendMensaje, 
		createChat, 
		store, 
		categorias, 
		entradas, 
		capitulos, 
		setSidebarTab, 
		setEntryThumbnail, 
		updateMensaje, 
		deleteMensaje, 
		saveChatContext, 
		getCustomPrompts, 
		getDefaultChatPrompt,
	} = useNovelWriter();
	const [input, setInput] = useState('');
	const [mensajes, setMensajes] = useState<any[]>([]);
	const [busy, setBusy] = useState(false);
	const [contextItems, setContextItems] = useState<ContextItem[]>([]);
	const [contextOpen, setContextOpen] = useState(false);
	const [contextMenu, setContextMenu] = useState<ContextMenu>('root');
	const [query, setQuery] = useState('');
	const [modelMenuOpen, setModelMenuOpen] = useState(false);
	const [modelVersion, setModelVersion] = useState(0);
	const [characterContext, setCharacterContext] = useState<ContextItem | null>(null);
	const [impersonateContext, setImpersonateContext] = useState<ContextItem | null>(null);
	const [activeNoteItem, setActiveNoteItem] = useState<ContextItem | null>(null);
	const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
	const [editingMsgText, setEditingMsgText] = useState('');
	const [imageDropdown, setImageDropdown] = useState<{ index: number; searchQuery: string } | null>(null);
	const [promptMenuOpen, setPromptMenuOpen] = useState(false);
	const [currentPromptId, setCurrentPromptId] = useState<string | null>(null);
	const scrollRef = useRef<HTMLDivElement>(null);
	const promptRef = useRef<HTMLDivElement | null>(null);

	const markdownFiles = useMemo(() => plugin.app.vault.getMarkdownFiles(), [plugin, contextOpen]);
	const folders = useMemo(() => plugin.app.vault.getAllLoadedFiles().filter((file): file is TFolder => file instanceof TFolder), [plugin, contextOpen]);
	const activeFile = plugin.app.workspace.getActiveFile();
	const notes = useMemo(() => {
		if (!activeFile?.parent) return [];
		return markdownFiles.filter(file => file.parent?.path === activeFile.parent?.path);
	}, [activeFile?.path, markdownFiles]);

	// Load persisted context when chat changes
	useEffect(() => {
		if (!activeChatId || !store) {
			setMensajes([]);
			setCurrentPromptId(null);
			setContextItems([]);
			setCharacterContext(null);
			setImpersonateContext(null);
			return;
		}
		store.readChat(activeChatId).then(c => {
			setMensajes(c?.mensajes ?? []);
			setCurrentPromptId((c as any)?.id_prompt ?? null);
			setContextItems((c as any)?.contextItems ?? []);
			setCharacterContext((c as any)?.characterContext ?? null);
			setImpersonateContext((c as any)?.impersonateContext ?? null);
		});
	}, [activeChatId, store]);
	useEffect(() => { scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight); }, [mensajes]);

	// Persist context to disk whenever it changes
	const persistContext = useCallback((items: ContextItem[], charCtx: ContextItem | null, impCtx: ContextItem | null) => {
		if (!activeChatId) return;
		void saveChatContext(activeChatId, items, charCtx, impCtx);
	}, [activeChatId, saveChatContext]);

	const updateContextItems = (updater: (items: ContextItem[]) => ContextItem[]) => {
		setContextItems(items => {
			const next = updater(items);
			persistContext(next, characterContext, impersonateContext);
			return next;
		});
	};

	const addContext = (item: ContextItem) => {
		updateContextItems(items => items.some(existing => existing.id === item.id) ? items : [...items, item]);
		setContextOpen(false);
		setContextMenu('root');
		setQuery('');
	};

	const addFolderContext = async (folder: TFolder) => {
		try {
			const prefix = `${folder.path}/`;
			const files = markdownFiles.filter(file => file.path.startsWith(prefix));
			const contents = await Promise.all(files.map(async file => `--- ${file.path} ---\n${stripFrontmatter(await plugin.app.vault.read(file))}`));
			addContext({ id: `folder:${folder.path}`, kind: 'folder', name: folder.name, path: folder.path, content: contents.join('\n\n') });
		} catch (error) { new Notice(`No se pudo leer la carpeta ${folder.path}: ${String(error)}`); }
	};

	const addFileContext = async (file: TFile, kind: 'note') => {
		try {
			const content = await plugin.app.vault.read(file);
			addContext({ id: `${kind}:${file.path}`, kind, name: file.basename, path: file.path, content: stripFrontmatter(content) });
		} catch (error) {
			new Notice(`No se pudo leer ${file.path}: ${String(error)}`);
		}
	};

	// Active-note: follows the currently open file, replaced on file switch, NOT persisted
	useEffect(() => {
		if (!activeFile) {
			setActiveNoteItem(null);
			return;
		}
		plugin.app.vault.read(activeFile).then(content => {
			setActiveNoteItem({
				id: `active-note:${activeFile.path}`,
				kind: 'active-note',
				name: activeFile.basename,
				path: activeFile.path,
				content: stripFrontmatter(content),
			});
		}).catch(() => setActiveNoteItem(null));
	}, [activeFile?.path]);

	const refreshActiveNote = useCallback(() => {
		if (!activeFile) return;
		plugin.app.vault.read(activeFile).then(content => {
			setActiveNoteItem({
				id: `active-note:${activeFile.path}`,
				kind: 'active-note',
				name: activeFile.basename,
				path: activeFile.path,
				content: stripFrontmatter(content),
			});
		}).catch(() => {});
	}, [activeFile]);

	const removeActiveNote = useCallback(() => setActiveNoteItem(null), []);

	const selectChapter = async (chapterId: string) => {
		if (!store) return;
		try {
			const chapter = capitulos.find(item => item.id_capitulo === chapterId);
			if (!chapter?.archivo) return;
			const content = await store.readCapituloTexto(chapterId);
			addContext({ id: `chapter:${chapterId}`, kind: 'chapter', name: chapter.nombre, path: chapter.archivo, chapterId, content: stripFrontmatter(content) });
		} catch (error) { new Notice(`No se pudo leer el capítulo: ${String(error)}`); }
	};

	const selectOutline = (chapterId: string) => {
		const chapter = capitulos.find(item => item.id_capitulo === chapterId);
		if (!chapter) return;
		addContext({ id: `outline:${chapterId}`, kind: 'outline', name: chapter.nombre, chapterId, content: chapter.outline ?? '' });
	};

	const addCharacterContext = (entry: EntradaCodex) => {
		const item: ContextItem = {
			id: `character:${entry.id_entrada_codex}`,
			kind: 'character',
			name: entry.nombre,
			content: entry.descripcion,
			thumbnail: entry.thumbnail,
			categoryColor: entry.color ?? undefined,
		};
		setCharacterContext(item);
		persistContext(contextItems, item, impersonateContext);
		setContextOpen(false);
		setContextMenu('root');
		setQuery('');
	};

	const removeCharacterContext = () => {
		setCharacterContext(null);
		persistContext(contextItems, null, impersonateContext);
	};

	const addImpersonateContext = (entry: EntradaCodex) => {
		const item: ContextItem = {
			id: `impersonate:${entry.id_entrada_codex}`,
			kind: 'character',
			name: entry.nombre,
			content: entry.descripcion,
			thumbnail: entry.thumbnail,
			categoryColor: entry.color ?? undefined,
		};
		setImpersonateContext(item);
		persistContext(contextItems, characterContext, item);
		setContextOpen(false);
		setContextMenu('root');
		setQuery('');
	};

	const removeImpersonateContext = () => {
		setImpersonateContext(null);
		persistContext(contextItems, characterContext, null);
	};

	const openContextItem = async (item: ContextItem) => {
		if (item.kind === 'codex') {
			setSidebarTab('codex');
			openEntryModal(plugin, item.id.replace('codex:', ''));
			return;
		}
		if (item.kind === 'outline' && item.chapterId) { await plugin.openOutlineChapter(item.chapterId); return; }
		if (item.kind === 'active-note') return;
		if (item.path) {
			await plugin.app.workspace.openLinkText(item.path, '', false);
		}
	};

	const copyToClipboard = useCallback(async (text: string) => {
		try {
			await navigator.clipboard.writeText(text);
			new Notice('✅ Contenido copiado al portapapeles.');
		} catch {
			new Notice('❌ No se pudo copiar al portapapeles.');
		}
	}, []);

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

	const regenerateMessage = useCallback(async () => {
		if (!store || !activeChatId) return;
		const chat = await store.readChat(activeChatId);
		if (!chat) return;
		const msgs = chat.mensajes;
		let lastAsstMsg = null;
		for (let i = msgs.length - 1; i >= 0; i--) {
			if (msgs[i].role === 'assistant') { lastAsstMsg = msgs[i]; break; }
		}
		if (!lastAsstMsg) return;
		// Persist removal of the last assistant message
		await deleteMensaje(activeChatId, lastAsstMsg.id_mensaje);
		const newMsgs = msgs.filter(m => m.id_mensaje !== lastAsstMsg!.id_mensaje);
		setMensajes(newMsgs);
		const lastUserMsg = [...newMsgs].reverse().find(m => m.role === 'user');
		if (!lastUserMsg) return;
		setBusy(true);
		try {
			const settings = plugin.settings.data;
			const activeModel = getActiveModelConfig(settings, 'chat');
			if (!activeModel.modelName) throw new Error('Configura un modelo activo en Settings.');
			const token = settings.apiToken[activeModel.providerId] ?? '';
			const api = new ApiFactory().createApi(activeModel.providerId, token);
			const savedModel = settings.modelos.find(model => model.id_modelo === settings.modeloPredeterminadoId);
			const prompt = buildPrompt(newMsgs, contextItems, lastUserMsg.mensaje, characterContext, impersonateContext, activeNoteItem, chatPromptText);
			const result = await api.generateCompletion(prompt, activeModel.modelName, {
				...activeModel.options,
				stream: false,
				...(activeModel.providerId === 'openrouter' && savedModel?.supports_image_generation ? { modalities: ['image', 'text'] } : {}),
			});
			const images = extractImageUrls(result);
			const reply = result.text ?? (images.length ? '' : '(sin respuesta)');
			await appendMensaje('assistant', reply, images);
			setMensajes(m => [...m, { id_mensaje: 'tmp_a', role: 'assistant', mensaje: reply, imagenes: images, created_at: '' }]);
		} catch (e: any) {
			const err = 'Error: ' + (e?.message ?? String(e));
			await appendMensaje('assistant', err);
			setMensajes(m => [...m, { id_mensaje: 'tmp_e', role: 'assistant', mensaje: err, created_at: '' }]);
		}
		setBusy(false);
	}, [store, activeChatId, contextItems, characterContext, impersonateContext, activeNoteItem, plugin, appendMensaje, deleteMensaje]);

	const doCreate = async () => {
		const c = await createChat("Chat sin nombre");
		selectChat(c.id_chat);
		new Notice('Chat nuevo creado');
	};

	const send = async () => {
		const t = input.trim();
		if (!t) return;
		let chatId = activeChatId;
		if (!chatId) {
			const created = await createChat('Chat sin nombre');
			if (!created) return;
			chatId = created.id_chat;
			// Persist current context to the new chat before selecting it,
			// so the effect that loads the chat file picks up the context.
			await saveChatContext(chatId, contextItems, characterContext, impersonateContext);
			selectChat(chatId);
		}
		setInput('');
		await appendMensaje('user', t);
		setMensajes(m => [...m, { id_mensaje: 'tmp_u', role: 'user', mensaje: t, created_at: '' }]);
		setBusy(true);
		try {
			const settings = plugin.settings.data;
			const activeModel = getActiveModelConfig(settings, 'chat');
			if (!activeModel.modelName) throw new Error('Configura un modelo activo en Settings.');
			const token = settings.apiToken[activeModel.providerId] ?? '';
			const api = new ApiFactory().createApi(activeModel.providerId, token);
			const savedModel = settings.modelos.find(model => model.id_modelo === settings.modeloPredeterminadoId);
			const prompt = buildPrompt(mensajes, contextItems, t, characterContext, impersonateContext, activeNoteItem, chatPromptText);
			const result = await api.generateCompletion(prompt, activeModel.modelName, {
				...activeModel.options,
				stream: false,
				...(activeModel.providerId === 'openrouter' && savedModel?.supports_image_generation ? { modalities: ['image', 'text'] } : {}),
			});
			const images = extractImageUrls(result);
			const reply = result.text ?? (images.length ? '' : '(sin respuesta)');
			await appendMensaje('assistant', reply, images);
			setMensajes(m => [...m, { id_mensaje: 'tmp_a', role: 'assistant', mensaje: reply, imagenes: images, created_at: '' }]);
		} catch (e: any) {
			const err = 'Error: ' + (e?.message ?? String(e));
			await appendMensaje('assistant', err);
			setMensajes(m => [...m, { id_mensaje: 'tmp_e', role: 'assistant', mensaje: err, created_at: '' }]);
		}
		setBusy(false);
	};

	const closeImageDropdown = useCallback(() => setImageDropdown(null), []);

	// Click-outside for prompt menu
	useEffect(() => {
		const handler = (e: MouseEvent) => {
			if (promptRef.current && !promptRef.current.contains(e.target as Node)) {
				setPromptMenuOpen(false);
			}
		};
		document.addEventListener('mousedown', handler);
		return () => document.removeEventListener('mousedown', handler);
	}, []);

	const chatPrompts = getCustomPrompts().filter(p => p.tipo === 'chat');
	const defaultChatPrompt = getDefaultChatPrompt();
	const resolvedPromptId = currentPromptId || defaultChatPrompt?.id_prompt || null;
	const currentPrompt = chatPrompts.find(p => p.id_prompt === resolvedPromptId);
	const chatPromptText = currentPrompt?.texto;

	const handlePromptSelect = async (promptId: string) => {
		setCurrentPromptId(promptId);
		setPromptMenuOpen(false);
	};

	const saveImageToVault = useCallback(async (dataUrl: string, filename: string) => {
		const mimeMatch = dataUrl.match(/^data:(image\/\w+);/);
		const ext = mimeMatch ? mimeMatch[1].split('/')[1] : 'png';
		const foldersList = plugin.app.vault.getAllLoadedFiles().filter((f): f is TFolder => f instanceof TFolder);
		new FolderPickerModal(plugin.app, foldersList, async (folder) => {
			try {
				const buf = await dataUrlToArrayBuffer(dataUrl);
				const finalName = `${filename}.${ext}`;
				const filePath = `${folder.path}/${finalName}`;
				const existing = plugin.app.vault.getAbstractFileByPath(filePath);
				if (existing) {
					new Notice(`⚠️ Ya existe un archivo en ${filePath}`);
					return;
				}
				await plugin.app.vault.createBinary(filePath, buf);
				new Notice(`✅ Imagen guardada en ${filePath}`);
				closeImageDropdown();
			} catch (e: any) {
				new Notice(`❌ Error al guardar: ${e?.message ?? String(e)}`);
			}
		}).open();
	}, [plugin, closeImageDropdown]);

	/** Check if image is square; if not, show crop modal first, then save. */
	const cropThenSetThumbnail = useCallback((dataUrl: string, entryId: string, entryName: string) => {
		const img = new Image();
		img.onload = () => {
			if (Math.abs(img.naturalWidth - img.naturalHeight) <= 2) {
				// Already square – set directly
				void (async () => {
					await setEntryThumbnail(entryId, dataUrl);
					new Notice(`✅ Imagen agregada como thumbnail de "${entryName}"`);
					closeImageDropdown();
				})();
			} else {
				// Not square – show crop modal
				new ThumbnailCropModal(plugin.app, dataUrl, async (croppedDataUrl) => {
					await setEntryThumbnail(entryId, croppedDataUrl);
					new Notice(`✅ Imagen agregada como thumbnail de "${entryName}"`);
					closeImageDropdown();
				}).open();
			}
		};
		img.onerror = () => {
			new Notice('❌ No se pudo cargar la imagen para recortar.');
		};
		img.src = dataUrl;
	}, [plugin, setEntryThumbnail, closeImageDropdown]);

	/** Handle: click codex entry in image dropdown → open editor + replace thumbnail flow */
	const handleImageToCodexEntry = useCallback((entryId: string, dataUrl: string) => {
		const entry = entradas.find(e => e.id_entrada_codex === entryId);
		if (!entry) return;
		closeImageDropdown();
		// Open the CodexEntryModal so the user sees the entry
		setSidebarTab('codex');
		openEntryModal(plugin, entryId);
		// Then handle thumbnail
		const doSet = (url: string) => cropThenSetThumbnail(url, entry.id_entrada_codex, entry.nombre);
		if (entry.thumbnail) {
			new ConfirmModal(plugin.app, `¿Está seguro de reemplazar el thumbnail de "${entry.nombre}"?`, () => doSet(dataUrl)).open();
		} else {
			doSet(dataUrl);
		}
	}, [entradas, plugin, closeImageDropdown, cropThenSetThumbnail, setSidebarTab]);

	const downloadImage = (dataUrl: string, filename: string) => {
		const link = document.createElement('a');
		link.href = dataUrl;
		const mimeMatch = dataUrl.match(/^data:(image\/\w+);/);
		const ext = mimeMatch ? mimeMatch[1].split('/')[1] : 'png';
		link.download = `${filename}.${ext}`;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		closeImageDropdown();
	};

	const renderIcon = (kind: ContextKind) => <span className="nw-context-icon">{kind === 'chapter' ? '📖' : kind === 'outline' ? '📜' : kind === 'folder' ? '📁' : kind === 'character' ? '🧑' : '📝'}</span>;
	const filteredChapters = capitulos.filter(chapter => includesQuery(query, chapter.nombre));
	const filteredFolders = folders.filter(folder => includesQuery(query, folder.name, folder.path));
	const filteredNotes = (query ? markdownFiles : notes).filter(file => includesQuery(query, file.basename, file.path));
	const filteredCategories = categorias.map(category => ({ category, entries: entradas.filter(entry => !entry.archivado && entry.id_categoria === category.id_categoria && includesQuery(query, entry.nombre, entry.alias, entry.descripcion)) })).filter(group => group.entries.length);

	const personajeCategory = categorias.find(c => c.nombre.toLocaleLowerCase() === 'personajes');
	const characterEntries = personajeCategory
		? entradas.filter(e => !e.archivado && e.id_categoria === personajeCategory.id_categoria && includesQuery(query, e.nombre, e.alias))
		: [];

	const imageCodexCategories = useMemo(() => {
		const sq = imageDropdown?.searchQuery ?? '';
		return categorias.map(category => ({
			category,
			entries: entradas.filter(entry => !entry.archivado && entry.id_categoria === category.id_categoria && includesQuery(sq, entry.nombre, entry.alias)),
		})).filter(group => group.entries.length);
	}, [categorias, entradas, imageDropdown?.searchQuery]);

	return <div className="nw-chat">
		<div className="nw-chat-messages" ref={scrollRef}>
			{mensajes.length === 0 && !busy && (
				<div className="nw-chat-empty">
					<p>Comienza una conversación con la IA.</p>
					{!activeChatId && <p className="nw-chat-empty-hint">Escribe un mensaje para crear un nuevo chat.</p>}
				</div>
			)}
			{mensajes.map(m => (
				<div key={m.id_mensaje} className={`nw-msg nw-msg-${m.role}${editingMsgId === m.id_mensaje ? ' nw-msg-editing' : ''}`}>
					<div className="nw-msg-role">
						{m.role === 'user' ? (
							impersonateContext ? (
								<span className="nw-msg-role-character nw-msg-role-impersonate">
									{impersonateContext.thumbnail ? <img src={impersonateContext.thumbnail} alt="" className="nw-msg-role-thumb" /> : <Icon.Person width={20} height={20} />}
									<span>{impersonateContext.name}</span>
								</span>
							) : 'Tu'
						) : (
							characterContext ? (
								<span className="nw-msg-role-character">
									{characterContext.thumbnail ? <img src={characterContext.thumbnail} alt="" className="nw-msg-role-thumb" /> : <Icon.Person width={20} height={20} />}
									<span>{characterContext.name}</span>
								</span>
							) : 'IA'
						)}
					</div>
					{m.mensaje && (
						editingMsgId === m.id_mensaje ? (
							<div className="nw-msg-edit-area">
								<textarea
									className="nw-msg-edit-textarea"
									value={editingMsgText}
									onChange={e => setEditingMsgText(e.target.value)}
									onKeyDown={e => {
										if (e.key === 'Enter' && !e.shiftKey) {
											e.preventDefault();
											void saveEditedMessage(m.id_mensaje);
										}
										if (e.key === 'Escape') cancelEdit();
									}}
									rows={10}
									autoFocus
								/>
								<div className="nw-msg-edit-actions">
									<button className="nw-btn nw-btn-primary" onClick={() => void saveEditedMessage(m.id_mensaje)}>Guardar</button>
									<button className="nw-btn" onClick={cancelEdit}>Cancelar</button>
								</div>
							</div>
						) : (
							<div className="nw-msg-body">
								{m.role === 'assistant' ? <MarkdownBlock plugin={plugin} content={m.mensaje} /> : m.mensaje}
							</div>
						)
					)}
					{m.imagenes?.length > 0 && <div className="nw-msg-images">
						{m.imagenes.map((url: string, index: number) => (
							<div key={`${url}-${index}`} className="nw-msg-image-wrapper">
								<img src={url} alt={`Imagen generada ${index + 1}`} onClick={() => window.open(url, '_blank')} />
								<div className="nw-msg-image-actions">
									<button className="nw-msg-image-download-btn" title="Opciones de imagen" onClick={() => setImageDropdown(prev => prev?.index === index ? null : { index, searchQuery: '' })}>
										<Icon.Download width={14} height={14} />
									</button>
									{imageDropdown?.index === index && (
										<div className="nw-image-menu-dropdown">
											<button className="nw-context-row" onClick={() => downloadImage(url, `imagen-${index + 1}`)}>
												<Icon.Download width={14} height={14} /> Descargar
											</button>
											<button className="nw-context-row" onClick={() => { void saveImageToVault(url, `imagen-${index + 1}`); }}>
												<Icon.Save width={14} height={14} /> Guardar en Vault
											</button>
											<div className="nw-image-menu-codex-section">
												<div className="nw-image-menu-codex-header">Agregar a entrada de Codex</div>
												<input
													className="nw-input"
													placeholder="Buscar..."
													value={imageDropdown.searchQuery}
													onChange={e => setImageDropdown(prev => prev ? { ...prev, searchQuery: e.target.value } : null)}
												/>
												<div className="nw-image-menu-codex-list">
													{imageCodexCategories.map(({ category, entries: categoryEntries }) => (
														<section key={category.id_categoria} className="nw-context-category">
															<div className="nw-context-category-title">{category.nombre}</div>
															{categoryEntries.map(entry => (
																<button
																	key={entry.id_entrada_codex}
																	className="nw-context-row nw-context-entry"
																	onClick={() => handleImageToCodexEntry(entry.id_entrada_codex, url)}
																>
																	<span className="nw-context-category-line" style={{ backgroundColor: entry.color ?? category.color }} />
																	{entry.thumbnail ? (
																		<img src={entry.thumbnail} alt="" className="nw-context-entry-thumbnail" style={{ width: 32, height: 32, flex: '0 0 auto', objectFit: 'cover' }} />
																	) : (
																		<span className="nw-context-entry-thumbnail" style={{ width: 32, height: 32, flex: '0 0 auto' }} />
																	)}
																	<span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.nombre}</span>
																</button>
															))}
														</section>
													))}
													{imageCodexCategories.length === 0 && <span className="nw-image-menu-empty">No se encontraron entradas.</span>}
												</div>
											</div>
										</div>
									)}
								</div>
							</div>
						))}
					</div>}
					{m.mensaje && editingMsgId !== m.id_mensaje && (
						<div className="nw-msg-actions">
							<button className="nw-msg-action-btn" title="Editar" onClick={() => startEditMessage(m.id_mensaje, m.mensaje)}>
								<Icon.Edit width={13} height={13} />
							</button>
							<button className="nw-msg-action-btn" title="Copiar al portapapeles" onClick={() => void copyToClipboard(m.mensaje)}>
								<Icon.Copy width={13} height={13} />
							</button>
							{m.role === 'assistant' && (
								<button className="nw-msg-action-btn" title="Regenerar" onClick={() => void regenerateMessage()}>
									<Icon.Refresh width={13} height={13} />
								</button>
							)}
							<button className="nw-msg-action-btn nw-msg-action-delete" title="Eliminar mensaje" onClick={() => void handleDeleteMessage(m.id_mensaje)}>
								<Icon.X width={13} height={13} />
							</button>
						</div>
					)}
				</div>
			))}
			{busy && <div className="nw-msg nw-msg-assistant"><em>...escribiendo...</em></div>}
		</div>
		<div className='nw-chat-input-container'>
			<div className="nw-chat-context-bar">
				<div style={{ display: "flex", gap: "4px" }}>
					<button className="nw-btn-link nw-btn-small nw-chat-context-trigger" onClick={() => { setContextOpen(open => !open); setContextMenu('root'); setQuery(''); }}>@</button>
					<div className="nw-context-badges">			
						{activeNoteItem && 
							<button key={activeNoteItem.id} className={`nw-context-badge nw-context-badge-${activeNoteItem.kind}`} onClick={() => void openContextItem(activeNoteItem)} title={`Abrir ${activeNoteItem.name}`}>
								{renderIcon(activeNoteItem.kind)}<span>{activeNoteItem.name}</span><span className="nw-context-badge-remove" role="button" aria-label={`Quitar ${activeNoteItem.name}`} onClick={event => { event.stopPropagation(); removeActiveNote(); }}><Icon.X width={12} height={12} /></span>
							</button>
						}
						{contextItems.map(item => 
							<button 
								key={item.id} 
								className={`nw-context-badge nw-context-badge-${item.kind}`} 
								onClick={() => void openContextItem(item)} 
								title={`Abrir ${item.name}`}
							>
								{item.kind === 'codex' && item.thumbnail
									? <img src={item.thumbnail} alt="" /> 
									: renderIcon(item.kind)}
								<span>{item.name}</span>
								<span 
									className="nw-context-badge-remove" 
									role="button" 
									aria-label={`Quitar ${item.name}`} 
									onClick={event => { event.stopPropagation(); updateContextItems(items => items.filter(existing => existing.id !== item.id)); }}
								>
									<Icon.X width={12} height={12} />
								</span>
							</button>
						)}
					</div>
				</div>			
				{contextOpen && <div className="nw-context-dropdown">
					<div className="nw-context-dropdown-list">
						{contextMenu !== 'root' && <button className="nw-context-row nw-context-back" onClick={() => setContextMenu('root')}><Icon.Back width={14} height={14} /> Volver</button>}
						{contextMenu === 'root' && <>{([['codex', 'Codex'], ['chapters', 'Capítulos'], ['outlines', 'Outlines'], ['notes', 'Notas'], ['folders', 'Carpetas'], ['characters', 'Personaje']] as Array<[ContextMenu, string]>).map(([menu, label]) => <button className="nw-context-row" key={menu} onClick={() => setContextMenu(menu)}>{label}<Icon.ChevronRight width={14} height={14} /></button>)}{characterContext && <button className="nw-context-row" onClick={() => setContextMenu('impersonate')}>Impersonar<Icon.ChevronRight width={14} height={14} /></button>}<button className="nw-context-row" disabled={!activeFile} onClick={() => { refreshActiveNote(); setContextOpen(false); setContextMenu('root'); }}>{renderIcon('active-note')} Nota Activa</button></>}
						{contextMenu === 'codex' && filteredCategories.map(({ category, entries: categoryEntries }) => <section key={category.id_categoria} className="nw-context-category"><div className="nw-context-category-title">{category.nombre}</div>{categoryEntries.map(entry => <button key={entry.id_entrada_codex} className="nw-context-row nw-context-entry" onClick={() => addContext({ id: `codex:${entry.id_entrada_codex}`, kind: 'codex', name: entry.nombre, content: entry.descripcion, thumbnail: entry.thumbnail, categoryColor: entry.color ?? category.color })}><span className="nw-context-category-line" style={{ backgroundColor: entry.color ?? category.color }} />{entry.thumbnail ? <img src={entry.thumbnail} alt="" className="nw-context-entry-thumbnail" /> : <span className="nw-context-entry-thumbnail" />}{entry.nombre}</button>)}</section>)}
						{contextMenu === 'characters' && (
							<>
								{characterEntries.length > 0 ? characterEntries.map(entry => (
									<button key={entry.id_entrada_codex} className="nw-context-row nw-context-entry" onClick={() => addCharacterContext(entry)}>
										{entry.thumbnail ? <img src={entry.thumbnail} alt="" className="nw-context-entry-thumbnail" /> : <span className="nw-context-entry-thumbnail" />}
										{entry.nombre}
									</button>
								)) : <span className="nw-context-row" style={{color: 'var(--text-muted)', cursor: 'default'}}>No hay personajes disponibles.</span>}
							</>
						)}
						{contextMenu === 'impersonate' && (
							<>
								{characterEntries.length > 0 ? characterEntries.map(entry => (
									<button key={entry.id_entrada_codex} className="nw-context-row nw-context-entry" onClick={() => addImpersonateContext(entry)}>
										{entry.thumbnail ? <img src={entry.thumbnail} alt="" className="nw-context-entry-thumbnail" /> : <span className="nw-context-entry-thumbnail" />}
										{entry.nombre}
									</button>
								)) : <span className="nw-context-row" style={{color: 'var(--text-muted)', cursor: 'default'}}>No hay personajes disponibles.</span>}
							</>
						)}
						{contextMenu === 'chapters' && filteredChapters.filter(chapter => !!chapter.archivo).map(chapter => <button key={chapter.id_capitulo} className="nw-context-row" onClick={() => void selectChapter(chapter.id_capitulo)}>{renderIcon('chapter')}{chapter.nombre}</button>)}
						{contextMenu === 'outlines' && filteredChapters.map(chapter => <button key={chapter.id_capitulo} className="nw-context-row" onClick={() => selectOutline(chapter.id_capitulo)}>{renderIcon('outline')}{chapter.nombre}</button>)}
						{contextMenu === 'notes' && filteredNotes.map(file => <button key={file.path} className="nw-context-row nw-context-file" onClick={() => void addFileContext(file, 'note')}>{renderIcon('note')}<span>{file.basename}<small>{file.path}</small></span></button>)}
						{contextMenu === 'folders' && filteredFolders.map(folder => <button key={folder.path} className="nw-context-row nw-context-file" onClick={() => void addFolderContext(folder)}>{renderIcon('folder')}<span>{folder.name}<small>{folder.path}</small></span></button>)}
					</div>
					{contextMenu !== 'root' && <div className="nw-context-search"><input className="nw-input" autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Filtrar..." /></div>}
				</div>}
			</div>
			<div className="nw-chat-input">
				<textarea 
					className="nw-chat-textarea" 
					value={input} 
					onChange={e => setInput(e.target.value)} 
					onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { 
						e.preventDefault(); void send(); 
					} }} 
					placeholder={impersonateContext ? `Escribe un mensaje como ${impersonateContext.name}...` : characterContext ? `Escribe un mensaje para ${characterContext.name}...` : 'Escribe un mensaje...'} 
					rows={3} 
				/>
			</div>
			<div className="nw-chat-footer">
				<div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
					<div className="nw-chat-model-selector" key={modelVersion}>
						<span className="nw-chat-model-label" role="button" tabIndex={0} onClick={() => setModelMenuOpen(open => !open)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setModelMenuOpen(open => !open); } }}>
							{(() => { const model = plugin.settings.data.modelos.find(item => item.id_modelo === plugin.settings.data.modeloPredeterminadoId); return <>{model?.nombre_listado ?? 'Sin modelo activo'}{model?.supports_image_generation && <Icon.Paintbrush width={14} height={14} className="nw-model-image-capability" />}</>; })()}
							<Icon.ChevronDown width={14} height={14} className={modelMenuOpen ? 'nw-chat-model-chevron-open' : 'nw-chat-model-chevron-closed'} />
						</span>
						{modelMenuOpen && (
							<div className="nw-chat-model-dropdown">
								{plugin.settings.data.modelos.length ? (
									plugin.settings.data.modelos.map(model => 
										<button key={model.id_modelo} className="nw-context-row" onClick={() => {
											plugin.settings.data.modeloPredeterminadoId = model.id_modelo;
											void plugin.settings.save(); 
											setModelMenuOpen(false); 
											setModelVersion(version => version + 1);
										}}>
											{model.nombre_listado}									
											{model.supports_image_generation && (
												<Icon.Paintbrush width={14} height={14} className="nw-model-image-capability" />
											)}
										</button>
									)) : (
										<span>No hay modelos creados.</span>
									)
								}
							</div>
						)}
					</div>
					<div className="nw-chat-prompt-selector" ref={promptRef}>
						<span className="nw-chat-model-label" role="button" tabIndex={0} onClick={() => setPromptMenuOpen(open => !open)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setPromptMenuOpen(open => !open); } }}>
							{currentPrompt?.nombre ?? defaultChatPrompt?.nombre ?? 'Sin prompt'}
							<Icon.ChevronDown width={14} height={14} className={promptMenuOpen ? 'nw-chat-model-chevron-open' : 'nw-chat-model-chevron-closed'} />
						</span>
						{promptMenuOpen && (
							<div className="nw-chat-model-dropdown" style={{ left: 0, right: 'auto' }}>
								{chatPrompts.length ? chatPrompts.map(p => (
									<button key={p.id_prompt} className="nw-context-row" onClick={() => handlePromptSelect(p.id_prompt)}>
										{p.nombre}{p.id_prompt === resolvedPromptId ? <span style={{ marginLeft: 'auto', color: 'var(--text-accent)' }}><Icon.Check width={14} height={14} /></span> : null}
									</button>
								)) : <span>No hay prompts de chat.</span>}
							</div>
						)}
					</div>
				</div>
				<div style={{ display: "flex", flexDirection: "row", gap: "4px" }}>
					{characterContext && (
						<div className="nw-character-badge">
							{characterContext.thumbnail ? <img src={characterContext.thumbnail} alt="" className="nw-character-badge-thumb" /> : null}
							<span className="nw-character-badge-name">{characterContext.name}</span>
							<span className="nw-character-badge-mode">Char</span>
							<button className="nw-character-badge-remove" onClick={removeCharacterContext} title="Quitar personaje">
								<Icon.X width={12} height={12} />
							</button>
						</div>
					)}
					{impersonateContext && (
						<div className="nw-character-badge nw-impersonate-badge">
							{impersonateContext.thumbnail ? <img src={impersonateContext.thumbnail} alt="" className="nw-character-badge-thumb" /> : null}
							<span className="nw-character-badge-name">{impersonateContext.name}</span>
							<span className="nw-character-badge-mode">User</span>
							<button className="nw-character-badge-remove" onClick={removeImpersonateContext} title="Quitar personaje">
								<Icon.X width={12} height={12} />
							</button>
						</div>
					)}
				</div>
				<div style={{ display: "flex", justifyContent: "flex-end", gap: "4px"}}>
					<button className="nw-btn-link" onClick={doCreate}>
						<Icon.Plus width={12} height={12} />
					</button>
					<button className="nw-btn-link" onClick={() => new CustomPromptsModal(plugin.app as any, plugin).open()}>
						<Icon.Settings width={12} height={12}/>
					</button>
				</div>
			</div>
		</div>
	</div>;
}
