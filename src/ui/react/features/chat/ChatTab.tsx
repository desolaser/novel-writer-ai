import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Notice, TFile, TFolder, MarkdownRenderer, FuzzySuggestModal, Modal, Setting } from 'obsidian';
import { useNovelWriter } from '../../store/novelWriterStore';
import type NovelWriterPlugin from '../../../../../main';
import { ApiFactory } from '../../../../factories/api-factory';
import { Icon } from '../../components/Icon';
import { openEntryModal } from '../codex/modals/CodexEntryModal';
import { ThumbnailCropModal } from '../codex/ThumbnailCropModal';
import { getActiveModelConfig } from '../../../../infrastructure/settings/active-model';
import type { EntradaCodex, ChatContextItem, ChatContextKind } from '../../../../domain';
import { CustomPromptsModal } from "../chat/CustomPromptsModal";
import { estimateTokens } from '../../../../context/promptBuilder';
import { buildToolPrompt } from '../../../../context/toolPrompt';
import { TOOL_DEFINITIONS } from '../../../../tools/registry';
import { formatToolResults } from '../../../../utils/toolCallParsing';
import { parseToolAnswer } from '../../../../tools/parseToolAnswer';
import { useToolRunner } from './tools/useToolRunner';
import { ToolCallCard } from './tools/ToolCallCard';

type ContextKind = ChatContextKind;
type ContextItem = ChatContextItem;
type ContextMenu = 'root' | 'codex' | 'chapters' | 'outlines' | 'notes' | 'folders' | 'characters' | 'impersonate';

const extractImageUrls = (result: { images?: string[] }): string[] => result.images?.filter(url => typeof url === 'string' && url.trim()) ?? [];

/** Safety net against a model that keeps calling tools instead of answering. */
const MAX_TOOL_ROUNDS = 4;

/** Appends a compact record of what the tools did, so the chat keeps the trace. */
const composeReply = (text: string, log: string[]): string => {
	if (!log.length) return text;
	return `${text}\n\n---\n${log.map(line => `_${line}_`).join('\n')}`.trim();
};

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

/** Format a date string to YYYY-DD-MM hh:mm:ss */
function formatTimestamp(dateStr: string | undefined | null): string {
	if (!dateStr) return '';
	try {
		const d = new Date(dateStr);
		if (isNaN(d.getTime())) return '';
		const year = d.getFullYear();
		const day = String(d.getDate()).padStart(2, '0');
		const month = String(d.getMonth() + 1).padStart(2, '0');
		const hours = String(d.getHours()).padStart(2, '0');
		const minutes = String(d.getMinutes()).padStart(2, '0');
		const seconds = String(d.getSeconds()).padStart(2, '0');
		return `${year}-${day}-${month} ${hours}:${minutes}:${seconds}`;
	} catch {
		return '';
	}
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
	toolsBlock?: string,
): string {
	const groups: Array<[ContextKind, string]> = [
		['codex', 'Selected Codex entries'], ['chapter', 'Selected chapters'], ['outline', 'Selected outlines'],
		['note', 'Selected notes'], ['folder', 'Selected folders'],
	];
	const contextPrompt = groups.map(([kind, title]) => {
		const items = contextItems.filter(item => item.kind === kind);
		if (!items.length) return '';
		return `${title}:\n${items.map(item => `--- ${item.name}${item.path ? ` (${item.path})` : ''} ---\n${item.content}`).join('\n\n')}`;
	}).filter(Boolean).join('\n\n');

	// Active-note: always the currently open file, included separately
	const activeNoteBlock = activeNoteItem
		? `Active note selected:\n--- ${activeNoteItem.name}${activeNoteItem.path ? ` (${activeNoteItem.path})` : ''} ---\n${activeNoteItem.content}`
		: '';

	const history = [...mensajes, { role: 'user', mensaje: newUserMessage }]
		.filter(m => m.role === 'user' || m.role === 'assistant')
		.map(m => ({ role: m.role, content: m.mensaje }));

	let systemPrompt = '';
	if (chatPromptText) {
		systemPrompt = `${chatPromptText}\n\n`;
	}
	if (toolsBlock) {
		systemPrompt += `${toolsBlock}\n\n`;
	}
	if (characterContext) {
		systemPrompt += `[ROLE MODE: You are roleplaying the character "${characterContext.name}". Always respond IN CHARACTER, using their tone, vocabulary, knowledge and personality. Do NOT break character under any circumstances. Do NOT mention that you are an AI. You are "${characterContext.name}".]\n\nCharacter information:\n${characterContext.content}\n\n`;
	}
	if (impersonateContext) {
		systemPrompt += `[IMPERSONATE MODE: The user is roleplaying the character "${impersonateContext.name}". The user IS "${impersonateContext.name}". Treat them as if they were that character. Do NOT refer to them as "user" or "you"; call them "${impersonateContext.name}".]\n\nUser character information:\n${impersonateContext.content}\n\n`;
	}
	const userLabel = impersonateContext ? impersonateContext.name : 'User';
	const iaLabel = characterContext ? characterContext.name : 'AI';

	const combinedPrompt = [contextPrompt, activeNoteBlock].filter(Boolean).join('\n\n');
	const contextBlock = combinedPrompt ? `Context explicitly selected by the user:\n${combinedPrompt}\n\n` : '';
	const historyBlock = history ? `Current conversation:\n${history.map(m => `${m.role === 'user' ? userLabel : 'AI'}: ${m.content}`).join('\n\n')}\n\n` : '';
	return `${systemPrompt}${contextBlock}${historyBlock}\n\n${iaLabel}: `;
}

