import { App, Modal, TFile } from 'obsidian';
import { Root, createRoot } from 'react-dom/client';
import React from 'react';
import { Icon } from '../../../components/Icon';
import type { Categoria, EntityId } from '../../../../../domain';
import type { ImportGroup } from '../../../../../utils/lorebookImport';

export interface ImportReviewEntry {
	file: TFile;
	nombre: string;
}

export interface ImportReviewGroup {
	key: string;
	nombre: string;
	existingCategoriaId: EntityId | null;
	entries: ImportReviewEntry[];
}

/** Modal that lets the author edit categories and reassign entries before a lorebook import is written to disk. */
export class LorebookImportReviewModal extends Modal {
	private root: Root | null = null;
	private initialGroups: ImportReviewGroup[];
	private categorias: Categoria[];
	private resolveResult: (value: ImportGroup[] | null) => void = () => {};
	private settled = false;

	constructor(app: App, initialGroups: ImportReviewGroup[], categorias: Categoria[]) {
		super(app);
		this.initialGroups = initialGroups;
		this.categorias = categorias;
		this.modalEl.addClass('nw-modal-large');
	}

	waitForResult(): Promise<ImportGroup[] | null> {
		return new Promise((resolve) => { this.resolveResult = resolve; });
	}

	onOpen() {
		this.titleEl.setText('Review lorebook import');
		this.root = createRoot(this.contentEl);
		this.root.render(
			React.createElement(ImportReviewView, {
				initialGroups: this.initialGroups,
				categorias: this.categorias,
				onCancel: () => this.finish(null),
				onAccept: (groups: ImportGroup[]) => this.finish(groups),
			})
		);
	}

	private finish(value: ImportGroup[] | null) {
		if (this.settled) return;
		this.settled = true;
		this.resolveResult(value);
		this.close();
	}

	onClose() {
		if (this.root) { this.root.unmount(); this.root = null; }
		this.finish(null);
	}
}

function ImportReviewView({
	initialGroups,
	categorias,
	onCancel,
	onAccept,
}: {
	initialGroups: ImportReviewGroup[];
	categorias: Categoria[];
	onCancel: () => void;
	onAccept: (groups: ImportGroup[]) => void;
}) {
	const [groups, setGroups] = React.useState<ImportReviewGroup[]>(initialGroups);
	const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set());

	const toggleCollapsed = (key: string) => setCollapsed((prev) => {
		const next = new Set(prev);
		if (next.has(key)) next.delete(key); else next.add(key);
		return next;
	});

	const updateGroup = (key: string, patch: Partial<ImportReviewGroup>) => {
		setGroups((prev) => prev.map((g) => (g.key === key ? { ...g, ...patch } : g)));
	};

	const removeGroup = (key: string) => setGroups((prev) => prev.filter((g) => g.key !== key));

	const removeEntry = (groupKey: string, filePath: string) => {
		setGroups((prev) => prev.map((g) => (
			g.key === groupKey ? { ...g, entries: g.entries.filter((e) => e.file.path !== filePath) } : g
		)));
	};

	const renameEntry = (groupKey: string, filePath: string, nombre: string) => {
		setGroups((prev) => prev.map((g) => (
			g.key === groupKey
				? { ...g, entries: g.entries.map((e) => (e.file.path === filePath ? { ...e, nombre } : e)) }
				: g
		)));
	};

	const moveEntry = (filePath: string, fromKey: string, toKey: string) => {
		if (fromKey === toKey) return;
		setGroups((prev) => {
			const source = prev.find((g) => g.key === fromKey);
			const entry = source?.entries.find((e) => e.file.path === filePath);
			if (!entry) return prev;
			return prev.map((g) => {
				if (g.key === fromKey) return { ...g, entries: g.entries.filter((e) => e.file.path !== filePath) };
				if (g.key === toKey) return { ...g, entries: [...g.entries, entry] };
				return g;
			});
		});
	};

	const totalEntries = groups.reduce((sum, g) => sum + g.entries.length, 0);
	const totalCategories = groups.filter((g) => g.entries.length > 0).length;

	const accept = () => {
		onAccept(
			groups
				.filter((g) => g.entries.length > 0)
				.map((g) => ({
					nombre: g.nombre,
					existingCategoriaId: g.existingCategoriaId ?? undefined,
					entries: g.entries,
				}))
		);
	};

	return (
		<div className="nw-import-review">
			<p className="nw-muted">
				{totalEntries === 1 ? '1 entry' : `${totalEntries} entries`} will be imported into{' '}
				{totalCategories === 1 ? '1 category' : `${totalCategories} categories`}. Edit names below, drag entries into
				another category, or remove what you don't want to import.
			</p>
			<div className="nw-import-review-list">
				{groups.map((group) => (
					<ImportReviewGroupRow
						key={group.key}
						group={group}
						categorias={categorias}
						open={!collapsed.has(group.key)}
						onToggle={() => toggleCollapsed(group.key)}
						onChangeTarget={(existingCategoriaId, nombre) => updateGroup(group.key, { existingCategoriaId, nombre })}
						onChangeName={(nombre) => updateGroup(group.key, { nombre })}
						onRemoveGroup={() => removeGroup(group.key)}
						onDropEntry={(filePath, fromKey) => moveEntry(filePath, fromKey, group.key)}
						onRemoveEntry={(filePath) => removeEntry(group.key, filePath)}
						onRenameEntry={(filePath, nombre) => renameEntry(group.key, filePath, nombre)}
					/>
				))}
				{groups.length === 0 && <p className="nw-muted">Nothing left to import.</p>}
			</div>
			<div className="nw-import-review-footer">
				<button className="nw-btn" onClick={onCancel}>Cancel</button>
				<button className="nw-btn nw-btn-primary" disabled={totalEntries === 0} onClick={accept}>Accept</button>
			</div>
		</div>
	);
}

