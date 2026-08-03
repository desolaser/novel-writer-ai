import React, { useState, useRef, useEffect } from 'react';
import { useNovelWriter } from '../../store/novelWriterStore';
import type NovelWriterPlugin from '../../../../../main';
import { AiContextPolicy } from '../../../../domain';
import { Icon } from '../../components/Icon';
import { CategoriasModal } from './CategoriasModal';
import { DetallesModal } from './DetallesModal';
import { openEntryModal } from './CodexEntryModal';

type TriState = null | true | false;
type Filters = {
	hasNotes: TriState;
	hasDescription: TriState;
	hasThumbnail: TriState;
	hasTags: TriState;
	isGlobal: TriState;
	isBeingTracked: TriState;
	isArchived: boolean;
	categoryFilters: Record<string, TriState>;
};

const EMPTY_FILTERS: Filters = {
	hasNotes: null, hasDescription: null, hasThumbnail: null, hasTags: null,
	isGlobal: null, isBeingTracked: null, isArchived: false, categoryFilters: {},
};

const TRUNC = 100;

function truncate(s: string | null | undefined, n: number): string {
	if (!s) return '';
	if (s.length <= n) return s;
	return s.slice(0, n).trimEnd() + '...';
}

export function CodexPanel({ plugin }: { plugin: NovelWriterPlugin }) {
	const { categorias, entradas, tags, setEditingEntry, createEntry } = useNovelWriter();
	const [query, setQuery] = useState('');
	const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
	const [filterMenuOpen, setFilterMenuOpen] = useState(false);
	const [filterCatSubOpen, setFilterCatSubOpen] = useState(false);
	const [filterStyle, setFilterStyle] = useState<React.CSSProperties>({});
	const [addMenuOpen, setAddMenuOpen] = useState(false);
	const [configMenuOpen, setConfigMenuOpen] = useState(false);
	const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
	const filterRef = useRef<HTMLDivElement | null>(null);
	const addRef = useRef<HTMLDivElement | null>(null);
	const configRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		const onDoc = (e: MouseEvent) => {
			if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
				setFilterMenuOpen(false); setFilterCatSubOpen(false);
			}
			if (addRef.current && !addRef.current.contains(e.target as Node)) setAddMenuOpen(false);
			if (configRef.current && !configRef.current.contains(e.target as Node)) setConfigMenuOpen(false);
		};
		document.addEventListener('mousedown', onDoc);
		return () => document.removeEventListener('mousedown', onDoc);
	}, []);

	useEffect(() => {
		if (!filterMenuOpen) { setFilterStyle({}); return; }
		const compute = () => {
			const btn = filterRef.current?.querySelector('button') as HTMLElement | null;
			if (!btn) return;
			const r = btn.getBoundingClientRect();
			const menuW = 240;
			const spaceRight = window.innerWidth - r.right;
			const spaceLeft = r.left;
			const flip = spaceRight < menuW && spaceLeft > spaceRight;
			setFilterStyle(flip
				? { right: 0, left: 'auto', top: '100%' }
				: { left: 0, right: 'auto', top: '100%' });
		};
		compute();
		window.addEventListener('resize', compute);
		return () => window.removeEventListener('resize', compute);
	}, [filterMenuOpen]);

	const createAndEdit = async (idCat: string) => {
		setAddMenuOpen(false);
		const otros = categorias.find(c => c.nombre === 'Otros');
		const finalCat = idCat || (otros?.id_categoria ?? categorias[0]?.id_categoria);
		if (!finalCat) return;
		await createEntry(finalCat, '');
		setTimeout(() => {
			const ents = useNovelWriter.getState().entradas;
			const ultima = ents[ents.length - 1];
			if (ultima) setEditingEntry(ultima.id_entrada_codex);
		}, 100);
	};

	const openModalDetail = () => { setConfigMenuOpen(false); new DetallesModal(plugin.app as any, plugin).open(); };
	const openModalCategories = () => { setConfigMenuOpen(false); new CategoriasModal(plugin.app as any, plugin).open(); };

	const cycle = (cur: TriState): TriState => cur === null ? true : cur === true ? false : null;
	const setFilter = (key: keyof Omit<Filters, 'categoryFilters' | 'isArchived'>, v?: TriState) => {
		setFilters((f) => ({ ...f, [key]: v !== undefined ? v : cycle(f[key]) }));
	};
	const setCategoryFilter = (catId: string) => {
		setFilters((f) => {
			const cur = f.categoryFilters[catId] ?? null;
			const next = cycle(cur);
			const map = { ...f.categoryFilters };
			if (next === null) delete map[catId]; else map[catId] = next;
			return { ...f, categoryFilters: map };
		});
	};
	const clearFilters = () => setFilters(EMPTY_FILTERS);

	const NO_CAT_KEY = '__no_cat__';
	const isCatOpen = (catId: string) => !collapsed.has(catId);
	const toggleCat = (catId: string) => {
		setCollapsed((prev) => {
			const next = new Set(prev);
			if (next.has(catId)) next.delete(catId); else next.add(catId);
			return next;
		});
	};
	const allCatIds = (): string[] => {
		const ids = categorias.filter((c) => filtered.some((e) => e.id_categoria === c.id_categoria)).map((c) => c.id_categoria);
		if (!filters.isArchived && noCat.length > 0) ids.push(NO_CAT_KEY);
		return ids;
	};
	const collapseAll = () => { setConfigMenuOpen(false); setCollapsed(new Set(allCatIds())); };
	const openAll = () => { setConfigMenuOpen(false); setCollapsed(new Set()); };

	const filtered = entradas.filter((e) => {
		if (filters.isArchived ? !e.archivado : e.archivado) return false;
		if (query) {
			const q = query.toLowerCase();
			const hay = `${e.nombre} ${e.alias} ${e.descripcion}`.toLowerCase();
			if (!hay.includes(q)) return false;
		}
		if (filters.hasNotes === true && !e.notas) return false;
		if (filters.hasNotes === false && e.notas) return false;
		if (filters.hasDescription === true && !e.descripcion) return false;
		if (filters.hasDescription === false && e.descripcion) return false;
		if (filters.hasThumbnail === true && !e.thumbnail) return false;
		if (filters.hasThumbnail === false && e.thumbnail) return false;
		if (filters.hasTags === true && !(e.tags && e.tags.length > 0)) return false;
		if (filters.hasTags === false && e.tags && e.tags.length > 0) return false;
		if (filters.isGlobal === true && e.ai_context_policy !== AiContextPolicy.Always) return false;
		if (filters.isGlobal === false && e.ai_context_policy === AiContextPolicy.Always) return false;
		if (filters.isBeingTracked === true && !e.tracking_por_nombre) return false;
		if (filters.isBeingTracked === false && e.tracking_por_nombre) return false;

		const catF = filters.categoryFilters[e.id_categoria];
		if (catF === false) return false;
		const positiveCats = Object.values(filters.categoryFilters).filter((v) => v === true);
		if (positiveCats.length > 0) {
			if (catF !== true) return false;
		}
		return true;
	});

	const catsWithEntries = categorias.filter((c) => filtered.some((e) => e.id_categoria === c.id_categoria));
	const noCat = filtered.filter((e) => !categorias.find((c) => c.id_categoria === e.id_categoria));

	const totalActiveFilters =
		(filters.hasNotes !== null ? 1 : 0) +
		(filters.hasDescription !== null ? 1 : 0) +
		(filters.hasThumbnail !== null ? 1 : 0) +
		(filters.hasTags !== null ? 1 : 0) +
		(filters.isGlobal !== null ? 1 : 0) +
		(filters.isBeingTracked !== null ? 1 : 0) +
		(filters.isArchived ? 1 : 0) +
		Object.values(filters.categoryFilters).filter((v) => v !== null).length;

	return (
		<div className="nw-panel">
			<div className="nw-panel-toolbar nw-panel-toolbar-combined">
				<input className="nw-input" placeholder="Buscar..." value={query} onChange={(e) => setQuery(e.target.value)} />
				<div ref={filterRef} style={{ position: 'relative' }}>
					<button
						className={'nw-btn nw-btn-icon nw-filter-btn' + (totalActiveFilters > 0 ? ' is-active' : '')}
						onClick={() => setFilterMenuOpen(!filterMenuOpen)}
						title="Filtros"
					>
						<Icon.Filter />
						{totalActiveFilters > 0 && <span className="nw-filter-badge">{totalActiveFilters}</span>}
					</button>
					{filterMenuOpen && (
						<div className="nw-dropdown nw-popover nw-filter-menu" style={{ minWidth: 220, ...filterStyle }}>
							<FilterItem label="Has notes" state={filters.hasNotes} onClick={() => setFilter('hasNotes')} />
							<FilterItem label="Has descripcion" state={filters.hasDescription} onClick={() => setFilter('hasDescription')} />
							<FilterItem label="Has thumbnail" state={filters.hasThumbnail} onClick={() => setFilter('hasThumbnail')} />
							<FilterItem label="Has tags" state={filters.hasTags} onClick={() => setFilter('hasTags')} />
							<FilterItem label="Is global" state={filters.isGlobal} onClick={() => setFilter('isGlobal')} hint="AI policy: Always" />
							<FilterItem label="Is being tracked" state={filters.isBeingTracked} onClick={() => setFilter('isBeingTracked')} hint="Tracking por nombre/alias" />
							<hr style={{ margin: '4px 0', border: 0, borderTop: '1px solid var(--background-modifier-border)' }} />
							<FilterItem
								label="Is archived"
								state={filters.isArchived ? true : null}
								noNegative
								onClick={() => setFilters((f) => ({ ...f, isArchived: !f.isArchived }))}
							/>
							<hr style={{ margin: '4px 0', border: 0, borderTop: '1px solid var(--background-modifier-border)' }} />
							<div className="nw-popover-row" onClick={() => setFilterCatSubOpen((v) => !v)}>
								<span style={{ flex: 1 }}>Filter by Category</span>
								<Icon.ChevronRight width={12} height={12} />
							</div>
							{filterCatSubOpen && (
								<div className="nw-filter-submenu">
									{categorias.length === 0 ? (
										<div className="nw-popover-item nw-muted" style={{ padding: '6px 10px' }}>Sin categorias</div>
									) : categorias.map((c) => {
										const st = filters.categoryFilters[c.id_categoria] ?? null;
										return (
											<FilterCategoryItem
												key={c.id_categoria}
												label={c.nombre}
												color={c.color}
												state={st}
												onClick={() => setCategoryFilter(c.id_categoria)}
											/>
										);
									})}
								</div>
							)}
							<hr style={{ margin: '4px 0', border: 0, borderTop: '1px solid var(--background-modifier-border)' }} />
							<div className={'nw-popover-row' + (totalActiveFilters === 0 ? ' is-disabled' : '')} onClick={totalActiveFilters === 0 ? undefined : clearFilters}>
								<span style={{ flex: 1 }}>Clear Filters</span>
							</div>
						</div>
					)}
				</div>
				<div ref={addRef} style={{ position: 'relative' }}>
					<button className="nw-btn nw-btn-primary nw-btn-add-entry" onClick={() => setAddMenuOpen(!addMenuOpen)} title="Nueva entrada">
						<Icon.Plus width={12} height={12} />
						<span>New Entry</span>
					</button>
					{addMenuOpen && (
						<div className="nw-dropdown nw-popover" style={{ minWidth: 200, right: 0, left: 'auto' }}>
							<div className="nw-popover-item" onClick={() => createAndEdit('')}>
								<span style={{ width: 14, display: 'inline-flex', justifyContent: 'center' }}><span className="nw-color-dot" style={{ background: 'transparent', boxShadow: 'inset 0 0 0 1px var(--background-modifier-border)' }} /></span>
								<span style={{ flex: 1 }}>Entrada Global (Otros)</span>
							</div>
							{categorias.map((c) => (
								<div key={c.id_categoria} className="nw-popover-item" onClick={() => createAndEdit(c.id_categoria)}>
									<span style={{ width: 14, display: 'inline-flex', justifyContent: 'center' }}><span className="nw-color-dot" style={{ background: c.color }} /></span>
									<span style={{ flex: 1 }}>{c.nombre}</span>
								</div>
							))}
						</div>
					)}
				</div>
				<div ref={configRef} style={{ position: 'relative' }}>
					<button className="nw-btn nw-btn-icon" onClick={() => setConfigMenuOpen(!configMenuOpen)} title="Codex Menu">
						<Icon.MenuThreePoints />
					</button>
					{configMenuOpen && (
						<div className="nw-dropdown nw-popover" style={{ minWidth: 200, right: 0, left: 'auto' }}>
							<div className="nw-popover-item" onClick={openAll}><span>Open all</span></div>
							<div className="nw-popover-item" onClick={collapseAll}><span>Collapse all</span></div>
							<hr style={{ margin: '4px 0', border: 0, borderTop: '1px solid var(--background-modifier-border)' }} />
							<div className="nw-popover-item" onClick={openModalDetail}><span>Detalles Custom</span></div>
							<div className="nw-popover-item" onClick={openModalCategories}><span>Categorias</span></div>
							<div className="nw-popover-item" onClick={() => { setConfigMenuOpen(false); void plugin.importLorebook(); }}><span>Importar lorebook</span></div>
						</div>
					)}
				</div>
			</div>
			<div className="nw-codex-list">
				{catsWithEntries.map((c) => (
					<CodexCategoryGroup
						key={c.id_categoria}
						catId={c.id_categoria}
						catName={c.nombre}
						catColor={c.color}
						open={isCatOpen(c.id_categoria)}
						onToggle={() => toggleCat(c.id_categoria)}
						entries={filtered.filter((e) => e.id_categoria === c.id_categoria)}
						tags={tags}
						onEdit={(entryId) => openEntryModal(plugin, entryId)}
						onAddInCategory={() => createAndEdit(c.id_categoria)}
					/>
				))}
				{!filters.isArchived && noCat.length > 0 && (
					<CodexCategoryGroup
						catId={NO_CAT_KEY}
						catName="Sin categoria"
						catColor="#888"
						open={isCatOpen(NO_CAT_KEY)}
						onToggle={() => toggleCat(NO_CAT_KEY)}
						entries={noCat}
						tags={tags}
						onEdit={(entryId) => openEntryModal(plugin, entryId)}
						onAddInCategory={() => createAndEdit('')}
					/>
				)}
				{filtered.length === 0 && (
					<p className="nw-muted" style={{ padding: '12px', fontSize: 12 }}>No hay entradas que coincidan con los filtros.</p>
				)}
			</div>
		</div>
	);
}