/** Modal to pick a vault folder. */
class FolderPickerModal extends FuzzySuggestModal<TFolder> {
	private onPick: (folder: TFolder) => void;
	private itemsCache: TFolder[];
	constructor(app: any, folders: TFolder[], onPick: (folder: TFolder) => void) {
		super(app);
		this.setPlaceholder('Select a folder...');
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
			.addButton(btn => btn.setButtonText('Yes').setCta().onClick(() => { this.onConfirm(); this.close(); }))
			.addButton(btn => btn.setButtonText('No').onClick(() => this.close()));
	}
	onClose() { this.contentEl.empty(); }
}

/** Modal to display the full chat context/prompt being sent to the AI. */
class ChatContextModal extends Modal {
	private prompt: string;
	private breakdown: Array<{ label: string; content: string }>;

	constructor(app: any, prompt: string, breakdown: Array<{ label: string; content: string }>) {
		super(app);
		this.prompt = prompt;
		this.breakdown = breakdown;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('options-view-container');
		this.modalEl.addClass('context-modal-large');
		contentEl.createEl('h4', { text: 'Chat Context' });

		const pre = contentEl.createEl('pre');
		pre.style.maxHeight = '40vh';
		pre.style.overflow = 'auto';
		pre.style.whiteSpace = 'pre-wrap';
		pre.style.wordBreak = 'break-word';
		pre.style.fontSize = '12px';
		pre.style.padding = '12px';
		pre.style.background = 'var(--background-secondary)';
		pre.style.borderRadius = '6px';
		pre.setText(this.prompt);

		const section = contentEl.createDiv('token-table-section');
		section.createEl('h5', { text: 'Token Breakdown' });
		const table = section.createEl('table', { cls: 'token-table' });
		const head = table.createEl('thead').createEl('tr');
		head.createEl('th', { text: 'Identifier' });
		head.createEl('th', { text: 'Tokens', cls: 'token-column' });
		const body = table.createEl('tbody');
		const rows = this.breakdown.map(({ label, content }) => [label, content] as [string, string]);
		rows.forEach(([label, value]) => {
			const row = body.createEl('tr');
			row.createEl('td', { text: label });
			row.createEl('td', { text: String(estimateTokens(value)), cls: 'token-column' });
		});
		const total = rows.reduce((sum, [, value]) => sum + estimateTokens(value), 0);
		const totalRow = body.createEl('tr', { cls: 'total-row' });
		totalRow.createEl('td', { text: 'Total' });
		totalRow.createEl('td', { text: String(total), cls: 'token-column' });

		const btnRow = contentEl.createDiv();
		btnRow.style.display = 'flex';
		btnRow.style.justifyContent = 'flex-end';
		btnRow.style.marginTop = '12px';
		btnRow.style.gap = '8px';

		const copyBtn = btnRow.createEl('button', { text: 'Copy to clipboard' });
		copyBtn.classList.add('mod-cta');
		copyBtn.onclick = () => {
			navigator.clipboard.writeText(this.prompt).then(() => {
				copyBtn.setText('Copied!');
				setTimeout(() => copyBtn.setText('Copy to clipboard'), 2000);
			});
		};

		const closeBtn = btnRow.createEl('button', { text: 'Close' });
		closeBtn.onclick = () => this.close();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
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
	const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
	const [promptMenuOpen, setPromptMenuOpen] = useState(false);
	const [currentPromptId, setCurrentPromptId] = useState<string | null>(null);
	const [uploadedImages, setUploadedImages] = useState<string[]>([]);
	const [contextModalOpen, setContextModalOpen] = useState(false);
	const scrollRef = useRef<HTMLDivElement>(null);
	const promptRef = useRef<HTMLDivElement | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const runner = useToolRunner();
	// Tool instructions cost ~800 tokens per request, so they can be switched off.
	const [toolsEnabled, setToolsEnabled] = useState(true);
	// What the model has written so far this turn, shown while the tools still run.
	const [liveText, setLiveText] = useState('');

	const markdownFiles = useMemo(() => plugin.app.vault.getMarkdownFiles(), [plugin, contextOpen]);
	const folders = useMemo(() => plugin.app.vault.getAllLoadedFiles().filter((file): file is TFolder => file instanceof TFolder), [plugin, contextOpen]);
	const activeFile = plugin.app.workspace.getActiveFile();
	const notes = useMemo(() => {
		if (!activeFile?.parent) return [];
		return markdownFiles.filter(file => file.parent?.path === activeFile.parent?.path);
	}, [activeFile?.path, markdownFiles]);

	// Load persisted context when chat changes
	useEffect(() => {
		// Switching chats abandons any tool call still waiting for approval.
		runner.reset();
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
	// Follows the live text and the tool cards too, so an approval never lands off-screen.
	useEffect(() => { scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight); }, [mensajes, liveText, runner.calls.length]);

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
		} catch (error) { new Notice(`Could not read folder ${folder.path}: ${String(error)}`); }
	};