function ImportReviewGroupRow({
	group,
	categorias,
	open,
	onToggle,
	onChangeTarget,
	onChangeName,
	onRemoveGroup,
	onDropEntry,
	onRemoveEntry,
	onRenameEntry,
}: {
	group: ImportReviewGroup;
	categorias: Categoria[];
	open: boolean;
	onToggle: () => void;
	onChangeTarget: (existingCategoriaId: EntityId | null, nombre: string) => void;
	onChangeName: (nombre: string) => void;
	onRemoveGroup: () => void;
	onDropEntry: (filePath: string, fromGroupKey: string) => void;
	onRemoveEntry: (filePath: string) => void;
	onRenameEntry: (filePath: string, nombre: string) => void;
}) {
	const [dragOver, setDragOver] = React.useState(false);
	const isNew = !group.existingCategoriaId;
	const selectValue = group.existingCategoriaId ?? '__new__';

	const handleSelectChange = (value: string) => {
		if (value === '__new__') { onChangeTarget(null, group.nombre); return; }
		const existing = categorias.find((c) => c.id_categoria === value);
		onChangeTarget(value, existing?.nombre ?? group.nombre);
	};

	return (
		<div
			className={'nw-cat-group nw-import-review-group' + (dragOver ? ' nw-drag-over' : '')}
			onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
			onDragLeave={() => setDragOver(false)}
			onDrop={(event) => {
				event.preventDefault();
				setDragOver(false);
				const [fromKey, filePath] = event.dataTransfer.getData('text/plain').split('|');
				if (fromKey && filePath) onDropEntry(filePath, fromKey);
			}}
		>
			<div className="nw-cat-header" style={{ borderLeftColor: isNew ? 'var(--interactive-accent)' : '#888' }}>
				<button className="nw-cat-header-toggle" onClick={onToggle}>
					<span className="nw-cat-toggle-main">
						<span className="nw-cat-caret">{open ? <Icon.ChevronDown /> : <Icon.ChevronRight />}</span>
						<span className="nw-cat-name">{group.nombre.trim() || 'Unnamed'}</span>
					</span>
					<span className="nw-cat-count">
						{group.entries.length === 1 ? '1 entry' : `${group.entries.length} entries`}
					</span>
				</button>
				<button
					className="nw-btn nw-btn-icon nw-btn-transparent nw-cat-add"
					onClick={onRemoveGroup}
					title={`Remove category "${group.nombre.trim() || 'Unnamed'}" from the import`}
				>
					<Icon.Trash width={12} height={12} />
				</button>
			</div>
			<div className="nw-import-review-target">
				<select className="nw-input" value={selectValue} onChange={(event) => handleSelectChange(event.target.value)}>
					<option value="__new__">Create new category</option>
					{categorias.map((c) => (
						<option key={c.id_categoria} value={c.id_categoria}>Use existing: {c.nombre}</option>
					))}
				</select>
				{isNew && (
					<input
						className="nw-input"
						value={group.nombre}
						onChange={(event) => onChangeName(event.target.value)}
						placeholder="Category name"
					/>
				)}
			</div>
			{open && (
				<div className="nw-import-review-entries">
					{group.entries.length === 0 && (
						<p className="nw-muted nw-import-review-empty">Drag entries here.</p>
					)}
					{group.entries.map((entry) => (
						<div
							key={entry.file.path}
							className="nw-import-review-entry"
							draggable
							onDragStart={(event) => {
								event.dataTransfer.effectAllowed = 'move';
								event.dataTransfer.setData('text/plain', `${group.key}|${entry.file.path}`);
							}}
						>
							<span className="nw-import-review-drag-handle" aria-hidden="true">⠿</span>
							<input
								className="nw-import-review-entry-name"
								value={entry.nombre}
								onChange={(event) => onRenameEntry(entry.file.path, event.target.value)}
							/>
							<button
								className="nw-btn nw-btn-icon nw-btn-transparent"
								onClick={() => onRemoveEntry(entry.file.path)}
								title={`Remove "${entry.nombre}" from the import`}
							>
								<Icon.X width={11} height={11} />
							</button>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