function FilterItem({ label, state, onClick, noNegative, hint }: { label: string; state: TriState; onClick: () => void; noNegative?: boolean; hint?: string }) {
	return (
		<div className="nw-popover-row" onClick={onClick} title={hint}>
			<span className="nw-filter-state-slot">
				{state === true && <Icon.Check width={12} height={12} />}
				{state === false && !noNegative && <Icon.Minus width={12} height={12} />}
			</span>
			<span style={{ flex: 1 }}>{label}</span>
		</div>
	);
}

function FilterCategoryItem({ label, color, state, onClick }: { label: string; color: string; state: TriState; onClick: () => void }) {
	return (
		<div className="nw-popover-row" onClick={onClick}>
			<span className="nw-filter-state-slot">
				{state === true && <Icon.Check width={12} height={12} />}
				{state === false && <Icon.Minus width={12} height={12} />}
			</span>
			<span className="nw-color-dot" style={{ background: color }} />
			<span style={{ flex: 1 }}>{label}</span>
		</div>
	);
}

function CodexCategoryGroup({ catId, catName, catColor, open, onToggle, entries, tags, onEdit, onAddInCategory }: { catId: string; catName: string; catColor: string; open: boolean; onToggle: () => void; entries: any[]; tags: any[]; onEdit: (id: string) => void; onAddInCategory: () => void }) {
	if (entries.length === 0) return null;
	return (
		<div className="nw-cat-group" data-cat-id={catId}>
			<div className="nw-cat-header" style={{ borderLeftColor: catColor }}>
				<button className="nw-cat-header-toggle" onClick={onToggle}>
					<span className="nw-cat-toggle-main">
						<span className="nw-cat-caret">{open ? <Icon.ChevronDown /> : <Icon.ChevronRight />}</span>
						<span className="nw-cat-name">{catName}</span>
					</span>
					<span className="nw-cat-count">
						{entries.length > 1 ? `Entries ${entries.length}` : `Entry ${entries.length}`}
					</span>
				</button>
				<button className="nw-btn nw-btn-icon nw-btn-transparent nw-cat-add" onClick={onAddInCategory} title={"Crear entrada en " + catName}>
					<Icon.Plus width={12} height={12} />
				</button>
			</div>
			{open && (
				<div className="nw-cat-entries">
					{entries.map((e) => (
						<CodexEntryRow key={e.id_entrada_codex} entry={e} tags={tags} onClick={() => onEdit(e.id_entrada_codex)} />
					))}
				</div>
			)}
		</div>
	);
}