	const addFileContext = async (file: TFile, kind: 'note') => {
		try {
			const content = await plugin.app.vault.read(file);
			addContext({ id: `${kind}:${file.path}`, kind, name: file.basename, path: file.path, content: stripFrontmatter(content) });
		} catch (error) {
			new Notice(`Could not read ${file.path}: ${String(error)}`);
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
		} catch (error) { new Notice(`Could not read the chapter: ${String(error)}`); }
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
			new Notice('✅ Content copied to clipboard.');
		} catch {
			new Notice('❌ Could not copy to clipboard.');
		}
	}, []);

	const saveAsNote = useCallback(async (text: string, msgId: string) => {
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

	/**
	 * Runs one turn: asks the model, executes any tool calls it makes and asks again
	 * with the results, until it answers without calling anything (or the round limit
	 * is hit). Returns everything the author should see as a single reply.
	 */
	const runAiTurn = useCallback(async ({ history, userText, images, chatPrompt }: {
		history: any[];
		userText: string;
		images: string[];
		chatPrompt?: string;
	}): Promise<{ text: string; images: string[]; log: string[] }> => {
		const settings = plugin.settings.data;
		const activeModel = getActiveModelConfig(settings, 'chat');
		if (!activeModel.modelName) throw new Error('Configure an active model in Settings.');
		const token = settings.apiToken[activeModel.providerId] ?? '';
		const api = new ApiFactory().createApi(activeModel.providerId, token);
		const savedModel = settings.modelos.find(model => model.id_modelo === settings.modeloPredeterminadoId);
		// Tools stay off while roleplaying: a character must not step out of persona to edit the vault.
		const toolsBlock = characterContext || !toolsEnabled
			? ''
			: buildToolPrompt(TOOL_DEFINITIONS, activeModel.options.max_tokens);

		let turns = [...history];
		let pendingUser = userText;
		setLiveText('');
		const visible: string[] = [];
		const log: string[] = [];
		let collectedImages: string[] = [];

		for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
			const prompt = buildPrompt(turns, contextItems, pendingUser, characterContext, impersonateContext, activeNoteItem, chatPrompt, toolsBlock);
			const result = await api.generateCompletion(prompt, activeModel.modelName, {
				...activeModel.options,
				stream: false,
				...(activeModel.providerId === 'openrouter' && savedModel?.supports_image_generation ? { modalities: ['image', 'text'] } : {}),
				...(round === 0 && images.length > 0 ? { images } : {}),
			});
			collectedImages = [...collectedImages, ...extractImageUrls(result)];
			const answer = result.text ?? '';
			const parsed = toolsBlock ? parseToolAnswer(answer, `r${round}`) : { text: answer, calls: [] };
			if (parsed.text) {
				visible.push(parsed.text);
				// Show it now: a write tool is about to ask for approval and the author
				// needs to read why before deciding.
				setLiveText(visible.join('\n\n'));
			}
			if (!parsed.calls.length) break;
			if (round === MAX_TOOL_ROUNDS) {
				log.push(`Stopped after ${MAX_TOOL_ROUNDS} rounds of tool calls.`);
				break;
			}
			const results = await runner.runCalls(parsed.calls);
			results.forEach(item => log.push(`${item.ok ? 'ok' : 'failed'}: ${item.name}`));
			turns = [...turns, { role: 'user', mensaje: pendingUser }, { role: 'assistant', mensaje: parsed.text || '(tool call)' }];
			pendingUser = formatToolResults(results);
		}
		return { text: visible.join('\n\n').trim(), images: collectedImages, log };
	}, [plugin, contextItems, characterContext, impersonateContext, activeNoteItem, runner, toolsEnabled]);

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
		const currentUploadedImagesRegen = [...uploadedImages];
		setUploadedImages([]);
		setBusy(true);
		runner.reset();
		setLiveText('');
		try {
			// The last user message is handed to buildPrompt separately, so it must not
			// stay in the history as well or the model sees it twice.
			const cut = newMsgs.findIndex(m => m.id_mensaje === lastUserMsg!.id_mensaje);
			const turn = await runAiTurn({
				history: cut >= 0 ? newMsgs.slice(0, cut) : newMsgs,
				userText: lastUserMsg.mensaje,
				images: currentUploadedImagesRegen,
				chatPrompt: chatPromptText,
			});
			const reply = composeReply(turn.text, turn.log) || (turn.images.length ? '' : '(no response)');
			await appendMensaje('assistant', reply, turn.images);
			setMensajes(m => [...m, { id_mensaje: 'tmp_a', role: 'assistant', mensaje: reply, imagenes: turn.images, created_at: '' }]);
		} catch (e: any) {
			const err = 'Error: ' + (e?.message ?? String(e));
			await appendMensaje('assistant', err);
			setMensajes(m => [...m, { id_mensaje: 'tmp_e', role: 'assistant', mensaje: err, created_at: '' }]);
		}
		setBusy(false);
	}, [store, activeChatId, contextItems, characterContext, impersonateContext, activeNoteItem, plugin, appendMensaje, deleteMensaje]);

	const doCreate = async () => {
		const c = await createChat("Unnamed chat");
		selectChat(c.id_chat);
		new Notice('New chat created');
	};

	const send = async () => {
		const t = input.trim();
		if (!t) return;
		let chatId = activeChatId;
		if (!chatId) {
			const created = await createChat('Unnamed chat');
			if (!created) return;
			chatId = created.id_chat;
			// Persist current context to the new chat before selecting it,
			// so the effect that loads the chat file picks up the context.
			await saveChatContext(chatId, contextItems, characterContext, impersonateContext);
			selectChat(chatId);
		}
		const currentUploadedImages = [...uploadedImages];
		setInput('');
		setUploadedImages([]);
		await appendMensaje('user', t, currentUploadedImages.length > 0 ? currentUploadedImages : undefined);
		setMensajes(m => [...m, { id_mensaje: 'tmp_u', role: 'user', mensaje: t, imagenes: currentUploadedImages.length > 0 ? currentUploadedImages : undefined, created_at: '' }]);
		setBusy(true);
		runner.reset();
		setLiveText('');
		try {
			const turn = await runAiTurn({ history: mensajes, userText: t, images: currentUploadedImages, chatPrompt: chatPromptText });
			const reply = composeReply(turn.text, turn.log) || (turn.images.length ? '' : '(no response)');
			await appendMensaje('assistant', reply, turn.images);
			setMensajes(m => [...m, { id_mensaje: 'tmp_a', role: 'assistant', mensaje: reply, imagenes: turn.images, created_at: '' }]);
		} catch (e: any) {
			const err = 'Error: ' + (e?.message ?? String(e));
			await appendMensaje('assistant', err);
			setMensajes(m => [...m, { id_mensaje: 'tmp_e', role: 'assistant', mensaje: err, created_at: '' }]);
		}
		setBusy(false);
	};

	const closeImageDropdown = useCallback(() => setImageDropdown(null), []);

	const supportsVision = useMemo(() => {
		const model = plugin.settings.data.modelos.find(item => item.id_modelo === plugin.settings.data.modeloPredeterminadoId);
		return model?.supports_vision ?? false;
	}, [plugin, modelVersion]);

	const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
		const files = e.target.files;
		if (!files) return;
		const readers: Promise<string>[] = [];
		for (let i = 0; i < files.length; i++) {
			const file = files[i];
			if (!file.type.startsWith('image/')) continue;
			readers.push(new Promise<string>((resolve) => {
				const reader = new FileReader();
				reader.onload = () => resolve(reader.result as string);
				reader.readAsDataURL(file);
			}));
		}
		void Promise.all(readers).then(urls => {
			setUploadedImages(prev => [...prev, ...urls]);
		});
		if (fileInputRef.current) fileInputRef.current.value = '';
	}, []);

	const removeUploadedImage = useCallback((index: number) => {
		setUploadedImages(prev => prev.filter((_, i) => i !== index));
	}, []);

	const clearUploadedImages = useCallback(() => setUploadedImages([]), []);

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

	// Paste handler for clipboard images (Ctrl+V) — only when textarea is focused
	useEffect(() => {
		const handler = (e: ClipboardEvent) => {
			if (!supportsVision) return;
			if (document.activeElement !== textareaRef.current) return;
			const items = e.clipboardData?.items;
			if (!items) return;
			for (let i = 0; i < items.length; i++) {
				const item = items[i];
				if (item.type.startsWith('image/')) {
					e.preventDefault();
					const blob = item.getAsFile();
					if (!blob) continue;
					const reader = new FileReader();
					reader.onload = () => {
						setUploadedImages(prev => [...prev, reader.result as string]);
					};
					reader.readAsDataURL(blob);
					break;
				}
			}
		};
		document.addEventListener('paste', handler);
		return () => document.removeEventListener('paste', handler);
	}, [supportsVision]);

	const chatPrompts = getCustomPrompts().filter(p => p.tipo === 'chat');
	const defaultChatPrompt = getDefaultChatPrompt();
	const resolvedPromptId = currentPromptId || defaultChatPrompt?.id_prompt || null;
	const currentPrompt = chatPrompts.find(p => p.id_prompt === resolvedPromptId);
	const chatPromptText = currentPrompt?.texto;

	const openContextModal = useCallback(() => {
		// Mirrors what a real request sends, tool instructions included.
		const previewModel = getActiveModelConfig(plugin.settings.data, 'chat');
		const toolsBlock = characterContext || !toolsEnabled
			? ''
			: buildToolPrompt(TOOL_DEFINITIONS, previewModel.options.max_tokens);
		const prompt = buildPrompt(mensajes, contextItems, '', characterContext, impersonateContext, activeNoteItem, chatPromptText, toolsBlock);

		// Compute breakdown parts matching buildPrompt internals
		const groups: Array<[ContextKind, string]> = [
			['codex', 'Selected Codex entries'], ['chapter', 'Selected chapters'], ['outline', 'Selected outlines'],
			['note', 'Selected notes'], ['folder', 'Selected folders'],
		];
		const contextPrompt = groups.map(([kind, title]) => {
			const items = contextItems.filter(item => item.kind === kind);
			if (!items.length) return '';
			return `${title}:\n${items.map(item => `--- ${item.name}${item.path ? ` (${item.path})` : ''} ---\n${item.content}`).join('\n\n')}`;
		}).filter(Boolean).join('\n\n');

		const activeNoteBlock = activeNoteItem
			? `Active note selected:\n--- ${activeNoteItem.name}${activeNoteItem.path ? ` (${activeNoteItem.path})` : ''} ---\n${activeNoteItem.content}`
			: '';

		let systemPrompt = '';
		if (chatPromptText) {
			systemPrompt = `${chatPromptText}\n\n`;
		}
		if (characterContext) {
			systemPrompt += `[ROLE MODE: You are roleplaying the character "${characterContext.name}". Always respond IN CHARACTER, using their tone, vocabulary, knowledge and personality. Do NOT break character under any circumstances. Do NOT mention that you are an AI. You are "${characterContext.name}".]\n\nCharacter information:\n${characterContext.content}\n\n`;
		}
		if (impersonateContext) {
			systemPrompt += `[IMPERSONATE MODE: The user is roleplaying the character "${impersonateContext.name}". The user IS "${impersonateContext.name}". Treat them as if they were that character. Do NOT refer to them as "user" or "you"; call them "${impersonateContext.name}".]\n\nUser character information:\n${impersonateContext.content}\n\n`;
		}

		const userLabel = impersonateContext ? impersonateContext.name : 'User';
		const chatHistory = mensajes
			.filter(m => m.role === 'user' || m.role === 'assistant')
			.map(m => `${m.role === 'user' ? userLabel : 'AI'}: ${m.mensaje}`)
			.join('\n\n');

		const breakdown = [
			{ label: 'System Prompt', content: systemPrompt },
			{ label: 'Selected Context', content: contextPrompt },
			{ label: 'Active Note Block', content: activeNoteBlock },
			{ label: 'Chat History', content: chatHistory },
		];

		new ChatContextModal(plugin.app, prompt, breakdown).open();
	}, [mensajes, contextItems, characterContext, impersonateContext, activeNoteItem, chatPromptText, plugin, toolsEnabled]);

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
					new Notice(`⚠️ A file already exists at ${filePath}`);
					return;
				}
				await plugin.app.vault.createBinary(filePath, buf);
				new Notice(`✅ Image saved to ${filePath}`);
				closeImageDropdown();
			} catch (e: any) {
				new Notice(`❌ Error saving: ${e?.message ?? String(e)}`);
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
					new Notice(`✅ Image added as thumbnail for "${entryName}"`);
					closeImageDropdown();
				})();
			} else {
				// Not square – show crop modal
				new ThumbnailCropModal(plugin.app, dataUrl, async (croppedDataUrl) => {
					await setEntryThumbnail(entryId, croppedDataUrl);
					new Notice(`✅ Image added as thumbnail for "${entryName}"`);
					closeImageDropdown();
				}).open();
			}
		};
		img.onerror = () => {
			new Notice('❌ Could not load the image for cropping.');
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
			new ConfirmModal(plugin.app, `Are you sure you want to replace the thumbnail for "${entry.nombre}"?`, () => doSet(dataUrl)).open();
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

	const personajeCategory = categorias.find(c => c.nombre.toLocaleLowerCase() === 'characters');
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
					<p>Start a conversation with the AI.</p>
					{!activeChatId && <p className="nw-chat-empty-hint">Write a message to create a new chat.</p>}
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
							) : 'You'
						) : (
							characterContext ? (
								<span className="nw-msg-role-character">
									{characterContext.thumbnail ? <img src={characterContext.thumbnail} alt="" className="nw-msg-role-thumb" /> : <Icon.Person width={20} height={20} />}
									<span>{characterContext.name}</span>
								</span>
							) : 'AI'
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
									<button className="nw-btn nw-btn-primary" onClick={() => void saveEditedMessage(m.id_mensaje)}>Save</button>
									<button className="nw-btn" onClick={cancelEdit}>Cancel</button>
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
								<img src={url} alt={`Generated image ${index + 1}`} onClick={() => setLightboxSrc(url)} style={{ cursor: 'pointer' }} />
								<div className="nw-msg-image-actions">
									<button className="nw-msg-image-download-btn" title="Image options" onClick={() => setImageDropdown(prev => prev?.index === index ? null : { index, searchQuery: '' })}>
										<Icon.Download width={14} height={14} />
									</button>
									{imageDropdown?.index === index && (
										<div className="nw-image-menu-dropdown">
											<button className="nw-context-row" onClick={() => downloadImage(url, `imagen-${index + 1}`)}>
												<Icon.Download width={14} height={14} /> Download
											</button>
											<button className="nw-context-row" onClick={() => { void saveImageToVault(url, `imagen-${index + 1}`); }}>
												<Icon.Save width={14} height={14} /> Save to Vault
											</button>
											<div className="nw-image-menu-codex-section">
												<div className="nw-image-menu-codex-header">Add to Codex entry</div>
												<input
													className="nw-input"
													placeholder="Search..."
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
													{imageCodexCategories.length === 0 && <span className="nw-image-menu-empty">No entries found.</span>}
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
							<button className="nw-msg-action-btn" title="Edit" onClick={() => startEditMessage(m.id_mensaje, m.mensaje)}>
								<Icon.Edit width={13} height={13} />
							</button>
							<button className="nw-msg-action-btn" title="Copy to clipboard" onClick={() => void copyToClipboard(m.mensaje)}>
								<Icon.Copy width={13} height={13} />
							</button>
							{m.role === 'assistant' && (
								<>
									<button className="nw-msg-action-btn" title="Regenerate" onClick={() => void regenerateMessage()}>
										<Icon.Refresh width={13} height={13} />
									</button>
									<button className="nw-msg-action-btn" title="Save as note" onClick={() => void saveAsNote(m.mensaje, m.id_mensaje)}>
										<Icon.SaveAlt width={13} height={13} />
									</button>
								</>
							)}
							<button className="nw-msg-action-btn nw-msg-action-delete" title="Delete message" onClick={() => void handleDeleteMessage(m.id_mensaje)}>
								<Icon.X width={13} height={13} />
							</button>
						</div>
					)}
					{m.created_at && (
						<div className="nw-msg-timestamp">{formatTimestamp(m.created_at)}</div>
					)}
				</div>
			))}
			{busy && liveText && (
				<div className="nw-msg nw-msg-assistant nw-msg-live">
					<MarkdownBlock plugin={plugin} content={liveText} />
				</div>
			)}
			{runner.calls.length > 0 && (
				<div className="nw-tool-calls">
					{runner.calls.map(state => (
						<ToolCallCard key={state.call.id} state={state} onApprove={runner.approve} onReject={runner.reject} />
					))}
				</div>
			)}
			{busy && !runner.awaiting && <div className="nw-msg nw-msg-assistant"><em>...typing...</em></div>}
		</div>
		<div className='nw-chat-input-container'>
			<div className="nw-chat-context-bar">
				<div style={{ display: "flex", gap: "4px" }}>
					<button className="nw-btn-link nw-btn-small nw-chat-context-trigger" onClick={() => { setContextOpen(open => !open); setContextMenu('root'); setQuery(''); }}>@</button>
					<div className="nw-context-badges">			
						{activeNoteItem && 
							<button key={activeNoteItem.id} className={`nw-context-badge nw-context-badge-${activeNoteItem.kind}`} onClick={() => void openContextItem(activeNoteItem)} title={`Open ${activeNoteItem.name}`}>
								{renderIcon(activeNoteItem.kind)}<span>{activeNoteItem.name}</span><span className="nw-context-badge-remove" role="button" aria-label={`Remove ${activeNoteItem.name}`} onClick={event => { event.stopPropagation(); removeActiveNote(); }}><Icon.X width={12} height={12} /></span>
							</button>
						}
						{contextItems.map(item => 
							<button 
								key={item.id} 
								className={`nw-context-badge nw-context-badge-${item.kind}`} 
								onClick={() => void openContextItem(item)} 
								title={`Open ${item.name}`}
							>
								{item.kind === 'codex' && item.thumbnail
									? <img src={item.thumbnail} alt="" /> 
									: renderIcon(item.kind)}
								<span>{item.name}</span>
								<span 
									className="nw-context-badge-remove" 
									role="button" 
									aria-label={`Remove ${item.name}`}
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
						{contextMenu !== 'root' && <button className="nw-context-row nw-context-back" onClick={() => setContextMenu('root')}><Icon.Back width={14} height={14} /> Back</button>}
						{contextMenu === 'root' && <>{([['codex', 'Codex'], ['chapters', 'Chapters'], ['outlines', 'Outlines'], ['notes', 'Notes'], ['folders', 'Folders'], ['characters', 'Character']] as Array<[ContextMenu, string]>).map(([menu, label]) => <button className="nw-context-row" key={menu} onClick={() => setContextMenu(menu)}>{label}<Icon.ChevronRight width={14} height={14} /></button>)}{characterContext && <button className="nw-context-row" onClick={() => setContextMenu('impersonate')}>Impersonate<Icon.ChevronRight width={14} height={14} /></button>}<button className="nw-context-row" disabled={!activeFile} onClick={() => { refreshActiveNote(); setContextOpen(false); setContextMenu('root'); }}>{renderIcon('active-note')} Active Note</button></>}
						{contextMenu === 'codex' && filteredCategories.map(({ category, entries: categoryEntries }) => <section key={category.id_categoria} className="nw-context-category"><div className="nw-context-category-title">{category.nombre}</div>{categoryEntries.map(entry => <button key={entry.id_entrada_codex} className="nw-context-row nw-context-entry" onClick={() => addContext({ id: `codex:${entry.id_entrada_codex}`, kind: 'codex', name: entry.nombre, content: entry.descripcion, thumbnail: entry.thumbnail, categoryColor: entry.color ?? category.color })}><span className="nw-context-category-line" style={{ backgroundColor: entry.color ?? category.color }} />{entry.thumbnail ? <img src={entry.thumbnail} alt="" className="nw-context-entry-thumbnail" /> : <span className="nw-context-entry-thumbnail" />}{entry.nombre}</button>)}</section>)}
						{contextMenu === 'characters' && (
							<>
								{characterEntries.length > 0 ? characterEntries.map(entry => (
									<button key={entry.id_entrada_codex} className="nw-context-row nw-context-entry" onClick={() => addCharacterContext(entry)}>
										{entry.thumbnail ? <img src={entry.thumbnail} alt="" className="nw-context-entry-thumbnail" /> : <span className="nw-context-entry-thumbnail" />}
										{entry.nombre}
									</button>
								)) : <span className="nw-context-row" style={{color: 'var(--text-muted)', cursor: 'default'}}>No characters available.</span>}
							</>
						)}
						{contextMenu === 'impersonate' && (
							<>
								{characterEntries.length > 0 ? characterEntries.map(entry => (
									<button key={entry.id_entrada_codex} className="nw-context-row nw-context-entry" onClick={() => addImpersonateContext(entry)}>
										{entry.thumbnail ? <img src={entry.thumbnail} alt="" className="nw-context-entry-thumbnail" /> : <span className="nw-context-entry-thumbnail" />}
										{entry.nombre}
									</button>
								)) : <span className="nw-context-row" style={{color: 'var(--text-muted)', cursor: 'default'}}>No characters available.</span>}
							</>
						)}
						{contextMenu === 'chapters' && filteredChapters.filter(chapter => !!chapter.archivo).map(chapter => <button key={chapter.id_capitulo} className="nw-context-row" onClick={() => void selectChapter(chapter.id_capitulo)}>{renderIcon('chapter')}{chapter.nombre}</button>)}
						{contextMenu === 'outlines' && filteredChapters.map(chapter => <button key={chapter.id_capitulo} className="nw-context-row" onClick={() => selectOutline(chapter.id_capitulo)}>{renderIcon('outline')}{chapter.nombre}</button>)}
						{contextMenu === 'notes' && filteredNotes.map(file => <button key={file.path} className="nw-context-row nw-context-file" onClick={() => void addFileContext(file, 'note')}>{renderIcon('note')}<span>{file.basename}<small>{file.path}</small></span></button>)}
						{contextMenu === 'folders' && filteredFolders.map(folder => <button key={folder.path} className="nw-context-row nw-context-file" onClick={() => void addFolderContext(folder)}>{renderIcon('folder')}<span>{folder.name}<small>{folder.path}</small></span></button>)}
					</div>
					{contextMenu !== 'root' && <div className="nw-context-search"><input className="nw-input" autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Filter..." /></div>}
				</div>}
			</div>
			<div className="nw-chat-input">
				<textarea 
					ref={textareaRef}
					className="nw-chat-textarea" 
					value={input} 
					onChange={e => setInput(e.target.value)} 
					onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { 
						e.preventDefault(); void send(); 
					} }} 
					placeholder={impersonateContext ? `Write a message as ${impersonateContext.name}...` : characterContext ? `Write a message to ${characterContext.name}...` : 'Write a message...'}
					rows={3} 
				/>
			</div>
			{uploadedImages.length > 0 && (
				<div className="nw-chat-uploaded-images">
					{uploadedImages.map((url, index) => (
						<div key={index} className="nw-chat-uploaded-image-wrapper">
							<img src={url} alt={`Uploaded image ${index + 1}`} className="nw-chat-uploaded-image-thumb" />
							<button className="nw-chat-uploaded-image-remove" title="Remove image" onClick={() => removeUploadedImage(index)}>
								<Icon.X width={10} height={10} />
							</button>
						</div>
					))}
				</div>
			)}
			<div className="nw-chat-footer">
				<div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
					<label
						className="nw-chat-tools-toggle"
						title={characterContext
							? 'Tools are disabled while roleplaying a character'
							: 'Let the AI read and edit chapters, outlines and codex entries'}
					>
						<input
							type="checkbox"
							checked={toolsEnabled && !characterContext}
							disabled={!!characterContext}
							onChange={event => setToolsEnabled(event.target.checked)}
						/>
						Tools
					</label>
					<div className="nw-chat-model-selector" key={modelVersion}>
						<span className="nw-chat-model-label" role="button" tabIndex={0} onClick={() => setModelMenuOpen(open => !open)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setModelMenuOpen(open => !open); } }}>
							{(() => { const model = plugin.settings.data.modelos.find(item => item.id_modelo === plugin.settings.data.modeloPredeterminadoId); return <>{model?.nombre_listado ?? 'No active model'}{model?.supports_image_generation && <Icon.Paintbrush width={14} height={14} className="nw-model-image-capability" />}{model?.supports_vision && <Icon.Eye width={14} height={14} className="nw-model-image-capability" />}</>; })()}
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
											{model.supports_vision && (
												<Icon.Eye width={14} height={14} className="nw-model-image-capability" />
											)}
										</button>
									)) : (
										<span>No models created.</span>
									)
								}
							</div>
						)}
					</div>
					<div className="nw-chat-prompt-selector" ref={promptRef}>
						<span className="nw-chat-model-label" role="button" tabIndex={0} onClick={() => setPromptMenuOpen(open => !open)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setPromptMenuOpen(open => !open); } }}>
							{currentPrompt?.nombre ?? defaultChatPrompt?.nombre ?? 'No prompt'}
							<Icon.ChevronDown width={14} height={14} className={promptMenuOpen ? 'nw-chat-model-chevron-open' : 'nw-chat-model-chevron-closed'} />
						</span>
						{promptMenuOpen && (
							<div className="nw-chat-model-dropdown" style={{ left: 0, right: 'auto' }}>
								{chatPrompts.length ? chatPrompts.map(p => (
									<button key={p.id_prompt} className="nw-context-row" onClick={() => handlePromptSelect(p.id_prompt)}>
										{p.nombre}{p.id_prompt === resolvedPromptId ? <span style={{ marginLeft: 'auto', color: 'var(--text-accent)' }}><Icon.Check width={14} height={14} /></span> : null}
									</button>
								)) : <span>No chat prompts.</span>}
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
							<button className="nw-character-badge-remove" onClick={removeCharacterContext} title="Remove character">
								<Icon.X width={12} height={12} />
							</button>
						</div>
					)}
					{impersonateContext && (
						<div className="nw-character-badge nw-impersonate-badge">
							{impersonateContext.thumbnail ? <img src={impersonateContext.thumbnail} alt="" className="nw-character-badge-thumb" /> : null}
							<span className="nw-character-badge-name">{impersonateContext.name}</span>
							<span className="nw-character-badge-mode">User</span>
							<button className="nw-character-badge-remove" onClick={removeImpersonateContext} title="Remove character">
								<Icon.X width={12} height={12} />
							</button>
						</div>
					)}
				</div>
				<div style={{ display: "flex", justifyContent: "flex-end", gap: "4px"}}>
					{supportsVision && (
						<button className="nw-btn-link" title="Upload image" onClick={() => fileInputRef.current?.click()}>
							<Icon.Upload width={12} height={12} />
						</button>
					)}
					<button className="nw-btn-link" title="View context" onClick={openContextModal}>
						<Icon.Book width={12} height={12} />
					</button>
					<button className="nw-btn-link" title="New chat" onClick={doCreate}>
						<Icon.Plus width={12} height={12} />
					</button>
					<button className="nw-btn-link" title="Prompt settings" onClick={() => new CustomPromptsModal(plugin.app as any, plugin).open()}>
						<Icon.Settings width={12} height={12}/>
					</button>
				</div>
			</div>
		</div>
		<input
			type="file"
			ref={fileInputRef}
			style={{ display: 'none' }}
			accept="image/*"
			multiple
			onChange={handleImageUpload}
		/>
		{lightboxSrc && createPortal(
			<div className="nw-lightbox-overlay" onClick={() => setLightboxSrc(null)}>
				<div className="nw-lightbox-content" onClick={(e) => e.stopPropagation()}>
					<button className="nw-lightbox-close" onClick={() => setLightboxSrc(null)} title="Close">
						<Icon.X width={24} height={24} />
					</button>
					<img src={lightboxSrc} alt="Full-size image" className="nw-lightbox-image" />
				</div>
			</div>,
			document.body
		)}
	</div>;
}
