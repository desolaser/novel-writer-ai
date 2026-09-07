import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Notice, TFile, TFolder } from 'obsidian';
import type NovelWriterPlugin from '../../../../main';
import type { ChatContextItem, ChatContextKind } from '../../../domain';
import { useNovelWriter } from '../store/novelWriterStore';
import { Icon } from './Icon';

/**
 * Reusable "@" context selector: codex entries, chapters, outlines, vault notes,
 * folders and the active note. Owns no state beyond its own menu; the selected
 * items live in the caller, which decides how they reach the prompt.
 */

type Menu = 'root' | 'codex' | 'chapters' | 'outlines' | 'notes' | 'folders';

const stripFrontmatter = (content: string) => content.replace(/^---\s*\r?\n[\s\S]*?\r?\n---\s*(?:\r?\n)?/, '');

const includesQuery = (query: string, ...values: Array<string | null | undefined>) =>
	!query.trim() || values.some((value) => (value ?? '').toLowerCase().includes(query.trim().toLowerCase()));

const kindIcon = (kind: ChatContextKind) => (
	<span className="nw-context-icon">
		{kind === 'chapter' ? '📖' : kind === 'outline' ? '📜' : kind === 'folder' ? '📁' : kind === 'character' ? '🧑' : '📝'}
	</span>
);