function CodexEntryRow({ entry, tags, onClick }: { entry: any; tags: any[]; onClick: () => void }) {
	const entryTags = (entry.tags ?? [])
		.map((id: string) => tags.find((t: any) => t.id_tag === id))
		.filter(Boolean);
	const desc = truncate(entry.descripcion, TRUNC);
	return (
		<button className={"nw-entry nw-entry-row " + (entry.ai_context_policy === AiContextPolicy.Never ? 'never' : '')} onClick={onClick}>
			<div className="nw-entry-row-thumb">
				{entry.thumbnail ? (
					<img src={entry.thumbnail} alt="" className="nw-entry-thumb-img" />
				) : (
					<div className="nw-entry-thumb-empty">
						<Icon.Plus width={16} height={16} />
					</div>
				)}
			</div>
			<div className="nw-entry-row-content">
				<div className="nw-entry-name" style={entry.color ? { color: entry.color } : undefined}>
					{entry.nombre !== '' ? entry.nombre : 'Sin nombre'}
				</div>
				{entryTags.length > 0 && (
					<div className="nw-entry-tags-inline">
						{entryTags.map((t: any) => (
							<span key={t.id_tag} className="nw-tag-chip" style={t.color ? { background: t.color } : {}}>
								{t.nombre}
							</span>
						))}
					</div>
				)}
				{desc && <div className="nw-entry-desc">{desc}</div>}
			</div>
		</button>
	);
}
