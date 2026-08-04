import { useState, useEffect, useMemo, useRef } from 'react';
import { Notice, TFile, TFolder } from 'obsidian';
import { useNovelWriter } from '../../store/novelWriterStore';
import type NovelWriterPlugin from '../../../../../main';
import { ApiFactory } from '../../../../factories/api-factory';
import { Icon } from '../../components/Icon';
import { openEntryModal } from '../codex/CodexEntryModal';
import { getActiveModelConfig } from '../../../../infrastructure/settings/active-model';

type ContextKind = 'codex' | 'chapter' | 'outline' | 'note' | 'folder' | 'active-note';
type ContextItem = {
	id: string;
	kind: ContextKind;
	name: string;
	path?: string;
	content: string;
	thumbnail?: string | null;
	chapterId?: string;
	categoryColor?: string;
};
type ContextMenu = 'root' | 'codex' | 'chapters' | 'outlines' | 'notes' | 'folders';
const chatContexts = new Map<string, ContextItem[]>();

const stripFrontmatter = (content: string) => content.replace(/^---\s*\r?\n[\s\S]*?\r?\n---\s*(?:\r?\n)?/, '');
const includesQuery = (query: string, ...values: Array<string | null | undefined>) =>
	values.join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());

export function ChatTab({ plugin }: { plugin: NovelWriterPlugin }) {
	const { activeChatId, selectChat, appendMensaje, createChat, store, categorias, entradas, capitulos, setEditingEntry, setSidebarTab } = useNovelWriter();
	const [input, setInput] = useState('');
	const [mensajes, setMensajes] = useState<any[]>([]);
	const [busy, setBusy] = useState(false);
	const [contextItems, setContextItems] = useState<ContextItem[]>(() => activeChatId ? chatContexts.get(activeChatId) ?? [] : []);
	const [contextOpen, setContextOpen] = useState(false);
	const [contextMenu, setContextMenu] = useState<ContextMenu>('root');
	const [query, setQuery] = useState('');
	const [modelMenuOpen, setModelMenuOpen] = useState(false);
	const [modelVersion, setModelVersion] = useState(0);
	const scrollRef = useRef<HTMLDivElement>(null);
	const initialActiveNotePath = useRef<string | null>(null);

	const markdownFiles = useMemo(() => plugin.app.vault.getMarkdownFiles(), [plugin, contextOpen]);
	const folders = useMemo(() => plugin.app.vault.getAllLoadedFiles().filter((file): file is TFolder => file instanceof TFolder), [plugin, contextOpen]);
	const activeFile = plugin.app.workspace.getActiveFile();
	const notes = useMemo(() => {
		if (!activeFile?.parent) return [];
		return markdownFiles.filter(file => file.parent?.path === activeFile.parent?.path);
	}, [activeFile?.path, markdownFiles]);

	useEffect(() => {
		if (!activeChatId || !store) { setMensajes([]); return; }
		store.readChat(activeChatId).then(c => setMensajes(c?.mensajes ?? []));
	}, [activeChatId, store]);
	useEffect(() => { setContextItems(activeChatId ? chatContexts.get(activeChatId) ?? [] : []); }, [activeChatId]);

	useEffect(() => { scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight); }, [mensajes]);

	const updateContextItems = (updater: (items: ContextItem[]) => ContextItem[]) => {
		setContextItems(items => {
			const next = updater(items);
			if (activeChatId) chatContexts.set(activeChatId, next);
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

	const addFileContext = async (file: TFile, kind: 'note' | 'active-note') => {
		try {
			const content = kind === 'active-note'
				? await plugin.app.vault.read(file)
				: await plugin.app.vault.read(file);
			addContext({ id: `${kind}:${file.path}`, kind, name: file.basename, path: file.path, content: stripFrontmatter(content) });
		} catch (error) {
			new Notice(`No se pudo leer ${file.path}: ${String(error)}`);
		}
	};

	useEffect(() => {
		if (!activeFile || initialActiveNotePath.current === activeFile.path) return;
		initialActiveNotePath.current = activeFile.path;
		void addFileContext(activeFile, 'active-note');
	}, [activeFile?.path]);

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

	const openContextItem = async (item: ContextItem) => {
		if (item.kind === 'codex') {
			setSidebarTab('codex');
			openEntryModal(plugin, item.id.replace('codex:', ''));
			return;
		}
		if (item.kind === 'outline' && item.chapterId) { await plugin.openOutlineChapter(item.chapterId); return; }
		if (item.kind === 'active-note') return;
		if (item.path) {
			if (item.kind === 'folder') {
				await plugin.app.workspace.openLinkText(item.path, '', false);
			} else await plugin.app.workspace.openLinkText(item.path, '', false);
		}
	};

	const contextPrompt = () => {
		const groups: Array<[ContextKind, string]> = [
			['codex', 'Entradas de Codex seleccionadas'], ['chapter', 'Capítulos seleccionados'], ['outline', 'Outlines seleccionados'],
			['note', 'Notas seleccionadas'], ['folder', 'Carpetas seleccionadas'], ['active-note', 'Nota activa seleccionada'],
		];
		return groups.map(([kind, title]) => {
			const items = contextItems.filter(item => item.kind === kind);
			if (!items.length) return '';
			return `${title}:\n${items.map(item => `--- ${item.name}${item.path ? ` (${item.path})` : ''} ---\n${item.content}`).join('\n\n')}`;
		}).filter(Boolean).join('\n\n');
	};

	const send = async () => {
		const t = input.trim();
		if (!t) return;
		let chatId = activeChatId;
		if (!chatId) {
			const created = await createChat('Chat sin nombre');
			if (!created) return;
			chatId = created.id_chat;
			selectChat(chatId);
		}
		setInput('');
		await appendMensaje('user', t);
		setMensajes(m => [...m, { id_mensaje: 'tmp_u', role: 'user', mensaje: t, created_at: '' }]);
		setBusy(true);
		try {
			const settings = plugin.settings.data;
			const activeModel = getActiveModelConfig(settings);
			if (!activeModel.modelName) throw new Error('Configura un modelo activo en Settings.');
			const token = settings.apiToken[activeModel.providerId] ?? '';
			const api = new ApiFactory().createApi(activeModel.providerId, token);
			const history = [...mensajes, { role: 'user', mensaje: t }]
				.filter(m => m.role === 'user' || m.role === 'assistant')
				.map(m => ({ role: m.role, content: m.mensaje }));
			const selectedContext = contextPrompt();
			const prompt = `${selectedContext ? `Contexto seleccionado explícitamente por el usuario:\n${selectedContext}\n\n` : ''}${history.map(m => `${m.role === 'user' ? 'Usuario' : 'IA'}: ${m.content}`).join('\n\n')}\n\nIA: `;
			const result = await api.generateCompletion(prompt, activeModel.modelName, { ...activeModel.options, stream: false });
			const reply = result.text ?? '(sin respuesta)';
			await appendMensaje('assistant', reply);
			setMensajes(m => [...m, { id_mensaje: 'tmp_a', role: 'assistant', mensaje: reply, created_at: '' }]);
		} catch (e: any) {
			const err = 'Error: ' + (e?.message ?? String(e));
			await appendMensaje('assistant', err);
			setMensajes(m => [...m, { id_mensaje: 'tmp_e', role: 'assistant', mensaje: err, created_at: '' }]);
		}
		setBusy(false);
	};

	const renderIcon = (kind: ContextKind) => <span className="nw-context-icon">{kind === 'chapter' ? '📖' : kind === 'outline' ? '📜' : kind === 'folder' ? '📁' : '📝'}</span>;
	const filteredChapters = capitulos.filter(chapter => includesQuery(query, chapter.nombre));
	const filteredFolders = folders.filter(folder => includesQuery(query, folder.name, folder.path));
	const filteredNotes = (query ? markdownFiles : notes).filter(file => includesQuery(query, file.basename, file.path));
	const filteredCategories = categorias.map(category => ({ category, entries: entradas.filter(entry => !entry.archivado && entry.id_categoria === category.id_categoria && includesQuery(query, entry.nombre, entry.alias, entry.descripcion)) })).filter(group => group.entries.length);

	return <div className="nw-chat">
		<div className="nw-chat-messages" ref={scrollRef}>{mensajes.map(m => <div key={m.id_mensaje} className={`nw-msg nw-msg-${m.role}`}><div className="nw-msg-role">{m.role === 'user' ? 'Tu' : 'IA'}</div><div className="nw-msg-body">{m.mensaje}</div></div>)}{busy && <div className="nw-msg nw-msg-assistant"><em>...escribiendo...</em></div>}</div>
		<div className="nw-chat-context-bar">
			<div className="nw-context-badges">{contextItems.map(item => <button key={item.id} className={`nw-context-badge nw-context-badge-${item.kind}`} onClick={() => void openContextItem(item)} title={`Abrir ${item.name}`}>
				{item.kind === 'codex' && item.thumbnail ? <img src={item.thumbnail} alt="" /> : renderIcon(item.kind)}<span>{item.name}</span><span className="nw-context-badge-remove" role="button" aria-label={`Quitar ${item.name}`} onClick={event => { event.stopPropagation(); updateContextItems(items => items.filter(existing => existing.id !== item.id)); }}><Icon.X width={12} height={12} /></span>
			</button>)}</div>
			<button className="nw-btn nw-chat-context-trigger" onClick={() => { setContextOpen(open => !open); setContextMenu('root'); setQuery(''); }}><Icon.Plus width={14} height={14} /> Contexto</button>
			{contextOpen && <div className="nw-context-dropdown">
				<div className="nw-context-dropdown-list">
					{contextMenu !== 'root' && <button className="nw-context-row nw-context-back" onClick={() => setContextMenu('root')}><Icon.Back width={14} height={14} /> Volver</button>}
					{contextMenu === 'root' && <>{([['codex', 'Codex'], ['chapters', 'Capítulos'], ['outlines', 'Outlines'], ['notes', 'Notas'], ['folders', 'Carpetas']] as Array<[ContextMenu, string]>).map(([menu, label]) => <button className="nw-context-row" key={menu} onClick={() => setContextMenu(menu)}>{label}<Icon.ChevronRight width={14} height={14} /></button>)}<button className="nw-context-row" disabled={!activeFile} onClick={() => activeFile && void addFileContext(activeFile, 'active-note')}>{renderIcon('active-note')} Nota Activa</button></>}
					{contextMenu === 'codex' && filteredCategories.map(({ category, entries: categoryEntries }) => <section key={category.id_categoria} className="nw-context-category"><div className="nw-context-category-title">{category.nombre}</div>{categoryEntries.map(entry => <button key={entry.id_entrada_codex} className="nw-context-row nw-context-entry" onClick={() => addContext({ id: `codex:${entry.id_entrada_codex}`, kind: 'codex', name: entry.nombre, content: entry.descripcion, thumbnail: entry.thumbnail, categoryColor: entry.color ?? category.color })}><span className="nw-context-category-line" style={{ backgroundColor: entry.color ?? category.color }} />{entry.thumbnail ? <img src={entry.thumbnail} alt="" className="nw-context-entry-thumbnail" /> : <span className="nw-context-entry-thumbnail" />}{entry.nombre}</button>)}</section>)}
					{contextMenu === 'chapters' && filteredChapters.filter(chapter => !!chapter.archivo).map(chapter => <button key={chapter.id_capitulo} className="nw-context-row" onClick={() => void selectChapter(chapter.id_capitulo)}>{renderIcon('chapter')}{chapter.nombre}</button>)}
					{contextMenu === 'outlines' && filteredChapters.map(chapter => <button key={chapter.id_capitulo} className="nw-context-row" onClick={() => selectOutline(chapter.id_capitulo)}>{renderIcon('outline')}{chapter.nombre}</button>)}
					{contextMenu === 'notes' && filteredNotes.map(file => <button key={file.path} className="nw-context-row nw-context-file" onClick={() => void addFileContext(file, 'note')}>{renderIcon('note')}<span>{file.basename}<small>{file.path}</small></span></button>)}
					{contextMenu === 'folders' && filteredFolders.map(folder => <button key={folder.path} className="nw-context-row nw-context-file" onClick={() => void addFolderContext(folder)}>{renderIcon('folder')}<span>{folder.name}<small>{folder.path}</small></span></button>)}
				</div>
				{contextMenu !== 'root' && <div className="nw-context-search"><input className="nw-input" autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Filtrar..." /></div>}
			</div>}
		</div>
		<div className="nw-chat-input"><textarea className="nw-chat-textarea" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }} placeholder="Escribe un mensaje..." rows={2} /><button className="nw-btn nw-btn-primary" onClick={() => void send()} disabled={busy}>Enviar</button></div>
		<div className="nw-chat-model-selector" key={modelVersion}>
			<span className="nw-chat-model-label" role="button" tabIndex={0} onClick={() => setModelMenuOpen(open => !open)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setModelMenuOpen(open => !open); } }}>
				{plugin.settings.data.modelos.find(model => model.id_modelo === plugin.settings.data.modeloPredeterminadoId)?.nombre_listado ?? 'Sin modelo activo'}
				<Icon.ChevronDown width={14} height={14} className={modelMenuOpen ? 'nw-chat-model-chevron-open' : 'nw-chat-model-chevron-closed'} />
			</span>
			{modelMenuOpen && <div className="nw-chat-model-dropdown">{plugin.settings.data.modelos.length ? plugin.settings.data.modelos.map(model => <button key={model.id_modelo} className="nw-context-row" onClick={() => {
				plugin.settings.data.modeloPredeterminadoId = model.id_modelo;
				void plugin.settings.save(); setModelMenuOpen(false); setModelVersion(version => version + 1);
			}}>{model.nombre_listado}</button>) : <span>No hay modelos creados.</span>}</div>}
		</div>
	</div>;
}