export function ContextPicker({
	plugin,
	items,
	onChange,
	excludeEntryId,
	dropDown = false,
}: {
	plugin: NovelWriterPlugin;
	items: ChatContextItem[];
	onChange: (items: ChatContextItem[]) => void;
	/** Codex entry hidden from the list, typically the one being edited. */
	excludeEntryId?: string;
	/** Open the list downwards instead of upwards. */
	dropDown?: boolean;
}) {
	const { entradas, categorias, capitulos, store } = useNovelWriter() as any;
	const [open, setOpen] = useState(false);
	const [menu, setMenu] = useState<Menu>('root');
	const [query, setQuery] = useState('');
	const wrapRef = useRef<HTMLDivElement | null>(null);

	const markdownFiles = useMemo(() => plugin.app.vault.getMarkdownFiles(), [plugin, open]);
	const folders = useMemo(
		() => plugin.app.vault.getAllLoadedFiles().filter((file): file is TFolder => file instanceof TFolder),
		[plugin, open],
	);
	const activeFile = plugin.app.workspace.getActiveFile();

	useEffect(() => {
		if (!open) return;
		const onDoc = (event: MouseEvent) => {
			if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
		};
		document.addEventListener('mousedown', onDoc);
		return () => document.removeEventListener('mousedown', onDoc);
	}, [open]);

	const add = (item: ChatContextItem) => {
		if (!items.some((existing) => existing.id === item.id)) onChange([...items, item]);
		setOpen(false);
		setMenu('root');
		setQuery('');
	};
	const remove = (id: string) => onChange(items.filter((item) => item.id !== id));

	const addFile = async (file: TFile) => {
		try {
			const content = await plugin.app.vault.read(file);
			add({ id: `note:${file.path}`, kind: 'note', name: file.basename, path: file.path, content: stripFrontmatter(content) });
		} catch (error) { new Notice(`Could not read ${file.path}: ${String(error)}`); }
	};

	const addFolder = async (folder: TFolder) => {
		try {
			const prefix = `${folder.path}/`;
			const files = markdownFiles.filter((file) => file.path.startsWith(prefix));
			const contents = await Promise.all(files.map(async (file) => `--- ${file.path} ---\n${stripFrontmatter(await plugin.app.vault.read(file))}`));
			add({ id: `folder:${folder.path}`, kind: 'folder', name: folder.name, path: folder.path, content: contents.join('\n\n') });
		} catch (error) { new Notice(`Could not read folder ${folder.path}: ${String(error)}`); }
	};

	const addActiveNote = async () => {
		if (!activeFile) return;
		try {
			const content = await plugin.app.vault.read(activeFile);
			add({ id: `active-note:${activeFile.path}`, kind: 'active-note', name: activeFile.basename, path: activeFile.path, content: stripFrontmatter(content) });
		} catch (error) { new Notice(`Could not read the active note: ${String(error)}`); }
	};

	const addChapter = async (chapterId: string) => {
		if (!store) return;
		try {
			const chapter = capitulos.find((item: any) => item.id_capitulo === chapterId);
			if (!chapter?.archivo) return;
			const content = await store.readCapituloTexto(chapterId);
			add({ id: `chapter:${chapterId}`, kind: 'chapter', name: chapter.nombre, path: chapter.archivo, chapterId, content: stripFrontmatter(content) });
		} catch (error) { new Notice(`Could not read the chapter: ${String(error)}`); }
	};

	const addOutline = (chapterId: string) => {
		const chapter = capitulos.find((item: any) => item.id_capitulo === chapterId);
		if (!chapter) return;
		add({ id: `outline:${chapterId}`, kind: 'outline', name: chapter.nombre, chapterId, content: chapter.outline ?? '' });
	};

	const filteredChapters = capitulos.filter((chapter: any) => includesQuery(query, chapter.nombre));
	const filteredFolders = folders.filter((folder) => includesQuery(query, folder.name, folder.path));
	const filteredNotes = markdownFiles.filter((file) => includesQuery(query, file.basename, file.path)).slice(0, 100);
	const filteredCategories = categorias
		.map((category: any) => ({
			category,
			entries: entradas.filter((entry: any) =>
				!entry.archivado
				&& entry.id_entrada_codex !== excludeEntryId
				&& entry.id_categoria === category.id_categoria
				&& includesQuery(query, entry.nombre, entry.alias, entry.descripcion)),
		}))
		.filter((group: any) => group.entries.length);

	const rootMenus: Array<[Menu, string]> = [
		['codex', 'Codex'],
		['chapters', 'Chapters'],
		['outlines', 'Outlines'],
		['notes', 'Notes'],
		['folders', 'Folders'],
	];

	return (
		<div className="nw-context-bar" ref={wrapRef}>
			<div style={{ display: 'flex', gap: 4, alignItems: 'flex-start' }}>
				<button
					type="button"
					className="nw-btn-link nw-btn-small nw-chat-context-trigger"
					onClick={() => { setOpen((value) => !value); setMenu('root'); setQuery(''); }}
					title="Add context"
				>@</button>
				<div className="nw-context-badges">
					{items.map((item) => (
						<span key={item.id} className={`nw-context-badge nw-context-badge-${item.kind}`} title={item.name}>
							{item.kind === 'codex' && item.thumbnail ? <img src={item.thumbnail} alt="" /> : kindIcon(item.kind)}
							<span>{item.name}</span>
							<span className="nw-context-badge-remove" role="button" aria-label={`Remove ${item.name}`} onClick={() => remove(item.id)}>
								<Icon.X width={12} height={12} />
							</span>
						</span>
					))}
				</div>
			</div>
			{open && (
				<div className={`nw-context-dropdown${dropDown ? ' nw-context-dropdown-down' : ''}`}>
					<div className="nw-context-dropdown-list">
						{menu !== 'root' && (
							<button type="button" className="nw-context-row nw-context-back" onClick={() => setMenu('root')}>
								<Icon.Back width={14} height={14} /> Back
							</button>
						)}
						{menu === 'root' && (
							<>
								{rootMenus.map(([value, label]) => (
									<button type="button" className="nw-context-row" key={value} onClick={() => setMenu(value)}>
										{label}<Icon.ChevronRight width={14} height={14} />
									</button>
								))}
								<button type="button" className="nw-context-row" disabled={!activeFile} onClick={() => void addActiveNote()}>
									{kindIcon('active-note')} Active Note
								</button>
							</>
						)}
						{menu === 'codex' && filteredCategories.map(({ category, entries }: any) => (
							<section key={category.id_categoria} className="nw-context-category">
								<div className="nw-context-category-title">{category.nombre}</div>
								{entries.map((entry: any) => (
									<button
										type="button"
										key={entry.id_entrada_codex}
										className="nw-context-row nw-context-entry"
										onClick={() => add({ id: `codex:${entry.id_entrada_codex}`, kind: 'codex', name: entry.nombre, content: entry.descripcion, thumbnail: entry.thumbnail, categoryColor: entry.color ?? category.color })}
									>
										<span className="nw-context-category-line" style={{ backgroundColor: entry.color ?? category.color }} />
										{entry.thumbnail ? <img src={entry.thumbnail} alt="" className="nw-context-entry-thumbnail" /> : <span className="nw-context-entry-thumbnail" />}
										{entry.nombre}
									</button>
								))}
							</section>
						))}
						{menu === 'chapters' && filteredChapters.filter((chapter: any) => !!chapter.archivo).map((chapter: any) => (
							<button type="button" key={chapter.id_capitulo} className="nw-context-row" onClick={() => void addChapter(chapter.id_capitulo)}>
								{kindIcon('chapter')}{chapter.nombre}
							</button>
						))}
						{menu === 'outlines' && filteredChapters.map((chapter: any) => (
							<button type="button" key={chapter.id_capitulo} className="nw-context-row" onClick={() => addOutline(chapter.id_capitulo)}>
								{kindIcon('outline')}{chapter.nombre}
							</button>
						))}
						{menu === 'notes' && filteredNotes.map((file) => (
							<button type="button" key={file.path} className="nw-context-row nw-context-file" onClick={() => void addFile(file)}>
								{kindIcon('note')}<span>{file.basename}<small>{file.path}</small></span>
							</button>
						))}
						{menu === 'folders' && filteredFolders.map((folder) => (
							<button type="button" key={folder.path} className="nw-context-row nw-context-file" onClick={() => void addFolder(folder)}>
								{kindIcon('folder')}<span>{folder.name}<small>{folder.path}</small></span>
							</button>
						))}
					</div>
					{menu !== 'root' && (
						<div className="nw-context-search">
							<input className="nw-input" autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter..." />
						</div>
					)}
				</div>
			)}
		</div>
	);
}
