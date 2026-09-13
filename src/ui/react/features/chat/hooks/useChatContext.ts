import { useCallback, useEffect, useMemo, useState } from 'react';
import { Notice, TFile, TFolder } from 'obsidian';
import type NovelWriterPlugin from '../../../../../../main';
import type { Acto, Capitulo, Categoria, EntradaCodex } from '../../../../../domain';
import { isCharacterCategory } from '../../../../../utils/categories';
import { openEntryModal } from '../../codex/modals/CodexEntryModal';
import { stripFrontmatter, includesQuery, groupChaptersByAct } from '../chatContextHelpers';
import type { ContextItem } from '../promptBuilder';

export type ContextMenu = 'root' | 'codex' | 'chapters' | 'outlines' | 'notes' | 'folders' | 'characters' | 'impersonate';

interface UseChatContextParams {
	plugin: NovelWriterPlugin;
	store: any;
	activeChatId: string | null;
	mensajesCount: number;
	capitulos: Capitulo[];
	actos: Acto[];
	categorias: Categoria[];
	entradas: EntradaCodex[];
	setSidebarTab: (tab: any) => void;
	saveChatContext: (chatId: string, items: ContextItem[], charCtx: ContextItem | null, impCtx: ContextItem | null) => Promise<void> | void;
	/** Posts the character's opening line to the conversation once, when it starts empty. */
	onCharacterOpeningMessage: (text: string) => Promise<void>;
}

/**
 * Owns the "@" context picker: selected codex/chapter/outline/note/folder context,
 * the character/impersonate personas, and the active note. Everything the chat
 * context dropdown needs to render is derived and returned from here, so `ChatTab`
 * only wires the JSX to it.
 */
