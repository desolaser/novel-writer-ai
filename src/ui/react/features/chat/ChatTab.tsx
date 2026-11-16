import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Notice } from 'obsidian';
import { useNovelWriter } from '../../store/novelWriterStore';
import type NovelWriterPlugin from '../../../../../main';
import { Icon } from '../../components/Icon';
import { resolvePlaceholders } from '../../../../utils/roleplayPlaceholders';
import { getActiveModelConfig } from '../../../../infrastructure/settings/active-model';
import { CustomPromptsModal } from "../chat/CustomPromptsModal";
import { buildToolPrompt } from '../../../../context/toolPrompt';
import { availableTools } from '../../../../tools/registry';
import { MessageContent } from './MessageContent';
import { UndoAnswerButton } from './tools/UndoAnswerButton';
import { ChatLiveTurn } from './ChatLiveTurn';
import { generateChatName } from '../../../../utils/chatNameGeneration';
import { formatTimestamp } from './chatFormatting';
import { kindIcon } from './chatContextHelpers';
import { buildPrompt, buildPromptBreakdown } from './promptBuilder';
import { ChatContextModal } from './modals/ChatContextModal';
import { useChatContext, type ContextMenu } from './hooks/useChatContext';
import { useChatMessages } from './hooks/useChatMessages';
import { useChatImages } from './hooks/useChatImages';
import { ChatModelSelector } from './ChatModelSelector';
import { useChatModel } from './hooks/useChatModel';
import { useStoryBible } from './hooks/useStoryBible';
import { useChatSession, sessionFor } from './session/useChatSession';
import { createChatCompletion, chatOutputLimit } from './session/chatCompletion';
import type { ChatTurnConfig } from './session/ChatSession';

