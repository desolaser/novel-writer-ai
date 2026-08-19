import { useState, useRef, useEffect } from 'react';
import { useNovelWriter } from '../../store/novelWriterStore';
import type NovelWriterPlugin from '../../../../../main';
import { AiContextPolicy } from '../../../../domain';
import { Icon } from '../../components/Icon';
import { Notice } from 'obsidian';
import NovelFolderPickerModal from './modals/NovelFolderPickerModal';
import { openEntryModal } from './modals/CodexEntryModal';
import { CategoriasModal } from './modals/CategoriasModal';
import { DetallesModal } from './modals/DetallesModal';
import CodexCategoryGroup from './CodexCategoryGroup';
import CodexFilters from './CodexFilters';
import CodexNewEntry from './CodexNewEntry';
import { EMPTY_FILTERS } from './types/Filters';
import type { Filters } from './types/Filters';


export function CodexPanel({ plugin }: { plugin: NovelWriterPlugin }) {
	const { categorias, entradas, tags, setEditingEntry, createEntry, deleteEntry } = useNovelWriter();
	const [query, setQuery] = useState('');
    const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
	const [configMenuOpen, setConfigMenuOpen] = useState(false);
	const [importBusy, setImportBusy] = useState(false);
	const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
	const [deleteMode, setDeleteMode] = useState(false);
	const [selectedForDeletion, setSelectedForDeletion] = useState<Set<string>>(new Set());
	const configRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		const onDoc = (e: MouseEvent) => {
			if (configRef.current && !configRef.current.contains(e.target as Node)) setConfigMenuOpen(false);
		};
		document.addEventListener('mousedown', onDoc);
		return () => document.removeEventListener('mousedown', onDoc);
	}, []);

	const createAndEdit = async (idCat: string) => {
		const otros = categorias.find(c => c.nombre === 'Others');
		const finalCat = idCat || (otros?.id_categoria ?? categorias[0]?.id_categoria);
		if (!finalCat) return;
		await createEntry(finalCat, '');
		setTimeout(() => {
			const ents = useNovelWriter.getState().entradas;
			const ultima = ents[ents.length - 1];
			if (ultima) { 
				setEditingEntry(ultima.id_entrada_codex);
				openEntryModal(plugin, ultima.id_entrada_codex);
			}
		}, 100);
	};

	const openModalDetail = () => { 
		setConfigMenuOpen(false); 
		new DetallesModal(plugin.app as any, plugin).open(); 
	};

	const openModalCategories = () => { 
		setConfigMenuOpen(false); 
		new CategoriasModal(plugin.app as any, plugin).open(); 
	};

	const openNovelImport = () => {
		setConfigMenuOpen(false);
		if (importBusy) return;
		new NovelFolderPickerModal(plugin.app, plugin, setImportBusy).open();
	};

	const startBatchDelete = () => {
		setConfigMenuOpen(false);
		setSelectedForDeletion(new Set());
		setDeleteMode(true);
		new Notice('Select entries to delete');
	};

	const cancelBatchDelete = () => { setDeleteMode(false); setSelectedForDeletion(new Set()); };

	const toggleDeletion = (id: string) => setSelectedForDeletion(previous => {
		const next = new Set(previous);
		if (next.has(id)) next.delete(id); else next.add(id);
		return next;
	});

	const confirmBatchDelete = async () => {
		const count = selectedForDeletion.size;
		if (!count || !confirm(`Are you sure you want to delete ${count} entries?`)) return;
		for (const id of selectedForDeletion) await deleteEntry(id);
		cancelBatchDelete();
		new Notice(`Deleted ${count} entries`);
	};

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
	const collapseAll = () => { 
		setConfigMenuOpen(false); 
		setCollapsed(new Set(allCatIds())); 
	};
	const openAll = () => { 
		setConfigMenuOpen(false); 
		setCollapsed(new Set()); 
	};

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

	return (
		<div className="nw-panel">
			<div className="nw-panel-toolbar nw-panel-toolbar-combined">
				<input className="nw-input" placeholder="Search..." value={query} onChange={(e) => setQuery(e.target.value)} />
				<CodexFilters filters={filters} setFilters={setFilters} />
				<CodexNewEntry createAndEdit={createAndEdit} />				
				<div ref={configRef} style={{ position: 'relative' }}>
					<button className="nw-btn nw-btn-icon" onClick={() => setConfigMenuOpen(!configMenuOpen)} title="Codex Menu">
						<Icon.MenuThreePoints />
					</button>
					{configMenuOpen && (
						<div className="nw-dropdown nw-popover" style={{ minWidth: 200, right: 0, left: 'auto' }}>
							<div className="nw-popover-item" onClick={openAll}><span>Open all</span></div>
							<div className="nw-popover-item" onClick={collapseAll}><span>Collapse all</span></div>
							<hr style={{ margin: '4px 0', border: 0, borderTop: '1px solid var(--background-modifier-border)' }} />
							<div className="nw-popover-item" onClick={openModalDetail}><span>Custom Details</span></div>
							<div className="nw-popover-item" onClick={openModalCategories}><span>Categories</span></div>
							<div className="nw-popover-item" onClick={startBatchDelete}><span>Delete Entries</span></div>
							<div className="nw-popover-item" onClick={() => { 
								setConfigMenuOpen(false); 
								void plugin.importLorebook(); 
							}}><span>Import lorebook</span></div>
							<div className={'nw-popover-item' + (importBusy ? ' is-disabled' : '')} onClick={importBusy ? undefined : openNovelImport}><span>Import novel</span></div>
						</div>
					)}
				</div>
			</div>
			{deleteMode && <div className="nw-codex-batch-actions">
				<button 
					className="nw-btn nw-btn-danger" 
					disabled={selectedForDeletion.size === 0} 
					onClick={() => void confirmBatchDelete()}>
					Delete entries
				</button>
				<button 
					className="nw-btn" 
					onClick={cancelBatchDelete}>
					Cancel deletion
				</button>
			</div>}
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
						deleteMode={deleteMode}
						selectedForDeletion={selectedForDeletion}
						onToggleDeletion={toggleDeletion}
					/>
				))}
				{!filters.isArchived && noCat.length > 0 && (
					<CodexCategoryGroup
						catId={NO_CAT_KEY}
						catName="No category"
						catColor="#888"
						open={isCatOpen(NO_CAT_KEY)}
						onToggle={() => toggleCat(NO_CAT_KEY)}
						entries={noCat}
						tags={tags}
						onEdit={(entryId) => openEntryModal(plugin, entryId)}
						onAddInCategory={() => createAndEdit('')}
						deleteMode={deleteMode}
						selectedForDeletion={selectedForDeletion}
						onToggleDeletion={toggleDeletion}
					/>
				)}
				{filtered.length === 0 && (
					<p className="nw-muted" style={{ padding: '12px', fontSize: 12 }}>No entries match the filters.</p>
				)}
			</div>
		</div>
	);
}