export function useChatContext({
	plugin, store, activeChatId, mensajesCount, capitulos, actos, categorias, entradas, setSidebarTab, saveChatContext, onCharacterOpeningMessage,
}: UseChatContextParams) {
	const [contextItems, setContextItems] = useState<ContextItem[]>([]);
	const [contextOpen, setContextOpen] = useState(false);
	const [contextMenu, setContextMenu] = useState<ContextMenu>('root');
	const [query, setQuery] = useState('');
	const [characterContext, setCharacterContext] = useState<ContextItem | null>(null);
	const [impersonateContext, setImpersonateContext] = useState<ContextItem | null>(null);
	const [activeNoteItem, setActiveNoteItem] = useState<ContextItem | null>(null);

	const markdownFiles = useMemo(() => plugin.app.vault.getMarkdownFiles(), [plugin, contextOpen]);
	const folders = useMemo(
		() => plugin.app.vault.getAllLoadedFiles().filter((file): file is TFolder => file instanceof TFolder),
		[plugin, contextOpen],
	);
	const activeFile = plugin.app.workspace.getActiveFile();
	const notes = useMemo(() => {
		if (!activeFile?.parent) return [];
		return markdownFiles.filter(file => file.parent?.path === activeFile.parent?.path);
	}, [activeFile?.path, markdownFiles]);

	// Load persisted context when the chat changes
	useEffect(() => {
		if (!activeChatId || !store) {
			setContextItems([]);
			setCharacterContext(null);
			setImpersonateContext(null);
			return;
		}
		store.readChat(activeChatId).then((c: any) => {
			setContextItems(c?.contextItems ?? []);
			setCharacterContext(c?.characterContext ?? null);
			setImpersonateContext(c?.impersonateContext ?? null);
		});
	}, [activeChatId, store]);

	// Persist context to disk whenever it changes
	const persistContext = useCallback((items: ContextItem[], charCtx: ContextItem | null, impCtx: ContextItem | null) => {
		if (!activeChatId) return;
		void saveChatContext(activeChatId, items, charCtx, impCtx);
	}, [activeChatId, saveChatContext]);

	// The portrait opens the character sheet, so an edit made there has to reach the
	// conversation: the persona is stored as a snapshot and would otherwise keep
	// sending the old description to the model.
	useEffect(() => {
		if (!characterContext && !impersonateContext) return;
		const sync = (item: ContextItem | null, prefix: string): ContextItem | null => {
			if (!item) return null;
			const entry = entradas.find(e => `${prefix}:${e.id_entrada_codex}` === item.id);
			if (!entry) return item;
			const unchanged = entry.nombre === item.name
				&& entry.descripcion === item.content
				&& (entry.thumbnail ?? null) === (item.thumbnail ?? null);
			if (unchanged) return item;
			return { ...item, name: entry.nombre, content: entry.descripcion, thumbnail: entry.thumbnail, categoryColor: entry.color ?? undefined };
		};
		const nextCharacter = sync(characterContext, 'character');
		const nextImpersonate = sync(impersonateContext, 'impersonate');
		if (nextCharacter === characterContext && nextImpersonate === impersonateContext) return;
		setCharacterContext(nextCharacter);
		setImpersonateContext(nextImpersonate);
		persistContext(contextItems, nextCharacter, nextImpersonate);
	}, [entradas, characterContext, impersonateContext, contextItems, persistContext]);

	const updateContextItems = useCallback((updater: (items: ContextItem[]) => ContextItem[]) => {
		setContextItems(items => {
			const next = updater(items);
			persistContext(next, characterContext, impersonateContext);
			return next;
		});
	}, [persistContext, characterContext, impersonateContext]);

	const addContext = useCallback((item: ContextItem) => {
		updateContextItems(items => items.some(existing => existing.id === item.id) ? items : [...items, item]);
		setContextOpen(false);
		setContextMenu('root');
		setQuery('');
	}, [updateContextItems]);

	const addFolderContext = useCallback(async (folder: TFolder) => {
		try {
			const prefix = `${folder.path}/`;
			const files = markdownFiles.filter(file => file.path.startsWith(prefix));
			const contents = await Promise.all(files.map(async file => `--- ${file.path} ---\n${stripFrontmatter(await plugin.app.vault.read(file))}`));
			addContext({ id: `folder:${folder.path}`, kind: 'folder', name: folder.name, path: folder.path, content: contents.join('\n\n') });
		} catch (error) { new Notice(`Could not read folder ${folder.path}: ${String(error)}`); }
	}, [markdownFiles, plugin, addContext]);

	const addFileContext = useCallback(async (file: TFile, kind: 'note') => {
		try {
			const content = await plugin.app.vault.read(file);
			addContext({ id: `${kind}:${file.path}`, kind, name: file.basename, path: file.path, content: stripFrontmatter(content) });
		} catch (error) {
			new Notice(`Could not read ${file.path}: ${String(error)}`);
		}
	}, [plugin, addContext]);

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

	const selectChapter = useCallback(async (chapterId: string) => {
		if (!store) return;
		try {
			const chapter = capitulos.find(item => item.id_capitulo === chapterId);
			if (!chapter?.archivo) return;
			const content = await store.readCapituloTexto(chapterId);
			addContext({ id: `chapter:${chapterId}`, kind: 'chapter', name: chapter.nombre, path: chapter.archivo, chapterId, content: stripFrontmatter(content) });
		} catch (error) { new Notice(`Could not read the chapter: ${String(error)}`); }
	}, [store, capitulos, addContext]);

	const selectOutline = useCallback((chapterId: string) => {
		const chapter = capitulos.find(item => item.id_capitulo === chapterId);
		if (!chapter) return;
		addContext({ id: `outline:${chapterId}`, kind: 'outline', name: chapter.nombre, chapterId, content: chapter.outline ?? '' });
	}, [capitulos, addContext]);

	const addCharacterContext = useCallback(async (entry: EntradaCodex) => {
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
		// A conversation that has not started yet opens in the character's voice, so
		// the author has something to answer instead of a blank chat. An ongoing one
		// is left alone: the opening line would land in the middle of the scene.
		const opening = (entry.first_message ?? '').trim();
		if (!opening || !activeChatId || mensajesCount > 0) return;
		await onCharacterOpeningMessage(opening);
	}, [persistContext, contextItems, impersonateContext, activeChatId, mensajesCount, onCharacterOpeningMessage]);

	/**
	 * The portrait next to a roleplay message is a shortcut to the character sheet:
	 * the author is reading the scene and wants to fix the persona, not zoom in.
	 */
	const openCharacterEntry = useCallback((item: ContextItem) => {
		const entryId = item.id.replace(/^(character|impersonate):/, '');
		if (entryId) openEntryModal(plugin, entryId);
	}, [plugin]);

	const removeCharacterContext = useCallback(() => {
		setCharacterContext(null);
		persistContext(contextItems, null, impersonateContext);
	}, [persistContext, contextItems, impersonateContext]);

	const addImpersonateContext = useCallback((entry: EntradaCodex) => {
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
	}, [persistContext, contextItems, characterContext]);

	const removeImpersonateContext = useCallback(() => {
		setImpersonateContext(null);
		persistContext(contextItems, characterContext, null);
	}, [persistContext, contextItems, characterContext]);

	const openContextItem = useCallback(async (item: ContextItem) => {
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
	}, [plugin, setSidebarTab]);

	const filteredChapters = capitulos.filter(chapter => includesQuery(query, chapter.nombre));
	const filteredFolders = folders.filter(folder => includesQuery(query, folder.name, folder.path));
	const filteredNotes = (query ? markdownFiles : notes).filter(file => includesQuery(query, file.basename, file.path));
	const filteredCategories = categorias
		.map(category => ({ category, entries: entradas.filter(entry => !entry.archivado && entry.id_categoria === category.id_categoria && includesQuery(query, entry.nombre, entry.alias, entry.descripcion)) }))
		.filter(group => group.entries.length);
	const groupedChaptersForContext = groupChaptersByAct(filteredChapters.filter(chapter => !!chapter.archivo), actos);
	const groupedOutlinesForContext = groupChaptersByAct(filteredChapters, actos);

	const personajeCategory = categorias.find(c => isCharacterCategory(c));
	const characterEntries = personajeCategory
		? entradas.filter(e => !e.archivado && e.id_categoria === personajeCategory.id_categoria && includesQuery(query, e.nombre, e.alias))
		: [];

	// Root-level search: true once the author has typed anything, at which point the
	// dropdown switches from "pick a category" to a flat, icon-differentiated list of
	// matches pulled from every category at once (codex, chapters, outlines, notes,
	// folders, characters), copilot-style.
	const isRootSearching = contextMenu === 'root' && query.trim().length > 0;
	const activeNoteMatchesQuery = !!activeFile && includesQuery(query, activeFile.basename);
	const hasRootSearchResults = filteredCategories.length > 0
		|| groupedChaptersForContext.length > 0
		|| groupedOutlinesForContext.length > 0
		|| filteredNotes.length > 0
		|| filteredFolders.length > 0
		|| characterEntries.length > 0
		|| activeNoteMatchesQuery;

	return {
		contextItems, contextOpen, setContextOpen, contextMenu, setContextMenu, query, setQuery,
		characterContext, impersonateContext, activeNoteItem,
		markdownFiles, folders, activeFile, notes,
		addContext, addFolderContext, addFileContext, selectChapter, selectOutline,
		addCharacterContext, removeCharacterContext, addImpersonateContext, removeImpersonateContext,
		openContextItem, updateContextItems, refreshActiveNote, removeActiveNote, openCharacterEntry,
		filteredChapters, filteredFolders, filteredNotes, filteredCategories,
		groupedChaptersForContext, groupedOutlinesForContext, personajeCategory, characterEntries,
		isRootSearching, activeNoteMatchesQuery, hasRootSearchResults,
	};
}