export function ChatTab({ plugin }: { plugin: NovelWriterPlugin }) {
	const {
		activeChatId,
		selectChat,
		appendMensaje,
		createChat,
		renameChat,
		store,
		categorias,
		entradas,
		capitulos,
		actos,
		setSidebarTab,
		setEntryThumbnail,
		updateMensaje,
		deleteMensaje,
		saveChatContext,
		getCustomPrompts,
		getDefaultChatPrompt,
	} = useNovelWriter();
	const [input, setInput] = useState('');
	const [promptMenuOpen, setPromptMenuOpen] = useState(false);
	const scrollRef = useRef<HTMLDivElement>(null);
	const promptRef = useRef<HTMLDivElement | null>(null);
	// Tool instructions cost ~800 tokens per request, so they can be switched off.
	const [toolsEnabled, setToolsEnabled] = useState(true);
	const [autoApprove, setAutoApprove] = useState(plugin.settings.data.chatAutoApproveWrites);
	// The turn lives in the chat's session, not here: leaving the tab keeps it running.
	const { session, snapshot } = useChatSession(plugin, activeChatId);
	const busy = snapshot.status !== 'idle';

	const messages = useChatMessages({
		plugin, store, activeChatId, version: snapshot.version, updateMensaje, deleteMensaje,
	});

	const bible = useStoryBible({ store, activeChatId });

	const appendCharacterOpeningMessage = useCallback(async (text: string) => {
		await appendMensaje('assistant', text);
		await messages.reload();
	}, [appendMensaje, messages.reload]);

	const chatContext = useChatContext({
		plugin, store, activeChatId, mensajesCount: messages.mensajes.length, capitulos, actos, categorias, entradas,
		setSidebarTab, saveChatContext, onCharacterOpeningMessage: appendCharacterOpeningMessage,
	});

	// Follows the live text and the tool cards too, so an approval never lands off-screen.
	useEffect(() => {
		scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
	}, [messages.mensajes, snapshot.calls, snapshot.liveText, snapshot.status]);

	/** Full bible normally; while roleplaying, only the language of the story. */
	const activeStoryBible = !bible.bibleEnabled ? '' : chatContext.characterContext ? bible.roleplayLanguage : bible.storyBible;

	/** Names for {{user}} / {{char}}, re-read on every render so they follow the personas. */
	const roleplayNames = { user: chatContext.impersonateContext?.name, char: chatContext.characterContext?.name };
	const resolveText = (text: string) => resolvePlaceholders(text ?? '', roleplayNames);

	const chatModel = useChatModel(plugin.settings);
	const supportsVision = chatModel.profile?.supports_vision ?? false;

	const images = useChatImages({ plugin, categorias, entradas, setSidebarTab, setEntryThumbnail, supportsVision });

	/**
	 * Everything the turn needs, captured now: the context and prompt chosen
	 * when the author pressed send stay in force until the AI finishes.
	 */
	/** Tools the author left on in Settings. */
	const enabledTools = () => availableTools({
		groups: plugin.settings.data.chatToolGroups,
		noteAccess: plugin.settings.data.chatNoteAccess,
		canGenerateImages: Boolean(plugin.settings.data.imageModelId),
	});

	const buildTurnConfig = (): ChatTurnConfig | null => {
		let complete: ChatTurnConfig['complete'];
		try {
			complete = createChatCompletion(plugin);
		} catch (error: any) {
			new Notice(error?.message ?? String(error));
			return null;
		}
		// Tools stay off while roleplaying: a character must not step out of persona to edit the vault.
		const withTools = toolsEnabled && !chatContext.characterContext;
		const tools = withTools ? enabledTools() : [];
		const toolsBlock = tools.length
			? buildToolPrompt(tools, chatOutputLimit(plugin))
			: '';
		const {
			contextItems, characterContext, impersonateContext, activeNoteItem,
		} = chatContext;
		const promptText = chatPromptText;
		const template = currentPrompt?.plantilla;
		const bibleText = activeStoryBible;
		return {
			toolsEnabled: tools.length > 0,
			tools,
			complete,
			buildPrompt: (turns, pending) => buildPrompt(
				turns, contextItems, pending, characterContext, impersonateContext,
				activeNoteItem, promptText, toolsBlock, bibleText, template,
			),
		};
	};

	const regenerateMessage = async () => {
		if (!session || busy) return;
		const config = buildTurnConfig();
		if (!config) return;
		await session.regenerate(config);
	};

	const doCreate = async () => {
		const c = await createChat("Unnamed chat");
		if (!c) return;
		selectChat(c.id_chat);
		new Notice('New chat created');
	};

	const send = async () => {
		const t = input.trim();
		if (!t) return;
		if (busy) {
			new Notice('The AI is still working on this chat. Stop it or wait for it to finish.');
			return;
		}
		const config = buildTurnConfig();
		if (!config) return;
		let chatId = activeChatId;
		const isFirstUserMessage = !messages.mensajes.some(m => m.role === 'user');
		if (!chatId) {
			const created = await createChat('Unnamed chat');
			if (!created) return;
			chatId = created.id_chat;
			await saveChatContext(chatId, chatContext.contextItems, chatContext.characterContext, chatContext.impersonateContext);
			selectChat(chatId);
		}
		const target = sessionFor(plugin, chatId);
		if (!target) return;
		const currentUploadedImages = [...images.uploadedImages];
		setInput('');
		images.setUploadedImages([]);
		if (isFirstUserMessage) {
			const strategy = plugin.settings.data.chatNameGeneration ?? 'active_model';
			const named = chatId;
			void generateChatName(t, strategy, plugin).then(name => renameChat(named, name));
		}
		await target.send(t, currentUploadedImages, config);
	};

	const toggleAutoApprove = (value: boolean) => {
		setAutoApprove(value);
		plugin.settings.data.chatAutoApproveWrites = value;
		void plugin.settings.save();
	};

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
	const resolvedPromptId = messages.currentPromptId || defaultChatPrompt?.id_prompt || null;
	const currentPrompt = chatPrompts.find(p => p.id_prompt === resolvedPromptId);
	const chatPromptText = currentPrompt?.texto;
	const chatTemplate = currentPrompt?.plantilla;

	const openContextModal = useCallback(() => {
		if (chatModel.error) {
			new Notice(chatModel.error);
			return;
		}
		// Mirrors what a real request sends, tool instructions included.
		const previewModel = getActiveModelConfig(plugin.settings.data, 'chat');
		const toolsBlock = chatContext.characterContext || !toolsEnabled
			? ''
			: buildToolPrompt(enabledTools(), previewModel.options.max_tokens);
		const { prompt, breakdown } = buildPromptBreakdown(
			messages.mensajes, chatContext.contextItems, '', chatContext.characterContext, chatContext.impersonateContext,
			chatContext.activeNoteItem, chatPromptText, toolsBlock,
			activeStoryBible, chatTemplate,
		);
		new ChatContextModal(plugin.app, prompt, breakdown).open();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [messages.mensajes, chatContext.contextItems, chatContext.characterContext, chatContext.impersonateContext, chatContext.activeNoteItem, chatPromptText, chatTemplate, plugin, toolsEnabled, activeStoryBible, chatModel.error]);

	const handlePromptSelect = async (promptId: string) => {
		messages.setCurrentPromptId(promptId);
		setPromptMenuOpen(false);
	};

	return <div className="nw-chat">
		<div className="nw-chat-messages" ref={scrollRef}>
			{messages.mensajes.length === 0 && !busy && (
				<div className="nw-chat-empty">
					<p>Start a conversation with the AI.</p>
					{!activeChatId && <p className="nw-chat-empty-hint">Write a message to create a new chat.</p>}
				</div>
			)}
			{messages.mensajes
				// The answer in progress is drawn live below, with its approval buttons.
				.filter(m => !(busy && m.id_mensaje === snapshot.turnMessageId))
				.map(m => (
				<div key={m.id_mensaje} className={`nw-msg nw-msg-${m.role}${messages.editingMsgId === m.id_mensaje ? ' nw-msg-editing' : ''}`}>
					<div className="nw-msg-role">
						{m.role === 'user' ? (
							chatContext.impersonateContext ? (
								<span className="nw-msg-role-character nw-msg-role-impersonate">
									{chatContext.impersonateContext.thumbnail ? <img src={chatContext.impersonateContext.thumbnail} alt="" className="nw-msg-role-thumb" title={`Edit ${chatContext.impersonateContext.name}`} onClick={() => chatContext.openCharacterEntry(chatContext.impersonateContext!)} /> : <Icon.Person width={20} height={20} />}
									<span>{chatContext.impersonateContext.name}</span>
								</span>
							) : 'You'
						) : (
							chatContext.characterContext ? (
								<span className="nw-msg-role-character">
									{chatContext.characterContext.thumbnail ? <img src={chatContext.characterContext.thumbnail} alt="" className="nw-msg-role-thumb" title={`Edit ${chatContext.characterContext.name}`} onClick={() => chatContext.openCharacterEntry(chatContext.characterContext!)} /> : <Icon.Person width={20} height={20} />}
									<span>{chatContext.characterContext.name}</span>
								</span>
							) : 'AI'
						)}
					</div>
					{m.mensaje && messages.editingMsgId === m.id_mensaje ? (
							<div className="nw-msg-edit-area">
								<textarea
									className="nw-msg-edit-textarea"
									value={messages.editingMsgText}
									onChange={e => messages.setEditingMsgText(e.target.value)}
									onKeyDown={e => {
										if (e.key === 'Enter' && !e.shiftKey) {
											e.preventDefault();
											void messages.saveEditedMessage(m.id_mensaje);
										}
										if (e.key === 'Escape') messages.cancelEdit();
									}}
									rows={10}
									autoFocus
								/>
								<div className="nw-msg-edit-actions">
									<button className="nw-btn nw-btn-primary" onClick={() => void messages.saveEditedMessage(m.id_mensaje)}>Save</button>
									<button className="nw-btn" onClick={messages.cancelEdit}>Cancel</button>
								</div>
							</div>
						) : (
							<MessageContent plugin={plugin} message={m} resolveText={resolveText} />
						)}
					{m.imagenes?.length > 0 && <div className="nw-msg-images">
						{m.imagenes.map((url: string, index: number) => (
							<div key={`${url}-${index}`} className="nw-msg-image-wrapper">
								<img src={url} alt={`Generated image ${index + 1}`} onClick={() => images.setLightboxSrc(url)} style={{ cursor: 'pointer' }} />
								<div className="nw-msg-image-actions">
									<button className="nw-msg-image-download-btn" title="Image options" onClick={() => images.setImageDropdown(prev => prev?.index === index ? null : { index, searchQuery: '' })}>
										<Icon.Download width={14} height={14} />
									</button>
									{images.imageDropdown?.index === index && (
										<div className="nw-image-menu-dropdown">
											<button className="nw-context-row" onClick={() => images.downloadImage(url, `imagen-${index + 1}`)}>
												<Icon.Download width={14} height={14} /> Download
											</button>
											<button className="nw-context-row" onClick={() => { void images.saveImageToVault(url, `imagen-${index + 1}`); }}>
												<Icon.Save width={14} height={14} /> Save to Vault
											</button>
											<div className="nw-image-menu-codex-section">
												<div className="nw-image-menu-codex-header">Add to Codex entry</div>
												<input
													className="nw-input"
													placeholder="Search..."
													value={images.imageDropdown.searchQuery}
													onChange={e => images.setImageDropdown(prev => prev ? { ...prev, searchQuery: e.target.value } : null)}
												/>
												<div className="nw-image-menu-codex-list">
													{images.imageCodexCategories.map(({ category, entries: categoryEntries }) => (
														<section key={category.id_categoria} className="nw-context-category">
															<div className="nw-context-category-title">{category.nombre}</div>
															{categoryEntries.map(entry => (
																<button
																	key={entry.id_entrada_codex}
																	className="nw-context-row nw-context-entry"
																	onClick={() => images.handleImageToCodexEntry(entry.id_entrada_codex, url)}
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
													{images.imageCodexCategories.length === 0 && <span className="nw-image-menu-empty">No entries found.</span>}
												</div>
											</div>
										</div>
									)}
								</div>
							</div>
						))}
					</div>}
					{(m.mensaje || snapshot.undoable.includes(m.id_mensaje)) && messages.editingMsgId !== m.id_mensaje && (
						<div className="nw-msg-actions">
							<button className="nw-msg-action-btn" title="Edit" onClick={() => messages.startEditMessage(m.id_mensaje, m.mensaje)}>
								<Icon.Edit width={13} height={13} />
							</button>
							<button className="nw-msg-action-btn" title="Copy to clipboard" onClick={() => void messages.copyToClipboard(resolveText(m.mensaje))}>
								<Icon.Copy width={13} height={13} />
							</button>
							{m.role === 'assistant' && (
								<>
									{session && snapshot.undoable.includes(m.id_mensaje) && (
										<UndoAnswerButton plugin={plugin} session={session} messageId={m.id_mensaje} disabled={busy} />
									)}
									<button className="nw-msg-action-btn" title="Regenerate" disabled={busy} onClick={() => void regenerateMessage()}>
										<Icon.Refresh width={13} height={13} />
									</button>
									<button className="nw-msg-action-btn" title="Save as note" onClick={() => void messages.saveAsNote(resolveText(m.mensaje))}>
										<Icon.SaveAlt width={13} height={13} />
									</button>
								</>
							)}
							<button className="nw-msg-action-btn nw-msg-action-delete" title="Delete message" onClick={() => void messages.handleDeleteMessage(m.id_mensaje)}>
								<Icon.X width={13} height={13} />
							</button>
						</div>
					)}
					{m.created_at && (
						<div className="nw-msg-timestamp">{formatTimestamp(m.created_at)}</div>
					)}
				</div>
			))}
			<ChatLiveTurn plugin={plugin} session={session} snapshot={snapshot} resolveText={resolveText} />
		</div>
		<div className='nw-chat-input-container'>
			<div className="nw-chat-context-bar">
				<div style={{ display: "flex", gap: "4px" }}>
					<button className="nw-btn-link nw-btn-small nw-chat-context-trigger" onClick={() => { chatContext.setContextOpen(open => !open); chatContext.setContextMenu('root'); chatContext.setQuery(''); }}>@</button>
					<div className="nw-context-badges">
						{chatContext.activeNoteItem &&
							<button key={chatContext.activeNoteItem.id} className={`nw-context-badge nw-context-badge-${chatContext.activeNoteItem.kind}`} onClick={() => void chatContext.openContextItem(chatContext.activeNoteItem!)} title={`Open ${chatContext.activeNoteItem.name}`}>
								{kindIcon(chatContext.activeNoteItem.kind)}<span>{chatContext.activeNoteItem.name}</span><span className="nw-context-badge-remove" role="button" aria-label={`Remove ${chatContext.activeNoteItem.name}`} onClick={event => { event.stopPropagation(); chatContext.removeActiveNote(); }}><Icon.X width={12} height={12} /></span>
							</button>
						}
						{chatContext.contextItems.map(item =>
							<button
								key={item.id}
								className={`nw-context-badge nw-context-badge-${item.kind}`}
								onClick={() => void chatContext.openContextItem(item)}
								title={`Open ${item.name}`}
							>
								{item.kind === 'codex' && item.thumbnail
									? <img src={item.thumbnail} alt="" />
									: kindIcon(item.kind)}
								<span>{item.name}</span>
								<span
									className="nw-context-badge-remove"
									role="button"
									aria-label={`Remove ${item.name}`}
									onClick={event => { event.stopPropagation(); chatContext.updateContextItems(items => items.filter(existing => existing.id !== item.id)); }}
								>
									<Icon.X width={12} height={12} />
								</span>
							</button>
						)}
					</div>
				</div>
				{chatContext.contextOpen && <div className="nw-context-dropdown">
					<div className="nw-context-dropdown-list">
						{chatContext.contextMenu !== 'root' && <button className="nw-context-row nw-context-back" onClick={() => chatContext.setContextMenu('root')}><Icon.Back width={14} height={14} /> Back</button>}
						{chatContext.contextMenu === 'root' && !chatContext.isRootSearching && <>{([['codex', 'Codex'], ['chapters', 'Chapters'], ['outlines', 'Outlines'], ['notes', 'Notes'], ['folders', 'Folders'], ['characters', 'Character']] as Array<[ContextMenu, string]>).map(([menu, label]) => <button className="nw-context-row" key={menu} onClick={() => chatContext.setContextMenu(menu)}>{label}<Icon.ChevronRight width={14} height={14} /></button>)}{chatContext.characterContext && <button className="nw-context-row" onClick={() => chatContext.setContextMenu('impersonate')}>Impersonate<Icon.ChevronRight width={14} height={14} /></button>}<button className="nw-context-row" disabled={!chatContext.activeFile} onClick={() => { chatContext.refreshActiveNote(); chatContext.setContextOpen(false); chatContext.setContextMenu('root'); }}>{kindIcon('active-note')} Active Note</button></>}
						{chatContext.contextMenu === 'root' && chatContext.isRootSearching && <>
							{chatContext.filteredCategories.length > 0 && <section className="nw-context-category"><div className="nw-context-category-title">Codex</div>{chatContext.filteredCategories.flatMap(({ category, entries: categoryEntries }) => categoryEntries.map(entry => <button key={entry.id_entrada_codex} className="nw-context-row nw-context-entry" onClick={() => void chatContext.addCodexEntryContext(entry, category.color)}><span className="nw-context-category-line" style={{ backgroundColor: entry.color ?? category.color }} />{entry.thumbnail ? <img src={entry.thumbnail} alt="" className="nw-context-entry-thumbnail" /> : <span className="nw-context-entry-thumbnail" />}{entry.nombre}</button>))}</section>}
							{chatContext.groupedChaptersForContext.map(({ acto, chapters }) => <section key={`ch-${acto.id_acto}`} className="nw-context-category"><div className="nw-context-category-title">Chapters — {acto.nombre}</div>{chapters.map(chapter => <button key={chapter.id_capitulo} className="nw-context-row" onClick={() => void chatContext.selectChapter(chapter.id_capitulo)}>{kindIcon('chapter')}{chapter.nombre}</button>)}</section>)}
							{chatContext.groupedOutlinesForContext.map(({ acto, chapters }) => <section key={`ol-${acto.id_acto}`} className="nw-context-category"><div className="nw-context-category-title">Outlines — {acto.nombre}</div>{chapters.map(chapter => <button key={chapter.id_capitulo} className="nw-context-row" onClick={() => chatContext.selectOutline(chapter.id_capitulo)}>{kindIcon('outline')}{chapter.nombre}</button>)}</section>)}
							{chatContext.filteredNotes.length > 0 && <section className="nw-context-category"><div className="nw-context-category-title">Notes</div>{chatContext.filteredNotes.map(file => <button key={file.path} className="nw-context-row nw-context-file" onClick={() => void chatContext.addFileContext(file, 'note')}>{kindIcon('note')}<span>{file.basename}<small>{file.path}</small></span></button>)}</section>}
							{chatContext.filteredFolders.length > 0 && <section className="nw-context-category"><div className="nw-context-category-title">Folders</div>{chatContext.filteredFolders.map(folder => <button key={folder.path} className="nw-context-row nw-context-file" onClick={() => void chatContext.addFolderContext(folder)}>{kindIcon('folder')}<span>{folder.name}<small>{folder.path}</small></span></button>)}</section>}
							{chatContext.characterEntries.length > 0 && <section className="nw-context-category"><div className="nw-context-category-title">Characters</div>{chatContext.characterEntries.map(entry => <button key={entry.id_entrada_codex} className="nw-context-row nw-context-entry" onClick={() => void chatContext.addCharacterContext(entry)}>{entry.thumbnail ? <img src={entry.thumbnail} alt="" className="nw-context-entry-thumbnail" /> : <span className="nw-context-entry-thumbnail" />}{entry.nombre}</button>)}</section>}
							{chatContext.characterContext && chatContext.characterEntries.length > 0 && <section className="nw-context-category"><div className="nw-context-category-title">Impersonate</div>{chatContext.characterEntries.map(entry => <button key={entry.id_entrada_codex} className="nw-context-row nw-context-entry" onClick={() => chatContext.addImpersonateContext(entry)}>{entry.thumbnail ? <img src={entry.thumbnail} alt="" className="nw-context-entry-thumbnail" /> : <span className="nw-context-entry-thumbnail" />}{entry.nombre}</button>)}</section>}
							{chatContext.activeNoteMatchesQuery && <button className="nw-context-row" onClick={() => { chatContext.refreshActiveNote(); chatContext.setContextOpen(false); chatContext.setContextMenu('root'); }}>{kindIcon('active-note')} {chatContext.activeFile!.basename}</button>}
							{!chatContext.hasRootSearchResults && <span className="nw-context-row" style={{ color: 'var(--text-muted)', cursor: 'default' }}>No results found.</span>}
						</>}
						{chatContext.contextMenu === 'codex' && chatContext.filteredCategories.map(({ category, entries: categoryEntries }) => <section key={category.id_categoria} className="nw-context-category"><div className="nw-context-category-title">{category.nombre}</div>{categoryEntries.map(entry => <button key={entry.id_entrada_codex} className="nw-context-row nw-context-entry" onClick={() => void chatContext.addCodexEntryContext(entry, category.color)}><span className="nw-context-category-line" style={{ backgroundColor: entry.color ?? category.color }} />{entry.thumbnail ? <img src={entry.thumbnail} alt="" className="nw-context-entry-thumbnail" /> : <span className="nw-context-entry-thumbnail" />}{entry.nombre}</button>)}</section>)}
						{chatContext.contextMenu === 'characters' && (
							<>
								{chatContext.characterEntries.length > 0 ? chatContext.characterEntries.map(entry => (
									<button key={entry.id_entrada_codex} className="nw-context-row nw-context-entry" onClick={() => void chatContext.addCharacterContext(entry)}>
										{entry.thumbnail ? <img src={entry.thumbnail} alt="" className="nw-context-entry-thumbnail" /> : <span className="nw-context-entry-thumbnail" />}
										{entry.nombre}
									</button>
								)) : <span className="nw-context-row" style={{color: 'var(--text-muted)', cursor: 'default'}}>No characters available.</span>}
							</>
						)}
						{chatContext.contextMenu === 'impersonate' && (
							<>
								{chatContext.characterEntries.length > 0 ? chatContext.characterEntries.map(entry => (
									<button key={entry.id_entrada_codex} className="nw-context-row nw-context-entry" onClick={() => chatContext.addImpersonateContext(entry)}>
										{entry.thumbnail ? <img src={entry.thumbnail} alt="" className="nw-context-entry-thumbnail" /> : <span className="nw-context-entry-thumbnail" />}
										{entry.nombre}
									</button>
								)) : <span className="nw-context-row" style={{color: 'var(--text-muted)', cursor: 'default'}}>No characters available.</span>}
							</>
						)}
						{chatContext.contextMenu === 'chapters' && chatContext.groupedChaptersForContext.map(({ acto, chapters }) => <section key={acto.id_acto} className="nw-context-category"><div className="nw-context-category-title">{acto.nombre}</div>{chapters.map(chapter => <button key={chapter.id_capitulo} className="nw-context-row" onClick={() => void chatContext.selectChapter(chapter.id_capitulo)}>{kindIcon('chapter')}{chapter.nombre}</button>)}</section>)}
						{chatContext.contextMenu === 'outlines' && chatContext.groupedOutlinesForContext.map(({ acto, chapters }) => <section key={acto.id_acto} className="nw-context-category"><div className="nw-context-category-title">{acto.nombre}</div>{chapters.map(chapter => <button key={chapter.id_capitulo} className="nw-context-row" onClick={() => chatContext.selectOutline(chapter.id_capitulo)}>{kindIcon('outline')}{chapter.nombre}</button>)}</section>)}
						{chatContext.contextMenu === 'notes' && chatContext.filteredNotes.map(file => <button key={file.path} className="nw-context-row nw-context-file" onClick={() => void chatContext.addFileContext(file, 'note')}>{kindIcon('note')}<span>{file.basename}<small>{file.path}</small></span></button>)}
						{chatContext.contextMenu === 'folders' && chatContext.filteredFolders.map(folder => <button key={folder.path} className="nw-context-row nw-context-file" onClick={() => void chatContext.addFolderContext(folder)}>{kindIcon('folder')}<span>{folder.name}<small>{folder.path}</small></span></button>)}
					</div>
					<div className="nw-context-search"><input className="nw-input" autoFocus value={chatContext.query} onChange={event => chatContext.setQuery(event.target.value)} placeholder="Search..." /></div>
				</div>}
			</div>
			<div className="nw-chat-input">
				<textarea
					ref={images.textareaRef}
					className="nw-chat-textarea"
					value={input}
					onChange={e => setInput(e.target.value)}
					onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) {
						e.preventDefault(); void send();
					} }}
					placeholder={chatContext.impersonateContext ? `Write a message as ${chatContext.impersonateContext.name}...` : chatContext.characterContext ? `Write a message to ${chatContext.characterContext.name}...` : 'Write a message...'}
					rows={3}
				/>
			</div>
			{images.uploadedImages.length > 0 && (
				<div className="nw-chat-uploaded-images">
					{images.uploadedImages.map((url, index) => (
						<div key={index} className="nw-chat-uploaded-image-wrapper">
							<img src={url} alt={`Uploaded image ${index + 1}`} className="nw-chat-uploaded-image-thumb" />
							<button className="nw-chat-uploaded-image-remove" title="Remove image" onClick={() => images.removeUploadedImage(index)}>
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
						title={chatContext.characterContext
							? 'Tools are disabled while roleplaying a character'
							: 'Let the AI read and edit chapters, outlines and codex entries'}
					>
						<input
							type="checkbox"
							checked={toolsEnabled && !chatContext.characterContext}
							disabled={!!chatContext.characterContext}
							onChange={event => setToolsEnabled(event.target.checked)}
						/>
						Tools
					</label>
						<label
							className="nw-chat-tools-toggle"
							title="Let the AI apply its edits without asking for each one. You can still stop it at any time."
						>
							<input
								type="checkbox"
								checked={autoApprove}
								disabled={!toolsEnabled || !!chatContext.characterContext}
								onChange={event => toggleAutoApprove(event.target.checked)}
							/>
							Auto-approve
						</label>
					<label
						className="nw-chat-tools-toggle"
						title={!bible.storyBible
							? 'Set up the novel in Novel Setup to use a story bible'
							: chatContext.characterContext
							? 'While roleplaying only the language of the story is sent'
							: 'Send the premise, style, tense and language of the novel'}
					>
						<input
							type="checkbox"
							checked={bible.bibleEnabled && !!bible.storyBible}
							disabled={!bible.storyBible}
							onChange={event => bible.setBibleEnabled(event.target.checked)}
						/>
						Story bible
					</label>
					<ChatModelSelector settings={plugin.settings} />
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
					{chatContext.characterContext && (
						<div className="nw-character-badge">
							{chatContext.characterContext.thumbnail ? <img src={chatContext.characterContext.thumbnail} alt="" className="nw-character-badge-thumb" /> : null}
							<span className="nw-character-badge-name">{chatContext.characterContext.name}</span>
							<span className="nw-character-badge-mode">Char</span>
							<button className="nw-character-badge-remove" onClick={chatContext.removeCharacterContext} title="Remove character">
								<Icon.X width={12} height={12} />
							</button>
						</div>
					)}
					{chatContext.impersonateContext && (
						<div className="nw-character-badge nw-impersonate-badge">
							{chatContext.impersonateContext.thumbnail ? <img src={chatContext.impersonateContext.thumbnail} alt="" className="nw-character-badge-thumb" /> : null}
							<span className="nw-character-badge-name">{chatContext.impersonateContext.name}</span>
							<span className="nw-character-badge-mode">User</span>
							<button className="nw-character-badge-remove" onClick={chatContext.removeImpersonateContext} title="Remove character">
								<Icon.X width={12} height={12} />
							</button>
						</div>
					)}
				</div>
				<div style={{ display: "flex", justifyContent: "flex-end", gap: "4px"}}>
					{supportsVision && (
						<button className="nw-btn-link" title="Upload image" onClick={() => images.fileInputRef.current?.click()}>
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
			ref={images.fileInputRef}
			style={{ display: 'none' }}
			accept="image/*"
			multiple
			onChange={images.handleImageUpload}
		/>
		{images.lightboxSrc && createPortal(
			<div className="nw-lightbox-overlay" onClick={() => images.setLightboxSrc(null)}>
				<div className="nw-lightbox-content" onClick={(e) => e.stopPropagation()}>
					<button className="nw-lightbox-close" onClick={() => images.setLightboxSrc(null)} title="Close">
						<Icon.X width={24} height={24} />
					</button>
					<img src={images.lightboxSrc} alt="Full-size image" className="nw-lightbox-image" />
				</div>
			</div>,
			document.body
		)}
	</div>;
}
